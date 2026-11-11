// After Template Deck wall placement: fill missing through-runs / orphan underlay cells.
// Does not edit generators/* — wraps the locked placeTemplateWalls result.
import { NULL_TILE, normalizeTemplateRotation } from '../mapFormat.js'
import { snapTemplatePiecePosition, TEMPLATE_PIECE_CELL_PX } from '../mapEdits.js'
import { getTemplatePiece } from '../templatePieces.js'
import { TEMPLATE_WALL_UNDERLAY } from '../generators/templateDeck.js'
import { sizeFor, sizeIdOf } from '../mapGenerators.js'

function tipKeyOf(position) {
  return `${position.x},${position.y}`
}

function tipAlongX(x, y, tilesWide = 1) {
  return { x: x + tilesWide, y: y + 1 }
}

function tipAlongY(x, y, tilesLong = 1) {
  return { x: x + 1, y: y + tilesLong }
}

function cornerTip(x, y) {
  return { x: x + 1, y: y + 1 }
}

function wallAt(tiles, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false
  return tiles[y][x] === TEMPLATE_WALL_UNDERLAY
}

function openAt(tiles, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false
  const id = tiles[y][x]
  return id !== TEMPLATE_WALL_UNDERLAY && id !== NULL_TILE
}

function neighbours(tiles, width, height, x, y) {
  return {
    n: wallAt(tiles, width, height, x, y - 1),
    s: wallAt(tiles, width, height, x, y + 1),
    e: wallAt(tiles, width, height, x + 1, y),
    w: wallAt(tiles, width, height, x - 1, y),
  }
}

function isJunction(n, s, e, w) {
  return (n || s) && (e || w)
}

function straightRot(tiles, width, height, x, y, alongX) {
  if (alongX) {
    return openAt(tiles, width, height, x, y + 1) && !openAt(tiles, width, height, x, y - 1) ? 0 : 180
  }
  return openAt(tiles, width, height, x + 1, y) && !openAt(tiles, width, height, x - 1, y) ? 90 : 270
}

function freePieceId(pieceId, used) {
  let n = 1
  let id = `${pieceId}-${n}`
  while (used.has(id)) {
    n += 1
    id = `${pieceId}-${n}`
  }
  used.add(id)
  return id
}

function addIfFree(list, usedIds, tips, tip, pieceId, rotation) {
  if (!pieceId || !getTemplatePiece(pieceId)) return list
  const snapped = snapTemplatePiecePosition(tip, TEMPLATE_PIECE_CELL_PX)
  const key = tipKeyOf(snapped)
  if (tips.has(key)) return list
  if (list.some((entry) => tipKeyOf(entry.position) === key)) return list
  tips.add(key)
  return [
    ...list,
    {
      id: freePieceId(pieceId, usedIds),
      pieceId,
      position: snapped,
      rotation: normalizeTemplateRotation(rotation),
      scale: 1,
      order: list.length,
      autoPaint: true,
    },
  ]
}

/**
 * Prefer Template Deck size presets (same kit as locked Generate Map).
 * Picks the closest preset by area, then by manhattan size delta.
 */
export function snapAutoPaintGenerateSize(mapType, width, height) {
  const typeId = mapType === 'templateDeck' ? 'templateDeck' : 'starshipDeck'
  const currentId = sizeIdOf({ mapType: typeId, width, height })
  if (currentId && currentId !== 'custom') {
    return { width, height, sizeId: currentId, snapped: false }
  }

  const candidates = ['small', 'medium', 'large', 'huge', 'gigantic'].map((id) => {
    const size = sizeFor(typeId, id)
    const areaDelta = Math.abs(size.width * size.height - width * height)
    const manhattan = Math.abs(size.width - width) + Math.abs(size.height - height)
    return { id, ...size, areaDelta, manhattan }
  })
  candidates.sort((a, b) => a.areaDelta - b.areaDelta || a.manhattan - b.manhattan)
  const best = candidates[0]
  const snapped = best.width !== width || best.height !== height
  return { width: best.width, height: best.height, sizeId: best.id, snapped }
}

/**
 * Fill gaps the locked placer leaves: T/cross through-runs when the straight tip collides with the
 * corner tip, and any underlay cell that still has no piece tip nearby.
 */
