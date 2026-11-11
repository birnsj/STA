// Auto-Paint Generate Map: deck room grid + 128/64/32 Template wall packing.
import { createNullMap, cellKey, FLOOR_TILE } from '../mapFormat.js'
import { makeDeckGenerator } from '../generators/starshipDeck.js'
import { DOOR_TILE } from '../generators/shared.js'
import { TEMPLATE_WALL_UNDERLAY } from '../generators/templateDeck.js'
import { getAutoPaintRuleset } from './rulesets.js'
import { pieceKitFromRuleset } from './templatePalette.js'
import { placePackedWallPieces } from './placeWallRuns.js'
import { snapAutoPaintGenerateSize } from './templateWallCoverage.js'
import { collectFloorKeys, floorIdsForRuleset } from './topology.js'

/**
 * Deck layout (floors, doorways, markers) + floor under every underlay wall cell,
 * then Auto-Paint 128/64/32 tip packing (not frozen placeTemplateWalls).
 */
export function generateAutoPaintMap(source, rulesetId, random = Math.random) {
  const ruleset = getAutoPaintRuleset(rulesetId)
  if (!ruleset) return { map: source, error: 'No Auto-Paint ruleset.' }
  const floorId = ruleset.floors?.defaultTile || FLOOR_TILE
  const doorId = ruleset.doors?.underlayTile || DOOR_TILE
  if (!floorId) return { map: source, error: 'Auto-Paint ruleset has no default floor tile.' }

  const snapped = snapAutoPaintGenerateSize(source.mapType, source.width, source.height)
  const width = snapped.width
  const height = snapped.height
  if (width < 6 || height < 6) {
    return { map: source, error: 'Map is too small for Auto-Paint Generate Map (need at least 6×6).' }
  }

  const kit = pieceKitFromRuleset(ruleset)
  const generateDeck = makeDeckGenerator({
    floor: floorId,
    wall: TEMPLATE_WALL_UNDERLAY,
    door: doorId,
    hazard: false,
    furnishRooms: () => {},
  })
  const layout = generateDeck(
    { ...source, width, height, tiles: createNullMap({ width, height }).tiles },
    random,
    [],
  )

  const floorUnder = { ...(layout.floorUnder ?? {}) }
  const underlayKeys = []
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      if (layout.tiles[y][x] !== TEMPLATE_WALL_UNDERLAY) continue
      const key = cellKey({ x, y })
      underlayKeys.push(key)
      floorUnder[key] = floorId
    }
  }

  let map = {
    ...createNullMap({ name: source.name || 'Untitled Map', width, height }),
    id: source.id,
    name: source.name,
    episodeName: source.episodeName ?? '',
    card: source.card ?? null,
    mapType: source.mapType,
    biome: source.biome,
    weather: source.weather,
    ambient: source.ambient,
    ambientColour: source.ambientColour,
    tiles: layout.tiles,
    floorUnder,
    areas: layout.areas ?? [],
    markers: layout.markers ?? { playerStarts: [], enemySpawns: [] },
    templatePiecePlacements: [],
    briefing: source.briefing ?? '',
    outro: source.outro ?? '',
    outroAbandoned: source.outroAbandoned ?? '',
    outroFailed: source.outroFailed ?? '',
    stardate: source.stardate ?? null,
    music: source.music,
  }

  map = placePackedWallPieces(map, kit, { doorId, random })

  const placements = map.templatePiecePlacements ?? []
  const floorKeys = collectFloorKeys(map, floorIdsForRuleset(ruleset))
  map = {
    ...map,
    autoPaint: {
      rulesetId: ruleset.id,
      defaultEnvironment: ruleset.environment,
      regions: [
        {
          id: 'region-1',
          environment: null,
          floorKeys,
          generatedUnderlayKeys: underlayKeys,
          generatedWallKeys: [],
          generatedPieceIds: placements.filter((entry) => entry.autoPaint).map((entry) => entry.id),
          manualUnderlayKeys: [],
          manualWallKeys: [],
          manualPieceIds: [],
          suppressedTipKeys: [],
          suppressedWallKeys: [],
        },
      ],
    },
  }
  if (snapped.snapped) {
    return {
      map,
      status: `Auto-Paint Generate snapped size to ${width}×${height} (${snapped.sizeId}) for Template 32 runs.`,
    }
  }
  return { map }
}
