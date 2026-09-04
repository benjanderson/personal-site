import { describe, expect, it } from 'vitest'
import { SeededRandom } from './random'

describe('SeededRandom', () => {
  it('replays the same sequence from the same seed', () => {
    const first = new SeededRandom(42)
    const second = new SeededRandom(42)

    expect(Array.from({ length: 8 }, () => first.nextInt(1, 100))).toEqual(
      Array.from({ length: 8 }, () => second.nextInt(1, 100)),
    )
  })

  it('keeps inclusive integer rolls in range', () => {
    const random = new SeededRandom(7)
    const rolls = Array.from({ length: 100 }, () => random.nextInt(2, 4))

    expect(rolls.every((roll) => roll >= 2 && roll <= 4)).toBe(true)
  })

  it('rejects invalid integer ranges', () => {
    expect(() => new SeededRandom(1).nextInt(4, 2)).toThrow(RangeError)
  })
})
