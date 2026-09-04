export type Cell = Readonly<{ col: number; row: number }>
export type GamePhase = 'placing' | 'choosing' | 'wave' | 'reward' | 'ended'
export type GemKind = 'ember' | 'tide' | 'volt' | 'moss' | 'prism'
export type GemQuality = 'rough' | 'cut' | 'radiant'

export type Gem = Cell & Readonly<{
  id: number
  kind: GemKind
  quality: GemQuality
}>

export type Enemy = Readonly<{
  id: number
  routeIndex: number
  progress: number
  health: number
  maxHealth: number
  speed: number
  armor: number
  slowUntil: number
}>

export type Slate = Cell & Readonly<{
  id: number
}>

export type GameState = Readonly<{
  phase: GamePhase
  wave: number
  lives: number
  bounty: number
  chanceLevel: number
  candidates: readonly Gem[]
  towers: readonly Gem[]
  rocks: readonly Cell[]
  slates: readonly Slate[]
  enemies: readonly Enemy[]
  nextId: number
  outcome?: 'victory' | 'defeat'
}>

export type GemStats = Readonly<{
  damage: number
  range: number
  cooldown: number
  color: number
  label: string
}>
