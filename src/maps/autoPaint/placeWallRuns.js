// Template 32 wall packing for Auto-Paint: 128 + 64 + 32 (corner stub).
// Independent of generators/templateDeck.js (frozen). Tip grid unit = 32px.
//
// Geometry (tile units; 1 = 64px underlay cell; tip grid step = 0.5):
// - Tip is the +X/+Y corner of the footprint; box extends toward −X/−Y.
// - Horizontal straight tipAlongX(x,y) → south-edge strip of cell (x,y).
// - Vertical straight tipAlongY(x,y) → east-edge strip of cell (x,y).
// - Corner tip (x+1,y+1) → SE 32×32 of the junction cell only.
// - Arms from −X / −Y therefore leave a 0.5-cell gap to that post; +X / +Y meet flush.
// - Junction fills use tips (x+0.5,y+1) and (x+1,y+0.5) on those same edges — never
//   tipAlongX/Y (collides with the corner tip) and never the axis-swapped half tips.
import { NULL_TILE, normalizeTemplateRotation } from '../mapFormat.js'
import { snapTemplatePiecePosition, TEMPLATE_PIECE_CELL_PX } from '../mapEdits.js'
import { getTemplatePiece, templatePieceFootprint } from '../templatePieces.js'

export const WALL_TIP_PX = TEMPLATE_PIECE_CELL_PX // 32
export const WALL_LEN_LONG = 128 // tip units: 4 (= 2 underlay cells)
export const WALL_LEN_SHORT = 64 // tip units: 2 (= 1 underlay cell)
export const WALL_LEN_STUB = 32 // tip units: 1 (corner post as a 32-long)

const UNDERLAY = 'templateWall'
const TIP_EPS = 1e-6

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

function tipAlongX(x, y, tilesWide = 1) {
  return { x: x + tilesWide, y: y + 1 }
}

function tipAlongY(x, y, tilesLong = 1) {
  return { x: x + 1, y: y + tilesLong }
}

function cornerTip(x, y) {
  return { x: x + 1, y: y + 1 }
}

/** South-edge fill tip: closes the 0.5-cell gap west of the SE corner post. */
function junctionFillTipAlongX(x, y) {
  return { x: x + 0.5, y: y + 1 }
}

/** East-edge fill tip: closes the 0.5-cell gap north of the SE corner post. */
function junctionFillTipAlongY(x, y) {
  return { x: x + 1, y: y + 0.5 }
}

