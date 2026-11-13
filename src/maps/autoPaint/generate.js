// Auto-Paint Generate Map: deck room grid + 128/64/32 Template wall packing.
import { createNullMap, cellKey, FLOOR_TILE } from '../mapFormat.js'
import { makeDeckGenerator } from '../generators/starshipDeck.js'
import { DOOR_TILE } from '../generators/shared.js'
import { TEMPLATE_WALL_UNDERLAY } from '../generators/templateDeck.js'
import { normalizeWeightedEntries, pickWeighted, primaryId } from '../generators/weightedChoice.js'
import { getAutoPaintRuleset } from './rulesets.js'
import { pieceKitFromRuleset, resolveAutoPaintTileId } from './templatePalette.js'

function resolveWeightedTiles(role) {
  const mapped = normalizeWeightedEntries(role, { allowEmpty: true })
    .map((entry) => ({
      id: resolveAutoPaintTileId(entry.id) || entry.id,
      weight: entry.weight,
    }))
    .filter((entry) => entry.id)
  return normalizeWeightedEntries(mapped, { allowEmpty: true })
}
import {
  AUTO_PAINT_DOOR_CELLS,
  collectDoorCells,
  paintDoorCellsAsFloor,
  shrinkDoorwaysToMaxCells,
} from './doorways.js'
import { placePackedWallPieces } from './placeWallRuns.js'
import { snapAutoPaintGenerateSize } from './generateSize.js'
import { collectFloorKeys, floorIdsForRuleset } from './topology.js'

/**
 * Deck layout (floors, doorways, markers) + floor under every underlay wall cell,
 * then Auto-Paint 128/64/32 tip packing (not frozen placeTemplateWalls).
 */
export function generateAutoPaintMap(source, rulesetId, random = Math.random) {
  const ruleset = getAutoPaintRuleset(rulesetId)
  if (!ruleset) return { map: source, error: 'No Auto-Paint ruleset.' }
  // Roles may store Template Piece ids / weighted lists; deck underlay needs catalogue tiles.
  const floors = resolveWeightedTiles(ruleset.floors?.defaultTile)
  const floorId = primaryId(floors) || FLOOR_TILE
  // Temporary mark while cutting/shrinking openings — never left on the map (no full-cell doorway tile).
  const doorMark = DOOR_TILE
  if (!floorId) return { map: source, error: 'Auto-Paint ruleset has no default floor tile.' }

  const snapped = snapAutoPaintGenerateSize(source.mapType, source.width, source.height)
  const width = snapped.width
  const height = snapped.height
  if (width < 6 || height < 6) {
    return { map: source, error: 'Map is too small for Auto-Paint Generate Map (need at least 6×6).' }
  }

  const kit = pieceKitFromRuleset(ruleset)
  // Frozen makeDeckGenerator takes single tile ids; apply role mix after the layout pass.
  const generateDeck = makeDeckGenerator({
    floor: floorId,
    wall: TEMPLATE_WALL_UNDERLAY,
    door: doorMark,
    hazard: false,
    furnishRooms: () => {},
  })
  const layout = generateDeck(
    { ...source, width, height, tiles: createNullMap({ width, height }).tiles },
    random,
    [],
  )

  const floorIdSet = new Set(floors.map((entry) => entry.id))
  const tiles = layout.tiles.map((row) =>
    row.map((id) => {
      if (id === floorId || floorIdSet.has(id)) return pickWeighted(floors, random) || floorId
      return id
    }),
  )

  const floorUnder = { ...(layout.floorUnder ?? {}) }
  // Frozen deck cuts two-tile doors; keep both cells (128 underlay) and line 96px with Doorway 32.
  shrinkDoorwaysToMaxCells(
    tiles,
    width,
    height,
    doorMark,
    TEMPLATE_WALL_UNDERLAY,
    AUTO_PAINT_DOOR_CELLS,
    (x, y) => {
      floorUnder[cellKey({ x, y })] = pickWeighted(floors, random) || floorId
    },
  )
  const doorKeys = paintDoorCellsAsFloor(
    tiles,
    collectDoorCells(tiles, width, height, doorMark),
    () => pickWeighted(floors, random) || floorId,
  )

  const underlayKeys = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x] !== TEMPLATE_WALL_UNDERLAY) continue
      const key = cellKey({ x, y })
      underlayKeys.push(key)
      if (floorUnder[key] == null) floorUnder[key] = pickWeighted(floors, random) || floorId
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
    tiles,
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

  map = placePackedWallPieces(map, kit, { doorKeys, random })

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
          generatedDoorKeys: doorKeys,
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
