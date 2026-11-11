// Floor-island boundary analysis for Auto-Paint. Orthogonal only (Phase 1).
import { NULL_TILE, cellKey } from '../mapFormat.js'

const DIRS = [
  { dx: 0, dy: -1, name: 'n' },
  { dx: 0, dy: 1, name: 's' },
  { dx: 1, dy: 0, name: 'e' },
  { dx: -1, dy: 0, name: 'w' },
]

export function parseCellKey(key) {
  const [x, y] = String(key).split(',').map(Number)
  return { x, y }
}

export function inBounds(width, height, x, y) {
  return x >= 0 && y >= 0 && x < width && y < height
}

export function isFloorTileId(id, floorIds) {
  return floorIds.has(id)
}

export function collectFloorKeys(map, floorIds) {
  const keys = []
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isFloorTileId(map.tiles[y][x], floorIds)) keys.push(cellKey({ x, y }))
    }
  }
  return keys
}

// Exterior Null (or out-of-bounds treated as exterior) cells adjacent to any floor cell.
export function exteriorUnderlayKeys(map, floorKeys) {
  const floorSet = new Set(floorKeys)
  const underlay = new Set()
  for (const key of floorKeys) {
    const { x, y } = parseCellKey(key)
    for (const { dx, dy } of DIRS) {
      const nx = x + dx
      const ny = y + dy
      if (!inBounds(map.width, map.height, nx, ny)) continue
      const nKey = cellKey({ x: nx, y: ny })
      if (floorSet.has(nKey)) continue
      const id = map.tiles[ny][nx]
      // Only claim Null cells as new hull underlay (leave hand-authored walls alone).
      if (id === NULL_TILE) underlay.add(nKey)
    }
  }
  return [...underlay]
}

export function floorIdsForRuleset(ruleset) {
  const ids = new Set([ruleset.floors.defaultTile, ...(ruleset.floors.variants ?? [])])
  return ids
}
