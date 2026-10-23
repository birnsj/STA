// Authoring overlay for the map editor: every top an item or stacked prop can rest on.
// Presentation data only — placement rules stay in rules/placement.js.
import { getItemById } from '../rules/equipment.js'
import { DEFAULT_SURFACE_INSET, surfaceOfItem, tileSurfaceAt } from '../rules/placement.js'
import { diamond, footprintDiamond } from './iso.js'
import { groundItemElevation, placementProbeState } from './mapEdits.js'

// Usable tile top is a square inset from the cell (placement.js pointInSurfaceFootprint).
// diamond scale 1 is the full cell, whose half-extent is 0.5.
function tileSurfaceScale(inset) {
  const clamped = Math.max(0, Math.min(0.49, Number.isFinite(inset) ? inset : DEFAULT_SURFACE_INSET))
  return (0.5 - clamped) / 0.5
}

// marks: { id, kind: 'tile' | 'item', points: [[x, y], ...] } in board pixels, lifted onto the top.
export function surfaceOverlayMarks(map) {
  if (!map?.tiles) return []
  const marks = []
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const surface = tileSurfaceAt(map, { x, y })
      if (!surface) continue
      marks.push({
        id: `tile:${x},${y}`,
        kind: 'tile',
        points: diamond({ x, y }, surface.topZ, tileSurfaceScale(surface.inset)),
      })
    }
  }
  const probe = placementProbeState(map)
  for (const entry of map.groundItemPlacements ?? []) {
    if (!getItemById(entry.itemId)) continue
    const surface = surfaceOfItem(entry.itemId)
    if (!surface?.footprint) continue
    const elev = groundItemElevation(map, entry, probe)
    marks.push({
      id: `item:${entry.id}`,
      kind: 'item',
      points: footprintDiamond(entry.position, surface.footprint, elev.z + surface.topZ),
    })
  }
  return marks
}
