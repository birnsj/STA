// Catalogue of modular Template Pieces (fractional overlays; not tiles). Presentation + editor placement only.
import catalogue from '../data/adaptation/maps/templatePieces.json'
import { normalizeTemplateRotation } from './mapFormat.js'

export const TEMPLATE_PIECES = catalogue.pieces ?? []
const BY_ID = new Map(TEMPLATE_PIECES.map((piece) => [piece.id, piece]))
let templatePieceCatalogueEpoch = 0
export const templatePieceCatalogueEpochOf = () => templatePieceCatalogueEpoch

export const getTemplatePiece = (id) => BY_ID.get(id) ?? null

export const templatePieceIds = () => TEMPLATE_PIECES.map((piece) => piece.id)

// Dev Edit Assets delete: drop a piece from the live catalogue (templatePieces.json already rewritten by /__templates).
export function removeTemplatePieceLocal(id) {
  const piece = BY_ID.get(id)
  if (!piece) throw new Error(`No template piece with id ${id}`)
  const index = TEMPLATE_PIECES.findIndex((entry) => entry.id === id)
  if (index >= 0) TEMPLATE_PIECES.splice(index, 1)
  BY_ID.delete(id)
  templatePieceCatalogueEpoch += 1
  return piece
}

// Same bounds as tileArt overlay emissive (kept local to avoid an import cycle with darknessLights).
export const TEMPLATE_OVERLAY_EMISSIVE_DEFAULT = 1
function clampTemplateEmissive(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return TEMPLATE_OVERLAY_EMISSIVE_DEFAULT
  return Math.min(2, Math.max(0, Math.round(n * 10) / 10))
}

const fileName = (href) => {
  if (!href) return null
  const parts = String(href).split('/')
  return parts[parts.length - 1] || href
}

const isGlowColour = (colour) => typeof colour === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(colour)

function forEachAnimation(piece, visit) {
  if (!piece) return
  if (piece.animation) visit(piece.animation)
  for (const orient of Object.values(piece.orients ?? {})) {
    if (orient.animation) visit(orient.animation)
  }
}

let templateEmissiveEpoch = 0
export const templateEmissiveEpochOf = () => templateEmissiveEpoch

// Overlay light frame for a catalogue animation (same loop math as tileArt.frameAt / board GroundLootView).
export function templateOverlayEmissionAt(animation, seconds) {
  if (!animation?.overlay || !animation.frames?.length || !animation.images?.length) return null
  const frameTime = animation.frameTime > 0 ? animation.frameTime : 0.7
  const loop = animation.frames.length * frameTime
  if (!(seconds >= 0) || !Number.isFinite(seconds)) {
    return animation.images[animation.frames[0]]?.emission ?? null
  }
  const t = (((seconds % loop) + loop) % loop)
  const index = animation.frames[Math.floor(t / frameTime) % animation.frames.length]
  return animation.images[index]?.emission ?? null
}

export function templateOverlayEmissive(pieceId) {
  const anim = getTemplatePiece(pieceId)?.animation
  if (!anim?.overlay) return TEMPLATE_OVERLAY_EMISSIVE_DEFAULT
  return clampTemplateEmissive(anim.emissive ?? TEMPLATE_OVERLAY_EMISSIVE_DEFAULT)
}

export function templateOverlayEmitColour(pieceId) {
  const colour = getTemplatePiece(pieceId)?.animation?.emitColour
  return isGlowColour(colour) ? colour.toLowerCase() : null
}

export function setTemplatePieceFlagLocal(id, flag, value) {
  const piece = getTemplatePiece(id)
  if (!piece) throw new Error(`No template piece ${id}`)
  if (flag !== 'cover' && flag !== 'fade') throw new Error(`Unknown flag ${flag}`)
  piece[flag] = Boolean(value)
  return piece[flag]
}

export function setTemplatePieceLayerLocal(id, layer) {
  const piece = getTemplatePiece(id)
  if (!piece) throw new Error(`No template piece ${id}`)
  piece.layer = layer
  return layer
}

