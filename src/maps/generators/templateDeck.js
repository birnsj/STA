// Template Deck: Starship Deck room grid whose walls are Template Pieces (32-thick overlays).
// Underlay walls are invisible solid `templateWall` (pathing / sight). Junctions get a
// Corner-named 32×32 post; L-bends are corner-only (arms are neighbour straights); T/cross
// also keep a through-run straight on a tip that does not collide with the corner.
// Piece / underlay kit comes from templateDeckStyles.js (Generator Editor). Prototype layout.
import { FLOOR_TILE, NULL_TILE, normalizeTemplateRotation } from '../mapFormat.js'
import { snapTemplatePiecePosition, TEMPLATE_PIECE_CELL_PX } from '../mapEdits.js'
import { getTemplatePiece } from '../templatePieces.js'
import { makeDeckGenerator } from './starshipDeck.js'
import { getTemplateDeckStyle } from './templateDeckStyles.js'
import { DOOR_TILE } from './shared.js'

export const TEMPLATE_WALL_UNDERLAY = 'templateWall'

const isUnderlayWall = (id) => id === TEMPLATE_WALL_UNDERLAY
const isDoor = (id) => id === DOOR_TILE

function wallAt(tiles, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false
  return isUnderlayWall(tiles[y][x])
}

function openAt(tiles, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false
  const id = tiles[y][x]
  return !isUnderlayWall(id) && id !== NULL_TILE
}

