import type { Cell } from './types'

export const BOARD_COLS = 120
export const BOARD_ROWS = 80

export const ROUTE_ANCHORS: readonly Cell[] = [
  { col: 0, row: 8 },
  { col: 86, row: 8 },
  { col: 86, row: 48 },
  { col: 26, row: 48 },
  { col: 26, row: 8 },
  { col: 86, row: 8 },
  { col: 86, row: 48 },
  { col: 119, row: 48 },
]

const keyOf = ({ col, row }: Cell): string => `${col},${row}`
const DIRECTIONS: readonly (Cell & Readonly<{ axis: 0 | 1 }>)[] = [
  { col: 1, row: 0, axis: 0 },
  { col: 0, row: 1, axis: 1 },
  { col: -1, row: 0, axis: 0 },
  { col: 0, row: -1, axis: 1 },
]

export const isRouteAnchor = (cell: Cell): boolean =>
  ROUTE_ANCHORS.some((anchor) => anchor.col === cell.col && anchor.row === cell.row)

type SearchNode = Readonly<{
  cell: Cell
  targetIndex: number
  turnAxis: -1 | 0 | 1
}>

const searchKey = ({ cell, targetIndex, turnAxis }: SearchNode): string =>
  `${cell.col},${cell.row}|${targetIndex}|${turnAxis}`

export const calculateRoute = (obstacles: readonly Cell[]): Cell[] | null => {
  const blocked = new Set(obstacles.map(keyOf))
  const start: SearchNode = { cell: ROUTE_ANCHORS[0], targetIndex: 1, turnAxis: -1 }
  const startKey = searchKey(start)
  const queue: SearchNode[] = [start]
  const cameFrom = new Map<string, string | null>([[startKey, null]])
  const nodes = new Map<string, SearchNode>([[startKey, start]])
  let goalKey: string | undefined

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    if (current.targetIndex === ROUTE_ANCHORS.length) {
      goalKey = searchKey(current)
      break
    }

    for (const direction of DIRECTIONS) {
      if (current.turnAxis !== -1 && direction.axis === current.turnAxis) continue
      const cell = { col: current.cell.col + direction.col, row: current.cell.row + direction.row }
      const cellKey = keyOf(cell)
      if (
        cell.col < 0 || cell.col >= BOARD_COLS || cell.row < 0 || cell.row >= BOARD_ROWS
        || blocked.has(cellKey)
      ) continue

      let targetIndex = current.targetIndex
      let turnAxis: -1 | 0 | 1 = -1
      const target = ROUTE_ANCHORS[targetIndex]
      if (cell.col === target.col && cell.row === target.row) {
        const reachedIndex = targetIndex
        targetIndex += 1
        if (reachedIndex < ROUTE_ANCHORS.length - 1) turnAxis = direction.axis
      }

      const next: SearchNode = { cell, targetIndex, turnAxis }
      const nextKey = searchKey(next)
      if (cameFrom.has(nextKey)) continue
      cameFrom.set(nextKey, searchKey(current))
      nodes.set(nextKey, next)
      queue.push(next)
    }
  }

  if (!goalKey) return null
  const route: Cell[] = []
  let currentKey: string | null = goalKey
  while (currentKey) {
    const node = nodes.get(currentKey)
    if (!node) return null
    route.push(node.cell)
    currentKey = cameFrom.get(currentKey) ?? null
  }
  return route.reverse()
}
