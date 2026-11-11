// Bridge: Auto-Paint role ids (Template Piece or tile) ↔ packer kit / grid tiles.
// Palette listing lives in templatePieces.js — do not duplicate it here.
import { getTemplateDeckStyle } from '../generators/templateDeckStyles.js'
import { getTile } from '../mapFormat.js'
import { getTemplatePiece } from '../templatePieces.js'

/** Legacy tile ids that mean Template 32 tip art (seed / older rulesets). */
const TILE_TO_TEMPLATE_PIECE = Object.freeze({
  wall32: 'tplStarshipWall32',
  wall32Corner: 'tplStarshipWall32Corner',
})

/**
 * Resolve a catalogue id to the tile Auto-Paint paints on the grid.
 * Accepts a tile id, or a Template Piece id with a tile counterpart.
 */
export function resolveAutoPaintTileId(id) {
  if (!id || typeof id !== 'string') return null
  if (getTile(id)) return id
  return resolveTemplatePieceToTile(id)
}

/** Template Piece id for a role value (piece id, or wall32 → tpl…). Null = true cell tile / unset. */
export function pieceIdForAutoPaintTile(roleId) {
  if (!roleId) return null
  if (getTemplatePiece(roleId)) return roleId
  const mapped = TILE_TO_TEMPLATE_PIECE[roleId] || TILE_TO_TEMPLATE_PIECE[resolveAutoPaintTileId(roleId)]
  return mapped && getTemplatePiece(mapped) ? mapped : null
}

/**
 * Map a Template Piece id to a tile id using catalogue tags.
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

/** True when this ruleset’s wall kit is Template tip art (must use piece placement). */
export function rulesetUsesTemplatePieces(ruleset) {
  const straight = ruleset?.walls?.straight
  if (!straight) return false
  if (getTemplatePiece(straight)) return true
  const tileId = resolveAutoPaintTileId(straight)
  return Boolean(tileId && TILE_TO_TEMPLATE_PIECE[tileId])
}

/** Role → piece id, or null when empty / unknown (no silent invent). */
function rolePiece(id) {
  if (!id) return null
  return pieceIdForAutoPaintTile(id) || (getTemplatePiece(id) ? id : null)
}

/**
 * Packer kit from ruleset wall roles.
 * Every piece comes from the ruleset when set. Legacy wall32 tile ids still map via TILE_TO_TEMPLATE_PIECE.
 * Deck style is only a last-resort default for straight / corner / long / doorFrame if a role is missing.
 * Hull roles stay null when None — packing uses straight/corner on the rim.
 */
export function pieceKitFromRuleset(ruleset) {
  const deck = getTemplateDeckStyle()
  const walls = ruleset?.walls ?? {}
  const fittings = Array.isArray(walls.fittings) ? walls.fittings.map(rolePiece).filter(Boolean) : []

  const straight = rolePiece(walls.straight) || deck.straight
  const corner = rolePiece(walls.corner) || deck.corner
  const hull = rolePiece(walls.hull)
  const hullCorner = rolePiece(walls.hullCorner)
  const straightLong = rolePiece(walls.straightLong) || deck.straightLong
  const hullLong = hull ? rolePiece(walls.hullLong) || deck.hullLong : null

  return {
    straight,
    straightLong,
    corner,
    hull,
    hullLong,
    hullCorner,
    doorFrame: rolePiece(walls.doorFrame) || deck.doorFrame,
    fittings,
    fittingChance: Number.isFinite(Number(walls.fittingChance)) ? Number(walls.fittingChance) : 0,
  }
}