function addPiece(list, usedIds, tips, tip, pieceId, rotation) {
  if (!pieceId || !getTemplatePiece(pieceId)) return { list, placed: false }
  const snapped = snapTemplatePiecePosition(tip, WALL_TIP_PX)
  const key = tipKeyOf(snapped)
  if (tips.has(key)) return { list, placed: false }
  tips.add(key)
  return {
    list: [
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
    ],
    placed: true,
  }
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

function pieceForLen(kit, len, onHull) {
  if (len === WALL_LEN_LONG) return onHull ? kit.hullLong || kit.straightLong || kit.straight : kit.straightLong || kit.straight
  if (len === WALL_LEN_SHORT) return onHull ? kit.hull || kit.straight : kit.straight
  return onHull ? kit.hullCorner || kit.corner : kit.corner
}

/** Axis-aligned footprint AABB in tile units (tip = +X/+Y corner). */
export function pieceFootprintAabb(entry) {
  const def = getTemplatePiece(entry.pieceId)
  if (!def) return null
  const fp = templatePieceFootprint(def, entry.rotation ?? 0)
  if (!fp) return null
  const tip = entry.position
  const w = fp.width / 64
  const d = fp.depth / 64
  return { minX: tip.x - w, maxX: tip.x, minY: tip.y - d, maxY: tip.y }
}

function intervalCovered(intervals, start, end) {
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let cur = start
  for (const [a, b] of sorted) {
    if (b <= cur + TIP_EPS) continue
    if (a > cur + TIP_EPS) return false
    cur = Math.max(cur, b)
    if (cur >= end - TIP_EPS) return true
  }
  return cur >= end - TIP_EPS
}

/**
 * True when every required non-doorway wall edge segment is covered by a piece footprint.
 * Straight cells need their full south (E–W) or east (N–S) edge. Junctions only require the
 * half-edges that actually meet an arm (−X/−Y gaps + +X/+Y flush quarters) so L insides stay open.
 */
export function wallEdgesContinuouslyCovered(map, placements, { doorId = null } = {}) {
  const { width, height, tiles } = map
  const pieces = placements ?? map.templatePiecePlacements ?? []
  const south = new Map() // y -> [x0,x1][]
  const east = new Map() // x -> [y0,y1][]

  const push = (mapRef, key, a, b) => {
    if (!mapRef.has(key)) mapRef.set(key, [])
    mapRef.get(key).push([a, b])
  }

  for (const entry of pieces) {
    const box = pieceFootprintAabb(entry)
    if (!box) continue
    const thickX = box.maxX - box.minX
    const thickY = box.maxY - box.minY
    // Horizontal run (or square corner): cover the south edge of the footprint.
    if (thickX + TIP_EPS >= 0.5) push(south, box.maxY, box.minX, box.maxX)
    // Vertical run (or square corner): cover the east edge of the footprint.
    if (thickY + TIP_EPS >= 0.5) push(east, box.maxX, box.minY, box.maxY)
  }

  const okSouth = (x0, x1, edgeY) => intervalCovered(south.get(edgeY) ?? [], x0, x1)
  const okEast = (y0, y1, edgeX) => intervalCovered(east.get(edgeX) ?? [], y0, y1)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!wallAt(tiles, width, height, x, y)) continue
      if (doorId && isDoor(tiles, x, y, doorId)) continue
      const { n, s, e, w } = neighbours(tiles, width, height, x, y)
      if (isJunction(n, s, e, w)) {
        if (w && !okSouth(x, x + 0.5, y + 1)) return false
        if (e && !okSouth(x + 0.5, x + 1, y + 1)) return false
        if (n && !okEast(y, y + 0.5, x + 1)) return false
        if (s && !okEast(y + 0.5, y + 1, x + 1)) return false
        continue
      }
      const alongX = e || w || (!n && !s)
      if (alongX) {
        if (!okSouth(x, x + 1, y + 1)) return false
      } else if (!okEast(y, y + 1, x + 1)) {
        return false
      }
    }
  }
  return true
}

/**
 * Place one greedy straight (1 or 2 cells). Stops before junctions / axis bends.
 * Marks covered underlay cells in `consumed` only when a piece was actually placed.
 */
function placeStraightGreedy(list, usedIds, tips, tiles, width, height, x, y, alongX, onHull, consumed, keyOf, kit) {
  const shortId = pieceForLen(kit, WALL_LEN_SHORT, onHull)
  const longId = pieceForLen(kit, WALL_LEN_LONG, onHull)
  if (alongX) {
    const next = wallAt(tiles, width, height, x + 1, y) && !consumed.has(keyOf(x + 1, y))
    const nn = next ? neighbours(tiles, width, height, x + 1, y) : null
    const nextBlocked =
      nn && (isLCorner(nn.n, nn.s, nn.e, nn.w) || isJunction(nn.n, nn.s, nn.e, nn.w) || nn.n || nn.s)
    const nextOnHull = next && hullCell(width, height, x + 1, y)
    const longOk = next && !nextBlocked && onHull === nextOnHull && longId
    const rot = straightRotation(tiles, width, height, x, y, true)
    if (longOk) {
      const placed = addPiece(list, usedIds, tips, tipAlongX(x, y, 2), longId, rot)
      if (placed.placed) {
        consumed.add(keyOf(x, y))
        consumed.add(keyOf(x + 1, y))
      }
      return placed.list
    }
    const placed = addPiece(list, usedIds, tips, tipAlongX(x, y), shortId, rot)
    if (placed.placed) consumed.add(keyOf(x, y))
    return placed.list
  }

  const next = wallAt(tiles, width, height, x, y + 1) && !consumed.has(keyOf(x, y + 1))
  const nn = next ? neighbours(tiles, width, height, x, y + 1) : null
  const nextBlocked =
    nn && (isLCorner(nn.n, nn.s, nn.e, nn.w) || isJunction(nn.n, nn.s, nn.e, nn.w) || nn.e || nn.w)
  const nextOnHull = next && hullCell(width, height, x, y + 1)
  const longOk = next && !nextBlocked && onHull === nextOnHull && longId
  const rot = straightRotation(tiles, width, height, x, y, false)
  if (longOk) {
    const placed = addPiece(list, usedIds, tips, tipAlongY(x, y, 2), longId, rot)
    if (placed.placed) {
      consumed.add(keyOf(x, y))
      consumed.add(keyOf(x, y + 1))
    }
    return placed.list
  }
  const placed = addPiece(list, usedIds, tips, tipAlongY(x, y), shortId, rot)
  if (placed.placed) consumed.add(keyOf(x, y))
  return placed.list
}

