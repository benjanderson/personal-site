import { describe, expect, it } from 'vitest'
import { calculateRoute, isRouteAnchor, ROUTE_ANCHORS } from './pathfinding'

describe('ordered waypoint route', () => {
  it('visits every anchor in order', () => {
    const route = calculateRoute([])
    expect(route).not.toBeNull()

    let lastIndex = -1
    for (const anchor of ROUTE_ANCHORS) {
      const index = route?.findIndex(
        (cell, candidateIndex) => candidateIndex > lastIndex
          && cell.col === anchor.col && cell.row === anchor.row,
      ) ?? -1
      expect(index).toBeGreaterThan(lastIndex)
      lastIndex = index
    }
  })

  it('rejects a sealed waypoint segment', () => {
    expect(calculateRoute([
      { col: 85, row: 48 },
      { col: 86, row: 47 },
      { col: 86, row: 49 },
      { col: 87, row: 48 },
    ])).toBeNull()
  })

  it('marks entrance, six waypoints, and exit as immutable', () => {
    expect(ROUTE_ANCHORS).toHaveLength(8)
    expect(ROUTE_ANCHORS.every(isRouteAnchor)).toBe(true)
  })

  it('turns at every numbered waypoint', () => {
    const route = calculateRoute([])
    expect(route).not.toBeNull()

    let previousIndex = -1
    for (const anchor of ROUTE_ANCHORS.slice(1, -1)) {
      const index = route?.findIndex((cell, candidateIndex) => candidateIndex > previousIndex
        && cell.col === anchor.col && cell.row === anchor.row) ?? -1
      const before = route?.[index - 1]
      const after = route?.[index + 1]
      expect(before).toBeDefined()
      expect(after).toBeDefined()
      expect(before?.col === after?.col || before?.row === after?.row).toBe(false)
      previousIndex = index
    }
  })

  it('uses one coordinate for waypoints one and five', () => {
    expect(ROUTE_ANCHORS[1]).toEqual(ROUTE_ANCHORS[5])
  })

  it('forms a rectangle and reuses earlier path cells', () => {
    const route = calculateRoute([])
    const visits = new Map<string, number>()
    route?.forEach((cell) => {
      const key = `${cell.col},${cell.row}`
      visits.set(key, (visits.get(key) ?? 0) + 1)
    })

    expect(ROUTE_ANCHORS[1]).toEqual(ROUTE_ANCHORS[5])
    expect(ROUTE_ANCHORS[2]).toEqual(ROUTE_ANCHORS[6])
    expect(ROUTE_ANCHORS[1].row).toBe(ROUTE_ANCHORS[4].row)
    expect(ROUTE_ANCHORS[2].row).toBe(ROUTE_ANCHORS[3].row)
    expect(ROUTE_ANCHORS[1].col).toBe(ROUTE_ANCHORS[2].col)
    expect(ROUTE_ANCHORS[3].col).toBe(ROUTE_ANCHORS[4].col)
    expect(ROUTE_ANCHORS[7].row).toBe(ROUTE_ANCHORS[6].row)
    expect([...visits.values()].some((count) => count > 1)).toBe(true)
  })

  it('runs from start through waypoint four before reaching waypoint one', () => {
    const route = calculateRoute([])
    const waypointFour = ROUTE_ANCHORS[4]
    const waypointOne = ROUTE_ANCHORS[1]
    const firstFourVisit = route?.findIndex((cell) => cell.col === waypointFour.col && cell.row === waypointFour.row) ?? -1
    const firstOneVisit = route?.findIndex((cell) => cell.col === waypointOne.col && cell.row === waypointOne.row) ?? -1

    expect(firstFourVisit).toBeGreaterThan(0)
    expect(firstFourVisit).toBeLessThan(firstOneVisit)
  })
})