export function setTemplateOverlayEmissiveLocal(pieceId, value) {
  const piece = getTemplatePiece(pieceId)
  if (!piece?.animation?.overlay) throw new Error(`No overlay animation for ${pieceId}`)
  const prev = templateOverlayEmissive(pieceId)
  const next = clampTemplateEmissive(value)
  forEachAnimation(piece, (anim) => {
    if (next === TEMPLATE_OVERLAY_EMISSIVE_DEFAULT) delete anim.emissive
    else anim.emissive = next
  })
  if (prev !== next) templateEmissiveEpoch += 1
  return next
}

export function setTemplateOverlayEmitColourLocal(pieceId, colour) {
  const piece = getTemplatePiece(pieceId)
  if (!piece?.animation?.overlay) throw new Error(`No overlay animation for ${pieceId}`)
  const prev = templateOverlayEmitColour(pieceId)
  const next = colour == null || colour === '' ? null : isGlowColour(colour) ? colour.toLowerCase() : null
  if (colour != null && colour !== '' && !next) throw new Error('colour must be #rgb or #rrggbb')
  forEachAnimation(piece, (anim) => {
    if (next) anim.emitColour = next
    else delete anim.emitColour
  })
  if (prev !== next) templateEmissiveEpoch += 1
  return next
}

// Read-only summary for Properties → Selection (mirrors tileSpriteInfo for tiles).
export function templatePieceSpriteInfo(piece) {
  if (!piece) return null
  const anim = piece.animation ?? null
  const emissions = (anim?.images ?? [])
    .map((entry, frame) => (entry?.emission ? { frame, href: entry.emission, name: fileName(entry.emission), kind: 'emission' } : null))
    .filter(Boolean)
  const steps = anim?.frames?.length ?? 0
  const frameTime = anim?.frameTime ?? null
  const loop = frameTime != null && steps ? frameTime * steps : null
  const images = [{ label: 'Image', href: piece.href, name: fileName(piece.href) }]
  for (const yaw of ['90', '180', '270']) {
    const orient = piece.orients?.[yaw]
    if (orient?.href) images.push({ label: `Yaw ${yaw}°`, href: orient.href, name: fileName(orient.href) })
  }
  const traits = [...(piece.tags ?? [])]
  if (piece.cover) traits.push('Cover')
  if (piece.fade) traits.push('Fade')
  const dimension = (piece.tags ?? []).includes('dimension')
  return {
    id: piece.id,
    label: piece.label,
    group: dimension
      ? { id: 'template-dimension', label: 'Dimension', section: null }
      : { id: 'template-pieces', label: 'Template Pieces', section: null },
    size: piece.size ? { width: piece.size.width, height: piece.size.height } : null,
    height: piece.height ?? null,
    footprint: piece.footprint ?? null,
    cover: Boolean(piece.cover),
    fade: Boolean(piece.fade),
    traits,
    images,
    animation: anim
      ? {
          overlay: Boolean(anim.overlay),
          frameTime,
          steps,
          loop,
          sequence: anim.frames ?? [],
          uniqueSprites: anim.images?.length ?? 0,
          emissions,
          emissive: templateOverlayEmissive(piece.id),
          emitColour: templateOverlayEmitColour(piece.id),
        }
      : null,
  }
}

// Art for a yaw around the vertical through the south tip (0 / 90 / 180 / 270). Baked iso projections — not a
// screen-space spin. Falls back to the 0° href when an orient is missing.
export function templatePieceArt(def, rotation = 0) {
  if (!def) return null
  const yaw = normalizeTemplateRotation(rotation)
  const orient = yaw === 0 ? null : def.orients?.[String(yaw)] ?? def.orients?.[yaw] ?? null
  const href = orient?.href ?? def.href
  const size = orient?.size ?? def.size
  const anchorX = Number.isFinite(orient?.anchorX)
    ? orient.anchorX
    : Number.isFinite(def.anchorX)
      ? def.anchorX
      : size.width / 2
  const animation = orient?.animation ?? def.animation ?? null
  return { href, size, anchorX, yaw, animation }
}

// Footprint on the floor after yaw (width/depth swap at 90° / 270°).
export function templatePieceFootprint(def, rotation = 0) {
  const footprint = def?.footprint
  if (!footprint) return null
  const yaw = normalizeTemplateRotation(rotation)
  if (yaw === 90 || yaw === 270) return { width: footprint.depth, depth: footprint.width }
  return { width: footprint.width, depth: footprint.depth }
}