/**
 * Place Template Pieces on templateWall underlay using 128/64/32 packing.
 * Tracks underlay-cell coverage explicitly. doorId + kit.doorFrame both required for frames.
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
    tips.add(tipKeyOf(snapTemplatePiecePosition(entry.position, WALL_TIP_PX)))
    usedIds.add(entry.id)
  }

  const keyOf = (x, y) => `${x},${y}`
  const consumed = new Set()

  // 1) Door frames — only when the ruleset supplied a doorFrame piece.
  if (doorId && kit.doorFrame) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isDoor(tiles, x, y, doorId)) continue
        const alongX = wallAt(tiles, width, height, x - 1, y) || wallAt(tiles, width, height, x + 1, y)
        const rot = straightRotation(tiles, width, height, x, y, alongX)
        const tip = alongX ? tipAlongX(x, y) : tipAlongY(x, y)
        list = addPiece(list, usedIds, tips, tip, kit.doorFrame, rot).list
      }
    }
  }

  // 2) Corner posts at every junction (SE tip). Do not consume yet — pass 3 fills −X/−Y gaps.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!wallAt(tiles, width, height, x, y)) continue
      const { n, s, e, w } = neighbours(tiles, width, height, x, y)
      if (!isJunction(n, s, e, w)) continue
      const onHull = hullCell(width, height, x, y)
      const piece = onHull ? kit.hullCorner || kit.corner : kit.corner
      list = addPiece(list, usedIds, tips, cornerTip(x, y), piece, cornerRotation(n, s, e, w)).list
    }
  }

  // 3) Junction fills + greedy 128/64 straights.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!wallAt(tiles, width, height, x, y) || consumed.has(keyOf(x, y))) continue
      const { n, s, e, w } = neighbours(tiles, width, height, x, y)
      const onHull = hullCell(width, height, x, y)
      const runPiece = pieceForLen(kit, WALL_LEN_SHORT, onHull)

      if (isJunction(n, s, e, w)) {
        // Close half-cell gaps west / north of the SE corner post. +X / +Y arms already meet flush.
        // Tips stay on the south / east edges — never the axis-swapped half offsets.
        if (w) {
          const rot = straightRotation(tiles, width, height, x, y, true)
          list = addPiece(list, usedIds, tips, junctionFillTipAlongX(x, y), runPiece, rot).list
        }
        if (n) {
          const rot = straightRotation(tiles, width, height, x, y, false)
          list = addPiece(list, usedIds, tips, junctionFillTipAlongY(x, y), runPiece, rot).list
        }
        consumed.add(keyOf(x, y))
        continue
      }

      const alongX = e || w || (!n && !s)
      list = placeStraightGreedy(list, usedIds, tips, tiles, width, height, x, y, alongX, onHull, consumed, keyOf, kit)
    }
  }

  // 4) Safety: any still-uncovered underlay cell gets a short straight (not a corner stub flood).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!wallAt(tiles, width, height, x, y) || consumed.has(keyOf(x, y))) continue
      const { n, s, e, w } = neighbours(tiles, width, height, x, y)
      const alongX = e || w || (!n && !s)
      const onHull = hullCell(width, height, x, y)
      const rot = straightRotation(tiles, width, height, x, y, alongX)
      const tip = alongX ? tipAlongX(x, y) : tipAlongY(x, y)
      let result = addPiece(list, usedIds, tips, tip, pieceForLen(kit, WALL_LEN_SHORT, onHull), rot)
      list = result.list
      if (!result.placed) {
        // Primary tip blocked — try the junction-style half tip on the same edge.
        const alt = alongX ? junctionFillTipAlongX(x, y) : junctionFillTipAlongY(x, y)
        result = addPiece(list, usedIds, tips, alt, pieceForLen(kit, WALL_LEN_SHORT, onHull), rot)
        list = result.list
      }
      if (result.placed) consumed.add(keyOf(x, y))
    }
  }

  void random
  return { ...map, templatePiecePlacements: list }
}
