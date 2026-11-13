// Auto-Paint tile walls: exterior Null ring → wall tiles + finish (orient / corners).
// Independent of Generate Map / generators/* (those stay frozen).
import { pickWeighted, weightedIds } from '../generators/weightedChoice.js'
import { NULL_TILE, getTile } from '../mapFormat.js'
import { resolveAutoPaintTileId } from './templatePalette.js'
import { collectFloorKeys, exteriorUnderlayKeys, floorIdsForRuleset, parseCellKey } from './topology.js'

function wallTile(id) {
  return resolveAutoPaintTileId(id)
}

function roleTileIds(role) {
  return weightedIds(role).map((id) => wallTile(id)).filter(Boolean)
}

function pickRoleTile(role, random = Math.random) {
  const id = typeof role === 'string' ? role : pickWeighted(role, random)
  return wallTile(id)
}

function familyIds(ruleset) {
  const ids = new Set()
  for (const key of ['straight', 'straightLong', 'corner', 'hull', 'hullLong', 'hullCorner', 'doorFrame']) {
    for (const id of roleTileIds(ruleset.walls?.[key])) ids.add(id)
  }
  for (const id of roleTileIds(ruleset.walls?.fittings)) ids.add(id)
  return ids
}

function isFamilyTile(id, family) {
  return family.has(id)
}

/**
 * Orient true wall *tiles* (bulkhead / halfBulkhead family) toward open floor.
 * Template 32 tip art must not use this path — see wallsTemplate.js.
 */
export function finishAutoPaintWalls(map, ruleset, random = Math.random) {
  const straightFallback = pickRoleTile(ruleset.walls?.straight, random)
  if (!straightFallback) return map
  const family = familyIds(ruleset)
  if (!family.size) return map

  const { width, height } = map
  const tiles = map.tiles.map((row) => [...row])
  const rotated = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => Boolean(map.rotated?.[y]?.[x])),
  )

  const wallAt = (x, y) => x >= 0 && y >= 0 && x < width && y < height && isFamilyTile(tiles[y][x], family)
  const openAt = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false
    const id = tiles[y][x]
    if (id === NULL_TILE || isFamilyTile(id, family)) return false
    return !getTile(id).solid
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isFamilyTile(tiles[y][x], family)) continue
      const n = wallAt(x, y - 1)
      const s = wallAt(x, y + 1)
      const e = wallAt(x + 1, y)
      const w = wallAt(x - 1, y)
      if ((n || s) && (e || w)) {
        tiles[y][x] = pickRoleTile(ruleset.walls?.corner, random) || straightFallback
        rotated[y][x] = openAt(x + 1, y) || openAt(x, y + 1)
      } else {
        tiles[y][x] = pickRoleTile(ruleset.walls?.straight, random) || straightFallback
        if (e || w) rotated[y][x] = openAt(x, y + 1) && !openAt(x, y - 1)
        else if (n || s) rotated[y][x] = openAt(x + 1, y) && !openAt(x - 1, y)
        else rotated[y][x] = false
      }
    }
  }

  return { ...map, tiles, rotated }
}

function pickWallTile(ruleset, onHull, random = Math.random) {
  if (onHull && weightedIds(ruleset.walls?.hull).length) {
    return pickRoleTile(ruleset.walls.hull, random) || pickRoleTile(ruleset.walls.straight, random)
  }
  return pickRoleTile(ruleset.walls.straight, random)
}

/**
 * Clear previous Auto-Paint wall cells for a region, then rebuild from current floors.
 * Preserves manual wall keys and suppressed cell keys. Does not write Template Pieces.
 */
