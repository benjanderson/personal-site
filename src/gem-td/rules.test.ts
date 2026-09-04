import { describe, expect, it } from 'vitest'
import { SeededRandom } from './random'
import {
  beginNextPlacement,
  buyGemChance,
  craftPrism,
  craftSlate,
  completeWave,
  createInitialState,
  keepCandidate,
  moveCandidate,
  moveSlate,
  placeCandidate,
} from './rules'

describe('construction phase', () => {
  it('rolls exactly five candidates and then requires a keeper', () => {
    const random = new SeededRandom(17)
    let state = createInitialState()
    const cells = [
      { col: 5, row: 0 },
      { col: 6, row: 0 },
      { col: 7, row: 0 },
      { col: 8, row: 0 },
      { col: 9, row: 0 },
    ]

    for (const cell of cells) state = placeCandidate(state, cell, random).state

    expect(state.phase).toBe('choosing')
    expect(state.candidates).toHaveLength(5)
    expect(placeCandidate(state, { col: 10, row: 0 }, random).error).toBe('wrong-phase')
  })

  it('keeps one candidate and turns the other four into rocks', () => {
    const random = new SeededRandom(21)
    let state = createInitialState()
    for (let col = 5; col < 10; col += 1) {
      state = placeCandidate(state, { col, row: 0 }, random).state
    }

    const keeper = state.candidates[2]
    state = keepCandidate(state, keeper.id)

    expect(state.phase).toBe('wave')
    expect(state.towers).toEqual([keeper])
    expect(state.rocks).toHaveLength(4)
    expect(state.candidates).toHaveLength(0)
  })

  it('rejects occupied cells and immutable route anchors', () => {
    const random = new SeededRandom(4)
    const first = placeCandidate(createInitialState(), { col: 5, row: 0 }, random).state

    expect(placeCandidate(first, { col: 5, row: 0 }, random).error).toBe('occupied')
    expect(placeCandidate(first, { col: 86, row: 8 }, random).error).toBe('waypoint')
  })

  it('reroutes around a blocked fixed approach to waypoint one', () => {
    const random = new SeededRandom(14)
    const aboveLeft = placeCandidate(createInitialState(), { col: 85, row: 7 }, random)
    const onOriginalPath = placeCandidate(aboveLeft.state, { col: 85, row: 8 }, random)

    expect(aboveLeft.error).toBeUndefined()
    expect(onOriginalPath.error).toBeUndefined()
    expect(onOriginalPath.state.candidates).toHaveLength(2)
  })

  it('moves only current-round candidates without changing old blocks', () => {
    const random = new SeededRandom(9)
    const base = {
      ...createInitialState(),
      towers: [{ id: 50, col: 50, row: 20, kind: 'ember' as const, quality: 'rough' as const }],
      rocks: [{ col: 51, row: 20 }],
    }
    const placed = placeCandidate(base, { col: 52, row: 20 }, random).state
    const candidateId = placed.candidates[0].id
    const moved = moveCandidate(placed, candidateId, { col: 53, row: 20 })

    expect(moved.candidates[0]).toMatchObject({ col: 53, row: 20 })
    expect(moved.towers).toBe(base.towers)
    expect(moved.rocks).toBe(base.rocks)
    expect(moveCandidate(moved, candidateId, { col: 51, row: 20 })).toBe(moved)
  })

  it('settles wave bounty and buys chance only during rewards', () => {
    const waveState = { ...createInitialState(), phase: 'wave' as const, bounty: 8 }
    const rewardState = completeWave(waveState, 7)
    const upgraded = buyGemChance(rewardState)

    expect(rewardState.bounty).toBe(15)
    expect(upgraded.bounty).toBe(5)
    expect(upgraded.chanceLevel).toBe(1)
    expect(beginNextPlacement(upgraded).phase).toBe('placing')
    expect(buyGemChance(waveState)).toBe(waveState)
  })

  it('crafts each recipe atomically and moves slates only during rewards', () => {
    const base = createInitialState()
    const rewardState = {
      ...base,
      phase: 'reward' as const,
      towers: [
        { id: 1, col: 5, row: 0, kind: 'ember' as const, quality: 'cut' as const },
        { id: 2, col: 6, row: 0, kind: 'tide' as const, quality: 'radiant' as const },
        { id: 3, col: 7, row: 0, kind: 'volt' as const, quality: 'rough' as const },
        { id: 4, col: 8, row: 0, kind: 'moss' as const, quality: 'cut' as const },
      ],
      nextId: 5,
    }
    const withPrism = craftPrism(rewardState)
    const withSlate = craftSlate(withPrism)
    const moved = moveSlate(withSlate, 5, { col: 9, row: 3 })

    expect(withPrism.towers.filter((gem) => gem.kind === 'prism')).toHaveLength(1)
    expect(craftPrism(withPrism)).toBe(withPrism)
    expect(withSlate.slates).toEqual([{ id: 5, col: 7, row: 0 }])
    expect(withSlate.towers).toHaveLength(1)
    expect(moved.slates[0]).toMatchObject({ col: 9, row: 3 })
    expect(moveSlate(moved, 5, { col: 86, row: 8 })).toBe(moved)
  })
})
