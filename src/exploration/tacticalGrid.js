// The one conversion between exploration positions and Combat Type 1 cells. Exploration positions are continuous with
// tile centres on whole numbers (tile x covers x - 0.5 .. x + 0.5); Combat Type 1 cells are those same tiles.
import { blocksMovement, isInside, tileKey } from '../combat/battleMap.js'

export const worldToGrid = (position) => ({ x: Math.round(position.x), y: Math.round(position.y) })
export const gridToWorld = (cell) => ({ x: cell.x, y: cell.y })

// No snap should ever need to go further than this; past it the entity is left out rather than moved across the map.
const MAX_SNAP_RING = 6

// The free cell nearest to a world position: the cell it stands in if that is walkable and nobody holds it, else the
// closest walkable free cell around it. takenKeys: tileKeys already held. Returns { cell, distance } or null.
export function nearestFreeCell(map, position, takenKeys) {
  const home = worldToGrid(position)
  let best = null
  for (let ring = 0; ring <= MAX_SNAP_RING; ring++) {
    // Every cell in this ring and beyond is at least ring - 0.5 away, so nothing further out can beat the best.
    if (best && ring - 0.5 > best.distance) break
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
        const cell = { x: home.x + dx, y: home.y + dy }
        if (!isInside(map, cell) || blocksMovement(map, cell) || takenKeys.has(tileKey(cell))) continue
        const distance = Math.hypot(cell.x - position.x, cell.y - position.y)
        if (!best || distance < best.distance) best = { cell, distance }
      }
    }
  }
  return best
}

// Snaps several entities ([{ id, position }]) without stacking. Those standing closest to a cell centre claim theirs
// first, so the total displacement stays small. Returns { [id]: { from, cell, distance } } (an entry is missing when no
// free cell was found).
export function snapToGrid(map, entities, takenKeys = new Set()) {
  const taken = new Set(takenKeys)
  const offCentre = (entity) => Math.hypot(entity.position.x - Math.round(entity.position.x), entity.position.y - Math.round(entity.position.y))
  const result = {}
  ;[...entities]
    .sort((a, b) => offCentre(a) - offCentre(b))
    .forEach((entity) => {
      const snap = nearestFreeCell(map, entity.position, taken)
      if (!snap) return
      taken.add(tileKey(snap.cell))
      result[entity.id] = { from: { ...entity.position }, cell: snap.cell, distance: snap.distance }
    })
  return result
}