export function ensureTemplateWallCoverage(map, kit) {
  const { width, height, tiles } = map
  const usedIds = new Set((map.templatePiecePlacements ?? []).map((entry) => entry.id))
  const tips = new Set((map.templatePiecePlacements ?? []).map((entry) => tipKeyOf(entry.position)))
  let list = [...(map.templatePiecePlacements ?? [])]
  const hullCell = (x, y) => x === 0 || y === 0 || x === width - 1 || y === height - 1
  const shortOf = (x, y) => (hullCell(x, y) ? kit.hull || kit.straight : kit.straight)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x] !== TEMPLATE_WALL_UNDERLAY) continue
      const { n, s, e, w } = neighbours(tiles, width, height, x, y)
      const cornerKey = tipKeyOf(snapTemplatePiecePosition(cornerTip(x, y), TEMPLATE_PIECE_CELL_PX))
      const hasCorner = tips.has(cornerKey)

      // T / cross: locked placer skips the through-straight when its tip equals the corner tip (rot 0 / 90).
      // Always fill on the alternate tip so we never collide with the corner post.
      if (isJunction(n, s, e, w)) {
        if (e && w) {
          const primary = tipKeyOf(snapTemplatePiecePosition(tipAlongX(x, y), TEMPLATE_PIECE_CELL_PX))
          const altTip = { x: x + 1, y: y + 0.5 }
          const alt = tipKeyOf(snapTemplatePiecePosition(altTip, TEMPLATE_PIECE_CELL_PX))
          if (hasCorner && !tips.has(primary) && !tips.has(alt)) {
            const rot = straightRot(tiles, width, height, x, y, true)
            list = addIfFree(list, usedIds, tips, altTip, shortOf(x, y), rot)
          }
        }
        if (n && s) {
          const primary = tipKeyOf(snapTemplatePiecePosition(tipAlongY(x, y), TEMPLATE_PIECE_CELL_PX))
          const altTip = { x: x + 0.5, y: y + 1 }
          const alt = tipKeyOf(snapTemplatePiecePosition(altTip, TEMPLATE_PIECE_CELL_PX))
          if (hasCorner && !tips.has(primary) && !tips.has(alt)) {
            const rot = straightRot(tiles, width, height, x, y, false)
            list = addIfFree(list, usedIds, tips, altTip, shortOf(x, y), rot)
          }
        }
      }

      // Orphan underlay: no corner tip and no straight tip for this cell.
      const alongX = e || w || (!n && !s)
      const straightTip = alongX ? tipAlongX(x, y) : tipAlongY(x, y)
      const straightKey = tipKeyOf(snapTemplatePiecePosition(straightTip, TEMPLATE_PIECE_CELL_PX))
      const longTip = alongX ? tipAlongX(x, y, 2) : tipAlongY(x, y, 2)
      const longKey = tipKeyOf(snapTemplatePiecePosition(longTip, TEMPLATE_PIECE_CELL_PX))
      const altKey = alongX
        ? tipKeyOf(snapTemplatePiecePosition({ x: x + 1, y: y + 0.5 }, TEMPLATE_PIECE_CELL_PX))
        : tipKeyOf(snapTemplatePiecePosition({ x: x + 0.5, y: y + 1 }, TEMPLATE_PIECE_CELL_PX))
      if (tips.has(cornerKey) || tips.has(straightKey) || tips.has(longKey) || tips.has(altKey)) continue
      // Also claimed when a long started on the previous cell.
      if (alongX && x > 0 && wallAt(tiles, width, height, x - 1, y)) {
        const prevLong = tipKeyOf(snapTemplatePiecePosition(tipAlongX(x - 1, y, 2), TEMPLATE_PIECE_CELL_PX))
        if (tips.has(prevLong)) continue
      }
      if (!alongX && y > 0 && wallAt(tiles, width, height, x, y - 1)) {
        const prevLong = tipKeyOf(snapTemplatePiecePosition(tipAlongY(x, y - 1, 2), TEMPLATE_PIECE_CELL_PX))
        if (tips.has(prevLong)) continue
      }
      const rot = straightRot(tiles, width, height, x, y, alongX)
      list = addIfFree(list, usedIds, tips, straightTip, shortOf(x, y), rot)
    }
  }

  return { ...map, templatePiecePlacements: list }
}