export function templatePieceGroups() {
  if (!TEMPLATE_PIECES.length) return []
  const starship = TEMPLATE_PIECES.filter((piece) => !(piece.tags ?? []).includes('dimension'))
  const dimension = TEMPLATE_PIECES.filter((piece) => (piece.tags ?? []).includes('dimension'))
  const groups = []
  if (starship.length) groups.push({ id: 'template-pieces', label: 'Template Pieces', pieces: starship })
  if (dimension.length) groups.push({ id: 'template-dimension', label: 'Dimension', pieces: dimension })
  return groups
}

/** Flat Template category list for shared editors (Dev Edit Assets / Auto-Paint). Same groups as templatePieceGroups. */
export function listEditorTemplatePieces({ includeDimension = false } = {}) {
  const out = []
  for (const group of templatePieceGroups()) {
    if (group.id === 'template-dimension' && !includeDimension) continue
    for (const piece of group.pieces) out.push(piece)
  }
  return out
}

/** GeSourcePalette items for the Template Pieces category (one catalogue, no parallel copy). */
export function editorTemplatePaletteItems({ includeDimension = false } = {}) {
  return listEditorTemplatePieces({ includeDimension }).map((piece) => ({
    kind: 'piece',
    id: piece.id,
    label: piece.label,
    href: piece.href,
    // Catalogue already authors layer; GeSourcePalette falls back to layerOfTemplatePiece when missing.
    layer: piece.layer ?? null,
  }))
}

/** Tip-anchored footprint AABB in tile units (tip = +X/+Y corner). */
export function templatePieceWorldAabb(entry) {
  const def = getTemplatePiece(entry?.pieceId)
  if (!def) return null
  const tip = entry.position
  if (!tip || !Number.isFinite(tip.x) || !Number.isFinite(tip.y)) return null
  const fp = templatePieceFootprint(def, entry.rotation ?? 0)
  if (!fp?.width || !fp?.depth) return null
  const w = fp.width / 64
  const d = fp.depth / 64
  return { minX: tip.x - w, maxX: tip.x, minY: tip.y - d, maxY: tip.y, def }
}

function isTemplateWallCollider(def) {
  const tags = new Set((def.tags ?? []).map((tag) => String(tag).toLowerCase()))
  if (tags.has('floor') || tags.has('doorway') || tags.has('carpet') || tags.has('grating')) return false
  if (tags.has('wall') || tags.has('halfbulkhead') || tags.has('column') || tags.has('pillar')) return true
  return def.layer === 'walls'
}

export function circleHitsAabb(point, radius, box) {
  if (!point || !box || !(radius > 0)) return false
  const cx = Math.min(Math.max(point.x, box.minX), box.maxX)
  const cy = Math.min(Math.max(point.y, box.minY), box.maxY)
  const dx = point.x - cx
  const dy = point.y - cy
  return dx * dx + dy * dy < radius * radius
}

/** True when a circle overlaps any Template Piece wall/structure footprint (edge collision). */
export function circleHitsTemplateWalls(map, point, radius) {
  for (const entry of map.templatePiecePlacements ?? []) {
    const box = templatePieceWorldAabb(entry)
    if (!box || !isTemplateWallCollider(box.def)) continue
    if (circleHitsAabb(point, radius, box)) return true
  }
  return false
}

// True when a cover Template Piece's footprint overlaps the tile cell (combat standing-next-to cover).
export function templatePieceGivesCover(map, position) {
  const cellX = Math.round(position.x)
  const cellY = Math.round(position.y)
  for (const entry of map.templatePiecePlacements ?? []) {
    const def = getTemplatePiece(entry.pieceId)
    if (!def?.cover) continue
    const box = templatePieceWorldAabb(entry)
    if (!box) continue
    if (cellX >= Math.floor(box.minX) && cellX <= Math.floor(box.maxX) && cellY >= Math.floor(box.minY) && cellY <= Math.floor(box.maxY)) {
      return true
    }
  }
  return false
}
