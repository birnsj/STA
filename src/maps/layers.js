// Editor authoring layers over the existing map model. Layers are UI state and classification only — they are never
// written to map files and never change gameplay data. Hazard regions keep their own runtime field named `layer`
// ('floor' | 'air'); that is unrelated to these editor layers.
// Optional catalogue fields tiles.json / templatePieces.json `layer` (one of LAYER_IDS) are authoring metadata.
import { getTile } from './mapFormat.js'
import { getTemplatePiece } from './templatePieces.js'

export const LAYER_IDS = ['ground', 'walls', 'furniture', 'characters', 'markers']

export const LAYER_LABELS = {
  ground: 'Ground / Floors',
  walls: 'Walls / Structure',
  furniture: 'Furniture / Scenery',
  characters: 'NPCs / Characters',
  markers: 'Markers / Triggers',
}

const LAYER_ID_SET = new Set(LAYER_IDS)

export const isLayerId = (value) => typeof value === 'string' && LAYER_ID_SET.has(value)

export const defaultLayerState = () => ({
  active: 'ground',
  visible: Object.fromEntries(LAYER_IDS.map((id) => [id, true])),
  locked: Object.fromEntries(LAYER_IDS.map((id) => [id, false])),
})

// Seeding / tests: classify a tile. Preserves a valid existing tile.layer; otherwise metadata-first heuristics.
// Conservative: no loose characters/markers guessing. Tight id tokens only when height/wall/role leave it on ground.
export function classifyTileLayer(tile) {
  if (!tile) return 'ground'
  if (isLayerId(tile.layer)) return tile.layer
  if (tile.empty) return 'ground'
  if (tile.wall) return 'walls'
  if (tile.role === 'destructible' || tile.role === 'hazard' || tile.role === 'hazardControl') return 'furniture'
  if (tile.height > 0) return 'furniture'

  const id = String(tile.id ?? '')
  // Flat, non-wall, no special role: only promote clear prop tokens (not substrings like "wall" in unrelated ids).
  if (/^(crate|machinery|console|bench|chair|table|locker|shelf|bed|stool)([A-Z_]|$)/i.test(id)) return 'furniture'

  return 'ground'
}

// Heuristic fallback when catalogue has no valid `layer` (pre-seed data / invalid values).
function inferTileLayer(tile) {
  if (!tile || tile.empty) return 'ground'
  if (tile.wall) return 'walls'
  if (tile.role === 'destructible' || tile.role === 'hazard' || tile.role === 'hazardControl') return 'furniture'
  if (tile.height > 0) return 'furniture'
  return 'ground'
}

// Which editor layer a catalogue tile belongs to. Prefer authored tiles.json `layer`; else infer.
export function layerOfTile(tileOrId) {
  const tile = typeof tileOrId === 'string' ? getTile(tileOrId) : tileOrId
  if (isLayerId(tile?.layer)) return tile.layer
  return inferTileLayer(tile)
}

// Seeding / tests: classify a Template Piece. Preserves a valid existing piece.layer; else tags / id heuristics.
// Default remains walls (historical Template Piece lock) when nothing clearer applies.
export function classifyTemplatePieceLayer(piece) {
  if (!piece) return 'walls'
  if (isLayerId(piece.layer)) return piece.layer
  return inferTemplatePieceLayer(piece)
}

function inferTemplatePieceLayer(piece) {
  if (!piece) return 'walls'
  const tags = new Set((piece.tags ?? []).map((tag) => String(tag).toLowerCase()))
  if (tags.has('wall') || tags.has('halfbulkhead') || tags.has('column') || tags.has('pillar')) return 'walls'
  if (tags.has('floor') || tags.has('doorway') || tags.has('grating') || tags.has('carpet')) return 'ground'
  if (
    tags.has('prop') ||
    tags.has('furniture') ||
    tags.has('machinery') ||
    tags.has('crate') ||
    tags.has('console') ||
    tags.has('bench') ||
    tags.has('chair') ||
    tags.has('table') ||
    tags.has('bed') ||
    tags.has('locker') ||
    tags.has('shelf') ||
    tags.has('stool') ||
    tags.has('steps')
  ) {
    return 'furniture'
  }
  const id = String(piece.id ?? '')
  if (/Wall|Column|Pillar|HalfBulkhead|Hull/i.test(id)) return 'walls'
  if (/Floor|Doorway|Grating|Carpet|Deck/i.test(id)) return 'ground'
  if (/Crate|Machinery|Console|Bench|Chair|Table|Bed|Locker|Shelf|Prop|Furniture|Eps|Biobed|Stool/i.test(id)) {
    return 'furniture'
  }
  return 'walls'
}

// Which editor layer a catalogue Template Piece belongs to. Prefer authored `layer`; else infer.
export function layerOfTemplatePiece(pieceOrId) {
  const piece = typeof pieceOrId === 'string' ? getTemplatePiece(pieceOrId) : pieceOrId
  if (isLayerId(piece?.layer)) return piece.layer
  return inferTemplatePieceLayer(piece)
}

// Which editor layer a selection kind belongs to. Hazards follow Furniture for visibility/lock (authored next to
// destructibles); they are not a sixth layer row. templatePiece without a catalogue id falls back to walls.
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
    case 'templatePiece':
      return 'walls'
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
