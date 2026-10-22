// Editor authoring layers over the existing map model. Layers are UI state and classification only — they are never
// written to map files and never change gameplay data. Hazard regions keep their own runtime field named `layer`
// ('floor' | 'air'); that is unrelated to these editor layers.
import { getTile } from './mapFormat.js'

export const LAYER_IDS = ['ground', 'walls', 'furniture', 'characters', 'markers']

export const LAYER_LABELS = {
  ground: 'Ground / Floors',
  walls: 'Walls / Structure',
  furniture: 'Furniture / Scenery',
  characters: 'NPCs / Characters',
  markers: 'Markers / Triggers',
}

export const defaultLayerState = () => ({
  active: 'ground',
  visible: Object.fromEntries(LAYER_IDS.map((id) => [id, true])),
  locked: Object.fromEntries(LAYER_IDS.map((id) => [id, false])),
})

// Which editor layer a catalogue tile belongs to (Null and floor-like → ground; walls → walls; props → furniture).
export function layerOfTile(tileOrId) {
  const tile = typeof tileOrId === 'string' ? getTile(tileOrId) : tileOrId
  if (!tile || tile.empty) return 'ground'
  if (tile.wall) return 'walls'
  if (tile.role === 'destructible' || tile.role === 'hazard' || tile.role === 'hazardControl') return 'furniture'
  if (tile.height > 0) return 'furniture'
  return 'ground'
}

// Which editor layer a selection kind belongs to. Hazards follow Furniture for visibility/lock (authored next to
// destructibles); they are not a sixth layer row.
export function layerOfSelection(kind) {
  switch (kind) {
    case 'tile':
      return null
    case 'wall':
      return 'walls'
    case 'prop':
    case 'destructible':
    case 'object':
    case 'groundItem':
    case 'hazard':
      return 'furniture'
    case 'npc':
    case 'playerStarts':
    case 'enemySpawns':
      return 'characters'
    case 'area':
    case 'objective':
      return 'markers'
    default:
      return null
  }
}

export const isLayerVisible = (layers, layerId) => layers?.visible?.[layerId] !== false
export const isLayerLocked = (layers, layerId) => Boolean(layers?.locked?.[layerId])
export const canEditLayer = (layers, layerId) => isLayerVisible(layers, layerId) && !isLayerLocked(layers, layerId)

// Selection priority when cycling candidates at one tile: active layer first, then furniture → characters → markers →
// walls → ground.
export function selectionPriority(active) {
  const order = ['furniture', 'characters', 'markers', 'walls', 'ground']
  if (!active || !order.includes(active)) return order
  return [active, ...order.filter((id) => id !== active)]
}
