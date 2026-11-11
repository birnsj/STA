// Phase 1: place templateWall underlay + 32px Template Pieces around a floor footprint.
// Collision: same as Template Deck — solid full-cell underlay on exterior Null cells; overlays are visual-only.
import { NULL_TILE, cellKey, normalizeTemplateRotation } from '../mapFormat.js'
import { snapTemplatePiecePosition, TEMPLATE_PIECE_CELL_PX } from '../mapEdits.js'
import { getTemplatePiece } from '../templatePieces.js'
import { collectFloorKeys, exteriorUnderlayKeys, floorIdsForRuleset, parseCellKey } from './topology.js'

const TEMPLATE_WALL_UNDERLAY = 'templateWall'

export function tipKeyOf(position) {
  return `${position.x},${position.y}`
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

function wallAt(tiles, width, height, underlayId, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false
  return tiles[y][x] === underlayId
}

function openAt(tiles, width, height, underlayId, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false
  const id = tiles[y][x]
  return id !== underlayId && id !== NULL_TILE
}

function straightRotationFacingOpen(tiles, width, height, underlayId, x, y, alongX) {
  if (alongX) {
    return openAt(tiles, width, height, underlayId, x, y + 1) && !openAt(tiles, width, height, underlayId, x, y - 1) ? 0 : 180
  }
  return openAt(tiles, width, height, underlayId, x + 1, y) && !openAt(tiles, width, height, underlayId, x - 1, y) ? 90 : 270
}

function neighbours(tiles, width, height, underlayId, x, y) {
  return {
    n: wallAt(tiles, width, height, underlayId, x, y - 1),
    s: wallAt(tiles, width, height, underlayId, x, y + 1),
    e: wallAt(tiles, width, height, underlayId, x + 1, y),
    w: wallAt(tiles, width, height, underlayId, x - 1, y),
  }
}

function isJunction(n, s, e, w) {
  return (n || s) && (e || w)
}

function isLCorner(n, s, e, w) {
  return (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0) === 2 && isJunction(n, s, e, w)
}

function pickFitting(fittings, random) {
  if (!fittings.length) return null
  return fittings[Math.floor(random() * fittings.length)]
}

function addPiece(list, usedIds, tip, pieceId, rotation, blockedTips) {
  if (!pieceId || !getTemplatePiece(pieceId)) return list
  const snapped = snapTemplatePiecePosition(tip, TEMPLATE_PIECE_CELL_PX)
  const tipKey = tipKeyOf(snapped)
  if (blockedTips.has(tipKey)) return list
  if (list.some((entry) => tipKeyOf(entry.position) === tipKey)) return list
  blockedTips.add(tipKey)
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

function placeStraightRun(list, usedIds, tiles, width, height, underlayId, x, y, alongX, onHull, random, consumed, keyOf, kit, blockedTips) {
  const straight = onHull ? kit.hull || kit.straight : kit.straight
  const straightLong = onHull ? kit.hullLong || kit.straightLong : kit.straightLong
  const fittings = kit.fittings ?? []
  const fittingChance = kit.fittingChance ?? 0
  if (alongX) {
    const next = wallAt(tiles, width, height, underlayId, x + 1, y) && !consumed.has(keyOf(x + 1, y))
    const nn = next ? neighbours(tiles, width, height, underlayId, x + 1, y) : null
    const nextBlocked = nn && (isLCorner(nn.n, nn.s, nn.e, nn.w) || isJunction(nn.n, nn.s, nn.e, nn.w) || nn.n || nn.s)
    const longOk = next && !nextBlocked && straightLong
    const rot = straightRotationFacingOpen(tiles, width, height, underlayId, x, y, true)
    if (longOk) {
      list = addPiece(list, usedIds, tipAlongX(x, y, 2), straightLong, rot, blockedTips)
      consumed.add(keyOf(x, y))
      consumed.add(keyOf(x + 1, y))
      return list
    }
    const fitting = !onHull && random() < fittingChance ? pickFitting(fittings, random) : null
    list = addPiece(list, usedIds, tipAlongX(x, y), fitting || straight, rot, blockedTips)
    consumed.add(keyOf(x, y))
    return list
  }

  const next = wallAt(tiles, width, height, underlayId, x, y + 1) && !consumed.has(keyOf(x, y + 1))
  const nn = next ? neighbours(tiles, width, height, underlayId, x, y + 1) : null
  const nextBlocked = nn && (isLCorner(nn.n, nn.s, nn.e, nn.w) || isJunction(nn.n, nn.s, nn.e, nn.w) || nn.e || nn.w)
  const longOk = next && !nextBlocked && straightLong
  const rot = straightRotationFacingOpen(tiles, width, height, underlayId, x, y, false)
  if (longOk) {
    list = addPiece(list, usedIds, tipAlongY(x, y, 2), straightLong, rot, blockedTips)
    consumed.add(keyOf(x, y))
    consumed.add(keyOf(x, y + 1))
    return list
  }
  const fitting = !onHull && random() < fittingChance ? pickFitting(fittings, random) : null
  list = addPiece(list, usedIds, tipAlongY(x, y), fitting || straight, rot, blockedTips)
  consumed.add(keyOf(x, y))
  return list
}

function placePiecesOnUnderlay(map, underlayId, kit, random, blockedTips) {
  const { width, height, tiles } = map
  let list = []
  const usedIds = new Set((map.templatePiecePlacements ?? []).map((entry) => entry.id))
  const consumed = new Set()
  const keyOf = (x, y) => `${x},${y}`
  // Phase 1 exterior ring: treat every underlay cell as hull-facing.
  const onHull = true
  const corner = kit.hullCorner || kit.corner
  const straight = kit.hull || kit.straight
  const blocked = new Set(blockedTips)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x] !== underlayId) continue
      const { n, s, e, w } = neighbours(tiles, width, height, underlayId, x, y)
      if (!isJunction(n, s, e, w)) continue
      list = addPiece(list, usedIds, cornerTip(x, y), corner, cornerRotation(n, s, e, w), blocked)
      if (isLCorner(n, s, e, w)) consumed.add(keyOf(x, y))
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x] !== underlayId || consumed.has(keyOf(x, y))) continue
      const { n, s, e, w } = neighbours(tiles, width, height, underlayId, x, y)

      if (isJunction(n, s, e, w)) {
        if (e && w) {
          const rot = straightRotationFacingOpen(tiles, width, height, underlayId, x, y, true)
          const tip = rot === 180 ? { x: x + 1, y: y + 0.5 } : tipAlongX(x, y)
          list = addPiece(list, usedIds, tip, straight, rot, blocked)
        } else if (n && s) {
          const rot = straightRotationFacingOpen(tiles, width, height, underlayId, x, y, false)
          const tip = rot === 270 ? { x: x + 0.5, y: y + 1 } : tipAlongY(x, y)
          list = addPiece(list, usedIds, tip, straight, rot, blocked)
        }
        consumed.add(keyOf(x, y))
        continue
      }

      const alongX = e || w || (!n && !s)
      list = placeStraightRun(list, usedIds, tiles, width, height, underlayId, x, y, alongX, onHull, random, consumed, keyOf, kit, blocked)
    }
  }

  return list
}

