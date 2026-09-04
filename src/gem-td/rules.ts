import { CHANCE_COSTS, CHANCE_TABLE, GEM_KINDS, QUALITIES } from './content'
import { calculateRoute, isRouteAnchor } from './pathfinding'
import type { Cell, GameState, Gem, GemQuality } from './types'
import type { SeededRandom } from './random'

export const createInitialState = (): GameState => ({
  phase: 'placing',
  wave: 0,
  lives: 10,
  bounty: 0,
  chanceLevel: 0,
  candidates: [],
  towers: [],
  rocks: [],
  slates: [],
  enemies: [],
  nextId: 1,
})

const sameCell = (first: Cell, second: Cell): boolean =>
  first.col === second.col && first.row === second.row

const rollQuality = (chanceLevel: number, random: SeededRandom): GemQuality => {
  const weights = CHANCE_TABLE[chanceLevel]
  const roll = random.nextInt(1, weights[0] + weights[1] + weights[2])
  if (roll <= weights[0]) return QUALITIES[0]
  if (roll <= weights[0] + weights[1]) return QUALITIES[1]
  return QUALITIES[2]
}

export type PlaceResult = Readonly<{
  state: GameState
  gem?: Gem
  error?: 'wrong-phase' | 'occupied' | 'waypoint' | 'blocked-route'
}>

export const placeCandidate = (
  state: GameState,
  cell: Cell,
  random: SeededRandom,
): PlaceResult => {
  if (state.phase !== 'placing') return { state, error: 'wrong-phase' }

  const occupied = [...state.candidates, ...state.towers, ...state.rocks, ...state.slates]
  if (occupied.some((item) => sameCell(item, cell))) return { state, error: 'occupied' }
  if (isRouteAnchor(cell)) return { state, error: 'waypoint' }
  if (!calculateRoute([...state.candidates, ...state.towers, ...state.rocks, cell])) {
    return { state, error: 'blocked-route' }
  }

  const gem: Gem = {
    ...cell,
    id: state.nextId,
    kind: GEM_KINDS[random.nextInt(0, GEM_KINDS.length - 1)],
    quality: rollQuality(state.chanceLevel, random),
  }
  const candidates = [...state.candidates, gem]

  return {
    gem,
    state: {
      ...state,
      phase: candidates.length === 5 ? 'choosing' : 'placing',
      candidates,
      nextId: state.nextId + 1,
    },
  }
}

export const keepCandidate = (state: GameState, gemId: number): GameState => {
  if (state.phase !== 'choosing') return state
  const kept = state.candidates.find((candidate) => candidate.id === gemId)
  if (!kept) return state

  return {
    ...state,
    phase: 'wave',
    candidates: [],
    towers: [...state.towers, kept],
    rocks: [
      ...state.rocks,
      ...state.candidates
        .filter((candidate) => candidate.id !== gemId)
        .map(({ col, row }) => ({ col, row })),
    ],
  }
}

export const moveCandidate = (state: GameState, gemId: number, cell: Cell): GameState => {
  if (state.phase !== 'placing' && state.phase !== 'choosing') return state
  const candidate = state.candidates.find((gem) => gem.id === gemId)
  if (!candidate || isRouteAnchor(cell)) return state
  const stationaryCandidates = state.candidates.filter((gem) => gem.id !== gemId)
  const occupied = [...stationaryCandidates, ...state.towers, ...state.rocks, ...state.slates]
  if (occupied.some((item) => sameCell(item, cell))) return state
  if (!calculateRoute([...stationaryCandidates, ...state.towers, ...state.rocks, cell])) return state

  return {
    ...state,
    candidates: state.candidates.map((gem) => gem.id === gemId ? { ...gem, ...cell } : gem),
  }
}

export const completeWave = (state: GameState, bountyEarned: number): GameState => {
  if (state.phase !== 'wave') return state
  const wave = state.wave + 1
  return {
    ...state,
    wave,
    bounty: state.bounty + bountyEarned,
    phase: wave >= 5 ? 'ended' : 'reward',
    outcome: wave >= 5 ? 'victory' : undefined,
  }
}

export const loseLife = (state: GameState): GameState => {
  if (state.phase !== 'wave') return state
  const lives = Math.max(0, state.lives - 1)
  return {
    ...state,
    lives,
    phase: lives === 0 ? 'ended' : state.phase,
    outcome: lives === 0 ? 'defeat' : state.outcome,
  }
}

export const buyGemChance = (state: GameState): GameState => {
  if (state.phase !== 'reward' || state.chanceLevel >= CHANCE_COSTS.length) return state
  const cost = CHANCE_COSTS[state.chanceLevel]
  if (state.bounty < cost) return state
  return { ...state, bounty: state.bounty - cost, chanceLevel: state.chanceLevel + 1 }
}

export const beginNextPlacement = (state: GameState): GameState =>
  state.phase === 'reward' ? { ...state, phase: 'placing' } : state

const qualityRank = (quality: GemQuality): number => QUALITIES.indexOf(quality)

export const canCraftPrism = (state: GameState): boolean =>
  state.phase === 'reward'
  && state.towers.some((gem) => gem.kind === 'ember')
  && state.towers.some((gem) => gem.kind === 'tide')

export const craftPrism = (state: GameState): GameState => {
  if (!canCraftPrism(state)) return state
  const ember = state.towers.find((gem) => gem.kind === 'ember')
  const tide = state.towers.find((gem) => gem.kind === 'tide')
  if (!ember || !tide) return state
  const quality = qualityRank(ember.quality) <= qualityRank(tide.quality) ? ember.quality : tide.quality
  const prism: Gem = { ...ember, kind: 'prism', quality }

  return {
    ...state,
    towers: [
      ...state.towers.filter((gem) => gem.id !== ember.id && gem.id !== tide.id),
      prism,
    ],
  }
}

export const canCraftSlate = (state: GameState): boolean =>
  state.phase === 'reward'
  && state.towers.some((gem) => gem.kind === 'volt')
  && state.towers.some((gem) => gem.kind === 'moss')

export const craftSlate = (state: GameState): GameState => {
  if (!canCraftSlate(state)) return state
  const volt = state.towers.find((gem) => gem.kind === 'volt')
  const moss = state.towers.find((gem) => gem.kind === 'moss')
  if (!volt || !moss) return state

  return {
    ...state,
    towers: state.towers.filter((gem) => gem.id !== volt.id && gem.id !== moss.id),
    slates: [...state.slates, { id: state.nextId, col: volt.col, row: volt.row }],
    nextId: state.nextId + 1,
  }
}

export const moveSlate = (state: GameState, slateId: number, cell: Cell): GameState => {
  if (state.phase !== 'reward' || isRouteAnchor(cell)) return state
  const occupied = [...state.towers, ...state.rocks, ...state.slates.filter((slate) => slate.id !== slateId)]
  if (occupied.some((item) => sameCell(item, cell))) return state
  if (!state.slates.some((slate) => slate.id === slateId)) return state

  return {
    ...state,
    slates: state.slates.map((slate) => slate.id === slateId ? { ...slate, ...cell } : slate),
  }
}