export function assembleWallsFromFloors(map, ruleset, { regionId = 'region-1', random = Math.random } = {}) {
  const floorIds = floorIdsForRuleset(ruleset)
  const straightTile = pickRoleTile(ruleset.walls?.straight, random)
  if (!straightTile || !getTile(straightTile)) {
    return map
  }
  const family = familyIds(ruleset)
  const prev = map.autoPaint ?? null
  const prevRegion = prev?.regions?.find((entry) => entry.id === regionId) ?? null
  const manualWalls = new Set([
    ...(prevRegion?.manualWallKeys ?? []),
    ...(prevRegion?.manualUnderlayKeys ?? []),
  ])
  const suppressed = new Set([
    ...(prevRegion?.suppressedWallKeys ?? []),
    ...(prevRegion?.suppressedTipKeys ?? []),
  ])
  const prevGenerated = new Set([
    ...(prevRegion?.generatedWallKeys ?? []),
    ...(prevRegion?.generatedUnderlayKeys ?? []),
  ])

  const floorKeys = collectFloorKeys(map, floorIds)
  const fromNull = exteriorUnderlayKeys(map, floorKeys)
  const wallKeys = [...new Set([...fromNull, ...prevGenerated])]
    .filter((key) => !manualWalls.has(key) && !suppressed.has(key))
    .filter((key) => {
      const { x, y } = parseCellKey(key)
      if (y < 0 || x < 0 || y >= map.height || x >= map.width) return false
      const id = map.tiles[y][x]
      return id === NULL_TILE || (isFamilyTile(id, family) && prevGenerated.has(key))
    })

  const tiles = map.tiles.map((row) => row.slice())
  const floorUnder = { ...(map.floorUnder ?? {}) }

  for (const key of prevGenerated) {
    if (manualWalls.has(key) || wallKeys.includes(key)) continue
    const { x, y } = parseCellKey(key)
    if (!isFamilyTile(tiles[y]?.[x], family)) continue
    const restore = floorUnder[key] ?? NULL_TILE
    tiles[y][x] = restore
    delete floorUnder[key]
  }

  const rim = new Set()
  for (const key of wallKeys) {
    const { x, y } = parseCellKey(key)
    // Hull = map rim cells (optional hull tile).
    if (x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1) rim.add(key)
  }

  for (const key of wallKeys) {
    const { x, y } = parseCellKey(key)
    const current = tiles[y][x]
    const nextId = pickWallTile(ruleset, rim.has(key), random)
    if (current === nextId || isFamilyTile(current, family)) {
      if (floorUnder[key] == null) floorUnder[key] = NULL_TILE
      tiles[y][x] = nextId
      continue
    }
    floorUnder[key] = current
    tiles[y][x] = nextId
  }

  let working = {
    ...map,
    tiles,
    floorUnder,
    rotated: map.rotated
      ? map.rotated.map((row) => row.slice())
      : Array.from({ length: map.height }, () => Array.from({ length: map.width }, () => false)),
  }
  working = finishAutoPaintWalls(working, ruleset, random)

  const region = {
    id: regionId,
    environment: null,
    floorKeys,
    generatedWallKeys: wallKeys,
    // Keep legacy key names empty so old piece/underlay readers stay quiet.
    generatedUnderlayKeys: wallKeys,
    generatedPieceIds: [],
    manualWallKeys: [...manualWalls],
    manualUnderlayKeys: [...manualWalls],
    manualPieceIds: [],
    suppressedWallKeys: [...suppressed],
    suppressedTipKeys: [...suppressed],
  }

  const otherRegions = (prev?.regions ?? []).filter((entry) => entry.id !== regionId)
  return {
    ...working,
    autoPaint: {
      rulesetId: ruleset.id,
      defaultEnvironment: ruleset.environment,
      regions: [...otherRegions, region],
    },
  }
}

/** Mark a wall cell as manually edited so Rebuild leaves it alone. */
export function promoteWallCellManual(map, position) {
  if (!map.autoPaint?.regions?.length) return map
  const key = `${position.x},${position.y}`
  const regions = map.autoPaint.regions.map((region) => {
    const generated = new Set([...(region.generatedWallKeys ?? []), ...(region.generatedUnderlayKeys ?? [])])
    if (!generated.has(key)) return region
    const nextGenerated = [...generated].filter((entry) => entry !== key)
    const manual = new Set([...(region.manualWallKeys ?? []), ...(region.manualUnderlayKeys ?? [])])
    manual.add(key)
    return {
      ...region,
      generatedWallKeys: nextGenerated,
      generatedUnderlayKeys: nextGenerated,
      manualWallKeys: [...manual],
      manualUnderlayKeys: [...manual],
    }
  })
  return { ...map, autoPaint: { ...map.autoPaint, regions } }
}

function patchRegionWallCleared(region, key) {
  const suppressed = new Set([
    ...(region.suppressedWallKeys ?? []),
    ...(region.suppressedTipKeys ?? []),
  ])
  suppressed.add(key)
  const strip = (list) => (list ?? []).filter((entry) => entry !== key)
  return {
    ...region,
    generatedWallKeys: strip(region.generatedWallKeys ?? region.generatedUnderlayKeys),
    generatedUnderlayKeys: strip(region.generatedUnderlayKeys ?? region.generatedWallKeys),
    manualWallKeys: strip(region.manualWallKeys ?? region.manualUnderlayKeys),
    manualUnderlayKeys: strip(region.manualUnderlayKeys ?? region.manualWallKeys),
    suppressedWallKeys: [...suppressed],
    suppressedTipKeys: [...suppressed],
  }
}

function wallKeyOwned(map, key) {
  return (map.autoPaint?.regions ?? []).some((region) => {
    const generated = new Set([...(region.generatedWallKeys ?? []), ...(region.generatedUnderlayKeys ?? [])])
    const manual = new Set([...(region.manualWallKeys ?? []), ...(region.manualUnderlayKeys ?? [])])
    return generated.has(key) || manual.has(key)
  })
}

/** After eraseStructure already cleared the cell: suppress so Rebuild does not recreate it. */
export function noteAutoPaintWallCleared(map, position) {
  if (!map.autoPaint?.regions?.length) return map
  const key = `${position.x},${position.y}`
  if (!wallKeyOwned(map, key)) return map
  const regions = map.autoPaint.regions.map((region) => patchRegionWallCleared(region, key))
  return { ...map, autoPaint: { ...map.autoPaint, regions } }
}

/**
 * Clear an Auto-Paint wall cell back toward Null (via floorUnder) and suppress so Rebuild
 * does not recreate a wall there.
 */
export function removeAutoPaintWallCell(map, position) {
  if (!map.autoPaint?.regions?.length) return map
  const key = `${position.x},${position.y}`
  if (!wallKeyOwned(map, key)) return map

  const tiles = map.tiles.map((row) => row.slice())
  const floorUnder = { ...(map.floorUnder ?? {}) }
  const restore = floorUnder[key] ?? NULL_TILE
  tiles[position.y][position.x] = restore
  delete floorUnder[key]

  const regions = map.autoPaint.regions.map((region) => patchRegionWallCleared(region, key))
  return { ...map, tiles, floorUnder, autoPaint: { ...map.autoPaint, regions } }
}