/**
 * Clear previous auto underlay/pieces for a region, then rebuild from current floors.
 * Preserves manual underlay keys, non-auto / manual pieces, and suppressed tips.
 */
export function assembleWallsFromFloors(map, ruleset, { regionId = 'region-1', random = Math.random } = {}) {
  const floorIds = floorIdsForRuleset(ruleset)
  const underlayId = ruleset.underlayWallTile || TEMPLATE_WALL_UNDERLAY
  const prev = map.autoPaint ?? null
  const prevRegion = prev?.regions?.find((entry) => entry.id === regionId) ?? null
  const manualUnderlay = new Set(prevRegion?.manualUnderlayKeys ?? [])
  const manualPieceIds = new Set(prevRegion?.manualPieceIds ?? [])
  const suppressedTips = new Set(prevRegion?.suppressedTipKeys ?? [])

  const floorKeys = collectFloorKeys(map, floorIds)
  // Candidates from current Null neighbours; also re-claim prior auto underlay still marked as ours.
  const fromNull = exteriorUnderlayKeys(map, floorKeys)
  const underlayKeys = [...new Set([...fromNull, ...(prevRegion?.generatedUnderlayKeys ?? [])])]
    .filter((key) => !manualUnderlay.has(key))
    .filter((key) => {
      const { x, y } = parseCellKey(key)
      if (y < 0 || x < 0 || y >= map.height || x >= map.width) return false
      const id = map.tiles[y][x]
      // Only Null or our previous underlay — never overwrite hand floors/walls.
      return id === NULL_TILE || (id === underlayId && (prevRegion?.generatedUnderlayKeys ?? []).includes(key))
    })

  const tiles = map.tiles.map((row) => row.slice())
  const floorUnder = { ...(map.floorUnder ?? {}) }
  const prevGenerated = new Set(prevRegion?.generatedUnderlayKeys ?? [])

  // Strip prior generated underlay: restore the remembered previous cell (Null stays Null).
  for (const key of prevGenerated) {
    if (manualUnderlay.has(key)) continue
    if (underlayKeys.includes(key)) continue
    const { x, y } = parseCellKey(key)
    if (tiles[y]?.[x] !== underlayId) continue
    const restore = floorUnder[key] ?? NULL_TILE
    tiles[y][x] = restore
    delete floorUnder[key]
  }

  for (const key of underlayKeys) {
    const { x, y } = parseCellKey(key)
    const current = tiles[y][x]
    if (current === underlayId) {
      // Keep existing floorUnder (previous contents from first placement).
      if (floorUnder[key] == null) floorUnder[key] = NULL_TILE
      continue
    }
    // Remember actual previous cell (typically Null) — never invent a floor under a Null-cell wall.
    floorUnder[key] = current
    tiles[y][x] = underlayId
  }

  // Keep non-auto pieces and manually promoted pieces; drop prior auto pieces for this region.
  const prevAutoIds = new Set(prevRegion?.generatedPieceIds ?? [])
  const keptPieces = (map.templatePiecePlacements ?? []).filter((entry) => {
    if (manualPieceIds.has(entry.id)) return true
    if (entry.autoPaint && prevAutoIds.has(entry.id)) return false
    if (entry.autoPaint && !prevRegion) return false
    return !entry.autoPaint || !prevAutoIds.has(entry.id)
  })

  const blockedTips = new Set(suppressedTips)
  for (const entry of keptPieces) blockedTips.add(tipKeyOf(entry.position))

  const working = { ...map, tiles, floorUnder, templatePiecePlacements: keptPieces }
  const generatedPieces = placePiecesOnUnderlay(working, underlayId, ruleset.walls, random, blockedTips)
  const generatedPieceIds = generatedPieces.map((entry) => entry.id)

  const region = {
    id: regionId,
    environment: null,
    floorKeys,
    generatedUnderlayKeys: underlayKeys,
    generatedPieceIds,
    manualPieceIds: [...manualPieceIds],
    manualUnderlayKeys: [...manualUnderlay],
    suppressedTipKeys: [...suppressedTips],
  }

  const otherRegions = (prev?.regions ?? []).filter((entry) => entry.id !== regionId)
  return {
    ...working,
    templatePiecePlacements: [...keptPieces, ...generatedPieces],
    autoPaint: {
      rulesetId: ruleset.id,
      defaultEnvironment: ruleset.environment,
      regions: [...otherRegions, region],
    },
  }
}

export { TEMPLATE_WALL_UNDERLAY, cellKey }
