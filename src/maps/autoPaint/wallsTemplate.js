// Template 32: exterior Null → templateWall underlay, then 128/64/32 tip packing.
import { NULL_TILE, cellKey } from '../mapFormat.js'
import { placePackedWallPieces } from './placeWallRuns.js'
import { pieceKitFromRuleset, resolveAutoPaintTileId } from './templatePalette.js'
import { collectFloorKeys, exteriorUnderlayKeys, floorIdsForRuleset, parseCellKey } from './topology.js'

const TEMPLATE_WALL_UNDERLAY = 'templateWall'

export function tipKeyOf(position) {
  return `${position.x},${position.y}`
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
  const fromNull = exteriorUnderlayKeys(map, floorKeys)
  const underlayKeys = [...new Set([...fromNull, ...(prevRegion?.generatedUnderlayKeys ?? [])])]
    .filter((key) => !manualUnderlay.has(key))
    .filter((key) => {
      const { x, y } = parseCellKey(key)
      if (y < 0 || x < 0 || y >= map.height || x >= map.width) return false
      const id = map.tiles[y][x]
      return id === NULL_TILE || (id === underlayId && (prevRegion?.generatedUnderlayKeys ?? []).includes(key))
    })

  const tiles = map.tiles.map((row) => row.slice())
  const floorUnder = { ...(map.floorUnder ?? {}) }
  const prevGenerated = new Set(prevRegion?.generatedUnderlayKeys ?? [])

  for (const key of prevGenerated) {
    if (manualUnderlay.has(key)) continue
    if (underlayKeys.includes(key)) continue
    const { x, y } = parseCellKey(key)
    if (tiles[y]?.[x] !== underlayId) continue
    const restore = floorUnder[key] ?? NULL_TILE
    tiles[y][x] = restore
    delete floorUnder[key]
  }

  const floorPick = Array.isArray(ruleset.floors?.defaultTile)
    ? ruleset.floors.defaultTile[0]?.id || ruleset.floors.defaultTile[0]
    : ruleset.floors?.defaultTile
  const defaultFloor = resolveAutoPaintTileId(floorPick) || floorPick || null
  for (const key of underlayKeys) {
    const { x, y } = parseCellKey(key)
    const current = tiles[y][x]
    if (current === underlayId) {
      if (floorUnder[key] == null) floorUnder[key] = defaultFloor || NULL_TILE
      continue
    }
    floorUnder[key] = current === NULL_TILE && defaultFloor ? defaultFloor : current
    tiles[y][x] = underlayId
  }

  const prevAutoIds = new Set(prevRegion?.generatedPieceIds ?? [])
  const keptPieces = (map.templatePiecePlacements ?? []).filter((entry) => {
    if (manualPieceIds.has(entry.id)) return true
    if (entry.autoPaint && prevAutoIds.has(entry.id)) return false
    if (entry.autoPaint && !prevRegion) return false
    return !entry.autoPaint || !prevAutoIds.has(entry.id)
  })

  const working = { ...map, tiles, floorUnder, templatePiecePlacements: keptPieces }
  const kit = pieceKitFromRuleset(ruleset)
  // Openings are floor cells; keys come from Generate (or leftover doorway tiles on older maps).
  const doorKeys = new Set(prevRegion?.generatedDoorKeys ?? [])
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (tiles[y][x] === 'doorway') doorKeys.add(cellKey({ x, y }))
    }
  }
  const packed = placePackedWallPieces(working, kit, { doorKeys: [...doorKeys], random })
  const generatedPieceIds = (packed.templatePiecePlacements ?? [])
    .filter((entry) => entry.autoPaint && !manualPieceIds.has(entry.id))
    .map((entry) => entry.id)

  const region = {
    id: regionId,
    environment: null,
    floorKeys,
    generatedUnderlayKeys: underlayKeys,
    generatedDoorKeys: [...doorKeys],
    generatedPieceIds,
    manualPieceIds: [...manualPieceIds],
    manualUnderlayKeys: [...manualUnderlay],
    suppressedTipKeys: [...suppressedTips],
  }

  const otherRegions = (prev?.regions ?? []).filter((entry) => entry.id !== regionId)
  return {
    ...packed,
    autoPaint: {
      rulesetId: ruleset.id,
      defaultEnvironment: ruleset.environment,
      regions: [...otherRegions, region],
    },
  }
}

export { TEMPLATE_WALL_UNDERLAY, cellKey }
