// Bridge only: Template Pieces (Dev Edit catalogue) ↔ wall/floor tile ids for Auto-Paint placement.
// Palette listing lives in templatePieces.js (editorTemplatePaletteItems) — do not duplicate it here.
import { getTemplateDeckStyle } from '../generators/templateDeckStyles.js'
import { getTile } from '../mapFormat.js'
import { getTemplatePiece } from '../templatePieces.js'

/** Tile ids that are Template-kit art (tip-anchored). Those must place as Template Pieces, not cell tiles. */
const TILE_TO_TEMPLATE_PIECE = Object.freeze({
  wall32: 'tplStarshipWall32',
  wall32Corner: 'tplStarshipWall32Corner',
})

/**
 * Resolve a catalogue id to the tile Auto-Paint places on the grid.
 * Accepts a wall tile id as-is, or a Template Piece id (same catalogue as Dev Edit Assets).
 */
export function resolveAutoPaintTileId(id) {
  if (!id || typeof id !== 'string') return null
  if (getTile(id)) return id
  return resolveTemplatePieceToTile(id)
}

/**
 * Map a Template Piece id to a tile id using catalogue tags (no parallel id table).
 * Returns null when there is no tile counterpart (props/furniture stay browse-only).
 */
export function resolveTemplatePieceToTile(pieceId) {
  const piece = getTemplatePiece(pieceId)
  if (!piece) return null
  const tags = new Set((piece.tags ?? []).map((tag) => String(tag).toLowerCase()))

  if (tags.has('doorway') || pieceId.includes('Doorway') || (tags.has('door') && tags.has('frame'))) {
    return getTile('doorway') ? 'doorway' : null
  }
  if (tags.has('grating')) return getTile('grating') ? 'grating' : null
  if (tags.has('floor') || tags.has('deck') || pieceId.includes('Floor')) {
    return getTile('floor') ? 'floor' : null
  }
  if (tags.has('corner') && (tags.has('wall') || tags.has('hull') || tags.has('thick32'))) {
    return getTile('wall32Corner') ? 'wall32Corner' : null
  }
  if (tags.has('wall') || tags.has('hull') || tags.has('thick32') || tags.has('straight')) {
    return getTile('wall32') ? 'wall32' : null
  }
  return null
}

/** True when this ruleset’s wall kit is Template 32 tip art (must use piece placement). */
export function rulesetUsesTemplatePieces(ruleset) {
  const straight = ruleset?.walls?.straight
  if (!straight) return false
  if (getTemplatePiece(straight)) return true
  const tileId = resolveAutoPaintTileId(straight)
  return Boolean(tileId && TILE_TO_TEMPLATE_PIECE[tileId])
}

function toPieceId(id, fallback) {
  if (!id) return fallback
  if (getTemplatePiece(id)) return id
  const fromTile = TILE_TO_TEMPLATE_PIECE[id] || TILE_TO_TEMPLATE_PIECE[resolveAutoPaintTileId(id)]
  if (fromTile && getTemplatePiece(fromTile)) return fromTile
  return fallback
}

/** Template Deck–compatible piece kit for wallsTemplate / placeTemplateWalls. */
export function pieceKitFromRuleset(ruleset) {
  const deck = getTemplateDeckStyle()
  const fittings = Array.isArray(ruleset?.walls?.fittings)
    ? ruleset.walls.fittings.map((id) => toPieceId(id, null)).filter(Boolean)
    : []
  return {
    straight: toPieceId(ruleset?.walls?.straight, deck.straight),
    straightLong: deck.straightLong,
    corner: toPieceId(ruleset?.walls?.corner, deck.corner),
    hull: toPieceId(ruleset?.walls?.hull, deck.hull),
    hullLong: deck.hullLong,
    hullCorner: toPieceId(ruleset?.walls?.hullCorner, deck.hullCorner),
    doorFrame: deck.doorFrame,
    fittings: fittings.length ? fittings : [...deck.fittings],
    fittingChance:
      Number.isFinite(Number(ruleset?.walls?.fittingChance))
        ? Number(ruleset.walls.fittingChance)
        : deck.fittingChance,
  }
}
