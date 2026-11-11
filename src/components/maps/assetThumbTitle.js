import { LAYER_LABELS, layerOfTile, layerOfTemplatePiece } from '../../maps/layers.js'
import { imageSize } from '../../maps/mapFormat.js'

function layerPart(layerId) {
  if (!layerId) return null
  return LAYER_LABELS[layerId] ?? layerId
}

/** Hover title: label · size · height · layer (+ optional extra). */
export function templatePieceThumbTitle(piece, { extra = '' } = {}) {
  if (!piece) return extra || ''
  const parts = [piece.label || piece.id]
  const fp = piece.footprint
  if (fp && Number.isFinite(fp.width) && Number.isFinite(fp.depth)) {
    parts.push(`${fp.width}×${fp.depth}`)
  } else if (piece.size && Number.isFinite(piece.size.width) && Number.isFinite(piece.size.height)) {
    parts.push(`${piece.size.width}×${piece.size.height}`)
  }
  if (Number.isFinite(piece.height)) parts.push(`h ${piece.height}`)
  const layer = layerPart(layerOfTemplatePiece(piece))
  if (layer) parts.push(layer)
  if (extra) parts.push(extra)
  return parts.join(' · ')
}

export function tileThumbTitle(tile, { extra = '' } = {}) {
  if (!tile) return extra || ''
  const parts = [tile.label || tile.id]
  const size = imageSize(tile)
  if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) {
    parts.push(`${size.width}×${size.height}`)
  }
  if (Number.isFinite(tile.height)) parts.push(`h ${tile.height}`)
  if (tile.big) parts.push('2×2')
  const layer = layerPart(layerOfTile(tile))
  if (layer) parts.push(layer)
  if (extra) parts.push(extra)
  return parts.join(' · ')
}
