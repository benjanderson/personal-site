import type { GemKind, GemQuality, GemStats } from './types'

export const GEM_KINDS: readonly GemKind[] = ['ember', 'tide', 'volt', 'moss']
export const QUALITIES: readonly GemQuality[] = ['rough', 'cut', 'radiant']

export const GEM_ROLES: Record<GemKind, string> = {
  ember: 'Heavy single-target damage.',
  tide: 'Slows enemies on every hit.',
  volt: 'Chains damage to a second target.',
  moss: 'Boosts nearby towers while attacking.',
  prism: 'Fast, long-range focused damage.',
}

export const GEM_STATS: Record<GemKind, Record<GemQuality, GemStats>> = {
  ember: {
    rough: { damage: 11, range: 2.2, cooldown: 0.75, color: 0xe85c55, label: 'Ember' },
    cut: { damage: 17, range: 2.35, cooldown: 0.7, color: 0xf47762, label: 'Cut Ember' },
    radiant: { damage: 25, range: 2.5, cooldown: 0.62, color: 0xff9a75, label: 'Radiant Ember' },
  },
  tide: {
    rough: { damage: 6, range: 2.4, cooldown: 0.9, color: 0x65c3b5, label: 'Tide' },
    cut: { damage: 9, range: 2.55, cooldown: 0.82, color: 0x7fd9cc, label: 'Cut Tide' },
    radiant: { damage: 13, range: 2.7, cooldown: 0.74, color: 0xa8eee4, label: 'Radiant Tide' },
  },
  volt: {
    rough: { damage: 8, range: 2.1, cooldown: 0.65, color: 0xf5c44d, label: 'Volt' },
    cut: { damage: 12, range: 2.25, cooldown: 0.58, color: 0xffd86d, label: 'Cut Volt' },
    radiant: { damage: 18, range: 2.4, cooldown: 0.5, color: 0xffe89c, label: 'Radiant Volt' },
  },
  moss: {
    rough: { damage: 5, range: 2.7, cooldown: 0.8, color: 0x82b96b, label: 'Moss' },
    cut: { damage: 8, range: 2.9, cooldown: 0.72, color: 0x9dce82, label: 'Cut Moss' },
    radiant: { damage: 12, range: 3.1, cooldown: 0.64, color: 0xbde69f, label: 'Radiant Moss' },
  },
  prism: {
    rough: { damage: 20, range: 2.7, cooldown: 0.6, color: 0xf2a7d7, label: 'Prism' },
    cut: { damage: 29, range: 2.9, cooldown: 0.54, color: 0xffbce7, label: 'Cut Prism' },
    radiant: { damage: 42, range: 3.1, cooldown: 0.46, color: 0xffd8ef, label: 'Radiant Prism' },
  },
}

export const CHANCE_TABLE: readonly (readonly [number, number, number])[] = [
  [82, 17, 1],
  [68, 28, 4],
  [52, 38, 10],
  [36, 46, 18],
]

export const CHANCE_COSTS: readonly number[] = [10, 18, 28]

export const WAVE_DEFINITIONS = [
  { count: 6, health: 5, speed: 1.2, armor: 0, reward: 2 },
  { count: 8, health: 24, speed: 1.3, armor: 0, reward: 2 },
  { count: 8, health: 40, speed: 1.2, armor: 1, reward: 3 },
  { count: 10, health: 55, speed: 1.45, armor: 2, reward: 3 },
  { count: 1, health: 180, speed: 1.05, armor: 3, reward: 15 },
] as const
