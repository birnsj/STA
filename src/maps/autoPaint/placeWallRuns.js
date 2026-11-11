// Template 32 wall packing for Auto-Paint: 128 + 64 + 32 (corner stub).
// Independent of generators/templateDeck.js (frozen). Tip grid unit = 32px.
import { NULL_TILE, normalizeTemplateRotation } from '../mapFormat.js'
import { snapTemplatePiecePosition, TEMPLATE_PIECE_CELL_PX } from '../mapEdits.js'
import { getTemplatePiece } from '../templatePieces.js'

export const WALL_TIP_PX = TEMPLATE_PIECE_CELL_PX // 32
export const WALL_LEN_LONG = 128 // tip units: 4
export const WALL_LEN_SHORT = 64 // tip units: 2
export const WALL_LEN_STUB = 32 // tip units: 1 (corner post as a 32-long)

const UNDERLAY = 'templateWall'

function tipKeyOf(position) {
  return `${position.x},${position.y}`
}

function wallAt(tiles, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false
  return tiles[y][x] === UNDERLAY
}

function openAt(tiles, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false
  const id = tiles[y][x]
  return id !== UNDERLAY && id !== NULL_TILE
}

function isDoor(tiles, x, y, doorId) {
  return Boolean(doorId) && tiles[y]?.[x] === doorId
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

function straightRotation(tiles, width, height, x, y, alongX) {
  if (alongX) {
    return openAt(tiles, width, height, x, y + 1) && !openAt(tiles, width, height, x, y - 1) ? 0 : 180
  }
  return openAt(tiles, width, height, x + 1, y) && !openAt(tiles, width, height, x - 1, y) ? 90 : 270
}

function hullCell(width, height, x, y) {
  return x === 0 || y === 0 || x === width - 1 || y === height - 1
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

function addPiece(list, usedIds, tips, tip, pieceId, rotation) {
  if (!pieceId || !getTemplatePiece(pieceId)) return list
  const snapped = snapTemplatePiecePosition(tip, WALL_TIP_PX)
  const key = tipKeyOf(snapped)
  if (tips.has(key)) return list
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
 * Pack N underlay cells along a run into piece lengths.
 * One underlay cell = 64px = one short. Two cells = 128px = one long.
 */
export function packUnderlayRun(cellCount) {
  const parts = []
  let n = Math.max(0, cellCount | 0)
  while (n >= 2) {
    parts.push({ cells: 2, len: WALL_LEN_LONG })
    n -= 2
  }
  if (n === 1) parts.push({ cells: 1, len: WALL_LEN_SHORT })
  return parts
}

/**
 * Pack tip-grid length (count of 32px segments) with 128 + 64 + 32.
 * Corner post covers a leftover 32.
 */
export function packTipCells(tipCells) {
  const parts = []
  let n = Math.max(0, tipCells | 0)
  while (n >= 4) {
    parts.push({ tipCells: 4, len: WALL_LEN_LONG })
    n -= 4
  }
  while (n >= 2) {
    parts.push({ tipCells: 2, len: WALL_LEN_SHORT })
    n -= 2
  }
  if (n === 1) parts.push({ tipCells: 1, len: WALL_LEN_STUB })
  return parts
}

function tipForSegment(x0, y0, alongX, cellsWide, rot) {
  // South tip of a segment that starts at underlay cell (x0,y0) and spans `cellsWide` cells.
  if (alongX) {
    if (rot === 180) return { x: x0 + cellsWide, y: y0 + 0.5 }
    return { x: x0 + cellsWide, y: y0 + 1 }
  }
  if (rot === 270) return { x: x0 + 0.5, y: y0 + cellsWide }
  return { x: x0 + 1, y: y0 + cellsWide }
}

function tipForStub(x, y, alongX, rot) {
  // 32-long stub: corner-sized piece centered on the cell edge.
  if (alongX) {
    if (rot === 180) return { x: x + 0.5, y: y + 0.5 }
    return { x: x + 0.5, y: y + 1 }
  }
  if (rot === 270) return { x: x + 0.5, y: y + 0.5 }
  return { x: x + 1, y: y + 0.5 }
}

function pieceForLen(kit, len, onHull) {
  if (len === WALL_LEN_LONG) return onHull ? kit.hullLong || kit.straightLong : kit.straightLong || kit.straight
  if (len === WALL_LEN_SHORT) return onHull ? kit.hull || kit.straight : kit.straight
  // 32 stub: corner art as a short post
  return onHull ? kit.hullCorner || kit.corner : kit.corner
}

/**
 * Place Template Pieces on templateWall underlay using 128/64/32 packing.
 * doorId: doorway tile id for door-frame pieces (optional).
 */
export function placePackedWallPieces(map, kit, { doorId = null, random = Math.random } = {}) {
  const { width, height, tiles } = map
  const usedIds = new Set((map.templatePiecePlacements ?? []).map((entry) => entry.id))
  const tips = new Set()
  let list = []

  // Keep non-auto pieces; drop prior auto pieces (caller usually cleared them).
  for (const entry of map.templatePiecePlacements ?? []) {
    if (entry.autoPaint) continue
    list.push(entry)
    tips.add(tipKeyOf(entry.position))
    usedIds.add(entry.id)
  }

  const keyOf = (x, y) => `${x},${y}`
  const consumed = new Set()

  // 1) Door frames
  if (doorId && kit.doorFrame) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isDoor(tiles, x, y, doorId)) continue
        const alongX = wallAt(tiles, width, height, x - 1, y) || wallAt(tiles, width, height, x + 1, y)
        const rot = straightRotation(tiles, width, height, x, y, alongX)
        const tip = alongX ? { x: x + 1, y: y + 1 } : { x: x + 1, y: y + 1 }
        list = addPiece(list, usedIds, tips, tip, kit.doorFrame, rot)
      }
    }
  }

  // 2) Corners at every junction (32×32 posts)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!wallAt(tiles, width, height, x, y)) continue
      const { n, s, e, w } = neighbours(tiles, width, height, x, y)
      if (!isJunction(n, s, e, w)) continue
      const onHull = hullCell(width, height, x, y)
      const piece = onHull ? kit.hullCorner || kit.corner : kit.corner
      list = addPiece(list, usedIds, tips, { x: x + 1, y: y + 1 }, piece, cornerRotation(n, s, e, w))
      // L-corners are fully covered by the post; straights start beside them.
      if (isLCorner(n, s, e, w)) consumed.add(keyOf(x, y))
    }
  }

  // 3) Straight runs on remaining underlay cells (each cell once)
  const visit = new Set(consumed)

  const claimRun = (cells, alongX) => {
    if (!cells.length) return
    const packs = packUnderlayRun(cells.length)
    let index = 0
    for (const part of packs) {
      const start = cells[index]
      const onHull = cells.slice(index, index + part.cells).every((cell) => hullCell(width, height, cell.x, cell.y))
      const rot = straightRotation(tiles, width, height, start.x, start.y, alongX)
      const pieceId = pieceForLen(kit, part.len, onHull)
      // Prefer alternate tip when the primary tip is already taken by a corner post.
      let tip = tipForSegment(start.x, start.y, alongX, part.cells, rot)
      const primaryKey = tipKeyOf(snapTemplatePiecePosition(tip, WALL_TIP_PX))
      if (tips.has(primaryKey)) {
        tip = tipForSegment(start.x, start.y, alongX, part.cells, alongX ? (rot === 0 ? 180 : 0) : rot === 90 ? 270 : 90)
      }
      list = addPiece(list, usedIds, tips, tip, pieceId, rot)
      index += part.cells
    }
  }

  // Horizontal runs
  for (let y = 0; y < height; y++) {
    let run = []
    const flush = () => {
      claimRun(run, true)
      run = []
    }
    for (let x = 0; x < width; x++) {
      const key = keyOf(x, y)
      if (!wallAt(tiles, width, height, x, y) || visit.has(key)) {
        flush()
        continue
      }
      const { n, s, e, w } = neighbours(tiles, width, height, x, y)
      // Only cells that belong to an X-run (have E/W neighbour, or lone east-west wall).
      const alongX = e || w || (!n && !s)
      if (!alongX && (n || s)) {
        flush()
        continue
      }
      visit.add(key)
      run.push({ x, y })
      if (!e) flush()
    }
    flush()
  }

  // Vertical runs (cells not yet visited)
  for (let x = 0; x < width; x++) {
    let run = []
    const flush = () => {
      claimRun(run, false)
      run = []
    }
    for (let y = 0; y < height; y++) {
      const key = keyOf(x, y)
      if (!wallAt(tiles, width, height, x, y) || visit.has(key)) {
        flush()
        continue
      }
      visit.add(key)
      run.push({ x, y })
      const { s } = neighbours(tiles, width, height, x, y)
      if (!s) flush()
    }
    flush()
  }

  // 4) Any underlay cell still without a nearby piece: 32 stub (corner art)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!wallAt(tiles, width, height, x, y)) continue
      const { n, s, e, w } = neighbours(tiles, width, height, x, y)
      const alongX = e || w || (!n && !s)
      const rot = straightRotation(tiles, width, height, x, y, alongX)
      const candidates = [
        { x: x + 1, y: y + 1 },
        tipForSegment(x, y, alongX, 1, rot),
        tipForSegment(x, y, alongX, 1, alongX ? 180 : 270),
        tipForStub(x, y, alongX, rot),
      ]
      if (candidates.some((tip) => tips.has(tipKeyOf(snapTemplatePiecePosition(tip, WALL_TIP_PX))))) continue
      const onHull = hullCell(width, height, x, y)
      list = addPiece(list, usedIds, tips, tipForStub(x, y, alongX, rot), pieceForLen(kit, WALL_LEN_STUB, onHull), rot)
    }
  }

  void random
  return { ...map, templatePiecePlacements: list }
}