function pickFitting(fittings, random) {
  if (!fittings.length) return null
  return fittings[Math.floor(random() * fittings.length)]
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

function tipKeyOf(position) {
  return `${position.x},${position.y}`
}

function addPiece(list, usedIds, tip, pieceId, rotation) {
  if (!getTemplatePiece(pieceId)) return list
  const snapped = snapTemplatePiecePosition(tip, TEMPLATE_PIECE_CELL_PX)
  const tipKey = tipKeyOf(snapped)
  if (list.some((entry) => tipKeyOf(entry.position) === tipKey)) return list
  return [
    ...list,
    {
      id: freePieceId(pieceId, usedIds),
      pieceId,
      position: snapped,
      rotation: normalizeTemplateRotation(rotation),
      scale: 1,
      order: list.length,
    },
  ]
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

function cornerRotation(n, s, e, w) {
  if (n && e && !s && !w) return 0
  if (e && s && !w && !n) return 90
  if (s && w && !n && !e) return 180
  if (w && n && !e && !s) return 270
  if (!n) return 0
  if (!e) return 90
  if (!s) return 180
  if (!w) return 270
  return 0
}

function straightRotationFacingOpen(tiles, width, height, x, y, alongX) {
  if (alongX) {
    return openAt(tiles, width, height, x, y + 1) && !openAt(tiles, width, height, x, y - 1) ? 0 : 180
  }
  return openAt(tiles, width, height, x + 1, y) && !openAt(tiles, width, height, x - 1, y) ? 90 : 270
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

function isLCorner(n, s, e, w) {
  return (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0) === 2 && isJunction(n, s, e, w)
}

function placeStraightRun(list, usedIds, tiles, width, height, x, y, alongX, onHull, random, consumed, keyOf, kit) {
  const { straight, straightLong, hull, hullLong, fittings, fittingChance } = kit
  if (alongX) {
    const next = wallAt(tiles, width, height, x + 1, y) && !consumed.has(keyOf(x + 1, y))
    const nn = next ? neighbours(tiles, width, height, x + 1, y) : null
    const nextBlocked = nn && (isLCorner(nn.n, nn.s, nn.e, nn.w) || isJunction(nn.n, nn.s, nn.e, nn.w) || nn.n || nn.s)
    const nextOnHull = next && (x + 1 === 0 || y === 0 || x + 1 === width - 1 || y === height - 1)
    const longOk = next && !nextBlocked && onHull === nextOnHull
    const rot = straightRotationFacingOpen(tiles, width, height, x, y, true)
    if (longOk) {
      list = addPiece(list, usedIds, tipAlongX(x, y, 2), onHull ? hullLong : straightLong, rot)
      consumed.add(keyOf(x, y))
      consumed.add(keyOf(x + 1, y))
      return list
    }
    const fitting = !onHull && random() < fittingChance ? pickFitting(fittings, random) : null
    const piece = onHull ? hull : fitting || straight
    list = addPiece(list, usedIds, tipAlongX(x, y), piece, rot)
    consumed.add(keyOf(x, y))
    return list
  }

  const next = wallAt(tiles, width, height, x, y + 1) && !consumed.has(keyOf(x, y + 1))
  const nn = next ? neighbours(tiles, width, height, x, y + 1) : null
  const nextBlocked = nn && (isLCorner(nn.n, nn.s, nn.e, nn.w) || isJunction(nn.n, nn.s, nn.e, nn.w) || nn.e || nn.w)
  const nextOnHull = next && (x === 0 || y + 1 === 0 || x === width - 1 || y + 1 === height - 1)
  const longOk = next && !nextBlocked && onHull === nextOnHull
  const rot = straightRotationFacingOpen(tiles, width, height, x, y, false)
  if (longOk) {
    list = addPiece(list, usedIds, tipAlongY(x, y, 2), onHull ? hullLong : straightLong, rot)
    consumed.add(keyOf(x, y))
    consumed.add(keyOf(x, y + 1))
    return list
  }
  const fitting = !onHull && random() < fittingChance ? pickFitting(fittings, random) : null
  const piece = onHull ? hull : fitting || straight
  list = addPiece(list, usedIds, tipAlongY(x, y), piece, rot)
  consumed.add(keyOf(x, y))
  return list
}

export function placeTemplateWalls(map, random = Math.random, kit = getTemplateDeckStyle()) {
  const { width, height, tiles } = map
  let list = []
  const usedIds = new Set()
  const consumed = new Set()
  const keyOf = (x, y) => `${x},${y}`
  const hullCell = (x, y) => x === 0 || y === 0 || x === width - 1 || y === height - 1
  const { corner, hull, hullCorner, doorFrame, straight } = kit

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isDoor(tiles[y][x])) continue
      const alongX = wallAt(tiles, width, height, x - 1, y) || wallAt(tiles, width, height, x + 1, y)
      const rot = straightRotationFacingOpen(tiles, width, height, x, y, alongX)
      list = addPiece(list, usedIds, alongX ? tipAlongX(x, y) : tipAlongY(x, y), doorFrame, rot)
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isUnderlayWall(tiles[y][x])) continue
      const { n, s, e, w } = neighbours(tiles, width, height, x, y)
      if (!isJunction(n, s, e, w)) continue
      const piece = hullCell(x, y) ? hullCorner : corner
      list = addPiece(list, usedIds, cornerTip(x, y), piece, cornerRotation(n, s, e, w))
      if (isLCorner(n, s, e, w)) consumed.add(keyOf(x, y))
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isUnderlayWall(tiles[y][x]) || consumed.has(keyOf(x, y))) continue
      const { n, s, e, w } = neighbours(tiles, width, height, x, y)
      const onHull = hullCell(x, y)

      if (isJunction(n, s, e, w)) {
        if (e && w) {
          const rot = straightRotationFacingOpen(tiles, width, height, x, y, true)
          const tip = rot === 180 ? { x: x + 1, y: y + 0.5 } : tipAlongX(x, y)
          list = addPiece(list, usedIds, tip, onHull ? hull : straight, rot)
        } else if (n && s) {
          const rot = straightRotationFacingOpen(tiles, width, height, x, y, false)
          const tip = rot === 270 ? { x: x + 0.5, y: y + 1 } : tipAlongY(x, y)
          list = addPiece(list, usedIds, tip, onHull ? hull : straight, rot)
        }
        consumed.add(keyOf(x, y))
        continue
      }

      const alongX = e || w || (!n && !s)
      list = placeStraightRun(list, usedIds, tiles, width, height, x, y, alongX, onHull, random, consumed, keyOf, kit)
    }
  }

  return { ...map, templatePiecePlacements: list }
}

export function generateTemplateDeck(map, random, areaNames) {
  const style = getTemplateDeckStyle()
  const layout = makeDeckGenerator({
    floor: style.floor,
    wall: TEMPLATE_WALL_UNDERLAY,
    door: style.door,
    crate: style.crate,
    machinery: style.machinery,
    hazard: style.hazard,
  })(map, random, areaNames)
  const floorUnder = { ...(layout.floorUnder ?? {}) }
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      if (layout.tiles[y][x] === TEMPLATE_WALL_UNDERLAY) floorUnder[`${x},${y}`] = style.floor || FLOOR_TILE
    }
  }
  return placeTemplateWalls({ ...layout, floorUnder, templatePiecePlacements: [] }, random, style)
}
