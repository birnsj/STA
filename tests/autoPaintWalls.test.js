import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assembleWallsFromFloors,
  collectFloorKeys,
  exteriorUnderlayKeys,
  floorIdsForRuleset,
  generateAutoPaintMap,
  noteAutoPaintWallCleared,
  packTipCells,
  packUnderlayRun,
  pieceKitFromRuleset,
  promoteWallCellManual,
  resolveAutoPaintRuleset,
  rulesetUsesTemplatePieces,
  snapAutoPaintGenerateSize,
  validateAutoPaintRuleset,
  WALL_LEN_LONG,
  WALL_LEN_SHORT,
  WALL_LEN_STUB,
} from '../src/maps/autoPaint/index.js'
import { getAutoPaintRuleset } from '../src/maps/autoPaint/rulesets.js'
import { assembleWallsFromFloors as assembleTileWallsFromFloors } from '../src/maps/autoPaint/wallsTiles.js'
import { createNullMap, NULL_TILE, parseMapFile, serializeMap, cellKey, getTile } from '../src/maps/mapFormat.js'
import { getTemplatePiece } from '../src/maps/templatePieces.js'

function paintFloors(map, cells, floorId = 'floor') {
  const tiles = map.tiles.map((row) => row.slice())
  for (const [x, y] of cells) tiles[y][x] = floorId
  return { ...map, tiles }
}

function rectCells(x0, y0, x1, y1) {
  const cells = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push([x, y])
  return cells
}

const bulkheadRuleset = () =>
  resolveAutoPaintRuleset({
    id: 'bulkhead-tiles',
    label: 'Bulkhead tiles',
    walls: { straight: 'bulkhead', corner: 'bulkheadCorner' },
    floors: { defaultTile: 'floor', variants: [] },
  })

describe('Auto-Paint rulesets', () => {
  it('loads the seed ruleset with Template Piece wall roles', () => {
    const ruleset = getAutoPaintRuleset('template-32')
    assert.equal(ruleset.id, 'template-32')
    assert.equal(ruleset.label, 'Template 32')
    assert.equal(ruleset.walls.straight, 'tplStarshipWall32')
    assert.equal(ruleset.walls.corner, 'tplStarshipWall32Corner')
    assert.equal(ruleset.walls.straightLong, 'tplStarshipWall32PlainLong')
    assert.equal(ruleset.walls.doorFrame, 'tplStarshipDoorFrame')
    assert.equal(rulesetUsesTemplatePieces(ruleset), true)
    const kit = pieceKitFromRuleset(ruleset)
    assert.equal(kit.straight, 'tplStarshipWall32')
    assert.equal(kit.corner, 'tplStarshipWall32Corner')
    assert.equal(kit.straightLong, 'tplStarshipWall32PlainLong')
    assert.equal(kit.doorFrame, 'tplStarshipDoorFrame')
    // Hull roles are None — do not invent Template Deck hull.
    assert.equal(kit.hull, null)
    assert.equal(kit.hullCorner, null)
    assert.equal(kit.hullLong, null)
    assert.deepEqual(kit.fittings, [])
    assert.equal(kit.fittingChance, 0)
    assert.ok(getTemplatePiece(kit.straight))
    const { ok, errors } = validateAutoPaintRuleset(ruleset)
    assert.equal(ok, true, errors.join('; '))
  })

  it('keeps an explicit Template Piece id in the kit (does not collapse to wall32)', () => {
    const ruleset = resolveAutoPaintRuleset({
      id: 'hull-roles',
      label: 'Hull roles',
      walls: {
        straight: 'tplStarshipHull32',
        corner: 'tplStarshipHull32Corner',
        hull: 'tplStarshipHull32',
        hullCorner: 'tplStarshipHull32Corner',
      },
      floors: { defaultTile: 'floor', variants: [] },
    })
    const kit = pieceKitFromRuleset(ruleset)
    assert.equal(kit.straight, 'tplStarshipHull32')
    assert.equal(kit.corner, 'tplStarshipHull32Corner')
    assert.equal(kit.hull, 'tplStarshipHull32')
    assert.equal(kit.hullCorner, 'tplStarshipHull32Corner')
    assert.ok(kit.hullLong)
  })

  it('reports unknown tile ids without inventing replacements', () => {
    const resolved = resolveAutoPaintRuleset({
      id: 'tmp',
      walls: { straight: 'missing-wall', corner: 'also-missing' },
    })
    assert.equal(resolved.walls.straight, 'missing-wall')
    assert.equal(resolved.walls.corner, 'also-missing')
    const { ok, errors } = validateAutoPaintRuleset(resolved)
    assert.equal(ok, false)
    assert.ok(errors.some((line) => line.includes('missing-wall')))
    assert.ok(errors.some((line) => line.includes('also-missing')))
  })
})

describe('Auto-Paint topology', () => {
  it('finds exterior Null cells around a rectangle', () => {
    let map = createNullMap({ name: 't', width: 8, height: 8 })
    map = paintFloors(map, rectCells(2, 2, 3, 3))
    const ruleset = getAutoPaintRuleset()
    const floors = collectFloorKeys(map, floorIdsForRuleset(ruleset))
    assert.equal(floors.length, 4)
    const underlay = new Set(exteriorUnderlayKeys(map, floors))
    assert.ok(underlay.has(cellKey({ x: 1, y: 2 })))
    assert.ok(underlay.has(cellKey({ x: 4, y: 2 })))
    assert.ok(underlay.has(cellKey({ x: 2, y: 1 })))
    assert.ok(underlay.has(cellKey({ x: 2, y: 4 })))
    assert.ok(!underlay.has(cellKey({ x: 2, y: 2 })))
  })
})

describe('assembleWallsFromFloors (Template 32 pieces)', () => {
  it('places templateWall underlay + tip pieces (not wall32 cell tiles)', () => {
    let map = createNullMap({ name: 'rect', width: 10, height: 10 })
    map = paintFloors(map, rectCells(3, 3, 5, 5))
    const ruleset = getAutoPaintRuleset('template-32')
    const next = assembleWallsFromFloors(map, ruleset)
    const region = next.autoPaint.regions[0]
    assert.ok(region.generatedUnderlayKeys.length > 0)
    assert.ok(region.generatedPieceIds.length > 0)
    const autoPieces = (next.templatePiecePlacements ?? []).filter((entry) => entry.autoPaint)
    assert.ok(autoPieces.length > 0)
    assert.ok(autoPieces.every((entry) => getTemplatePiece(entry.pieceId)))
    for (const key of region.generatedUnderlayKeys) {
      const [x, y] = key.split(',').map(Number)
      assert.equal(next.tiles[y][x], 'templateWall', `${key} should be templateWall underlay`)
      assert.equal(next.floorUnder[key], 'floor', `${key} should remember floor under underlay`)
    }
    assert.equal(next.tiles[4][4], 'floor')
    // Same tip-grid rotations as Template Deck (0/90/180/270), not boolean tile mirrors.
    assert.ok(autoPieces.some((entry) => [0, 90, 180, 270].includes(entry.rotation)))
    const file = serializeMap(next)
    const round = parseMapFile(file, 'rect')
    assert.ok(round.autoPaint.regions[0].generatedUnderlayKeys.length > 0)
    assert.ok((round.templatePiecePlacements ?? []).length > 0)
  })

  it('builds underlay for L, U, and concave footprints', () => {
    const ruleset = getAutoPaintRuleset('template-32')
    const shapes = [
      { name: 'L', cells: [...rectCells(2, 2, 5, 2), ...rectCells(2, 3, 2, 5)] },
      { name: 'U', cells: [...rectCells(2, 2, 2, 5), ...rectCells(3, 5, 5, 5), ...rectCells(6, 2, 6, 5)] },
      {
        name: 'concave',
        cells: [...rectCells(2, 2, 6, 2), ...rectCells(2, 3, 2, 5), ...rectCells(6, 3, 6, 5), ...rectCells(2, 5, 6, 5), [3, 3], [5, 3]],
      },
    ]
    for (const shape of shapes) {
      let map = createNullMap({ name: shape.name, width: 10, height: 10 })
      map = paintFloors(map, shape.cells)
      const next = assembleWallsFromFloors(map, ruleset)
      assert.ok(next.autoPaint.regions[0].generatedUnderlayKeys.length >= 4, shape.name)
      assert.ok((next.templatePiecePlacements ?? []).some((entry) => entry.autoPaint), shape.name)
    }
  })
})

describe('assembleWallsFromFloors (bulkhead tiles)', () => {
  it('places bulkhead tiles on exterior Null', () => {
    let map = createNullMap({ name: 'rect', width: 10, height: 10 })
    map = paintFloors(map, rectCells(3, 3, 5, 5))
    const ruleset = bulkheadRuleset()
    assert.equal(rulesetUsesTemplatePieces(ruleset), false)
    const next = assembleTileWallsFromFloors(map, ruleset)
    const region = next.autoPaint.regions[0]
    assert.ok(region.generatedWallKeys.length > 0)
    for (const key of region.generatedWallKeys) {
      const [x, y] = key.split(',').map(Number)
      assert.ok(getTile(next.tiles[y][x]).wall, `${key} should be a wall tile`)
    }
  })

  it('preserves a manually promoted wall cell on Rebuild', () => {
    let map = createNullMap({ name: 'manual', width: 10, height: 10 })
    map = paintFloors(map, rectCells(3, 3, 4, 4))
    const ruleset = bulkheadRuleset()
    map = assembleTileWallsFromFloors(map, ruleset)
    const key = map.autoPaint.regions[0].generatedWallKeys[0]
    const [x, y] = key.split(',').map(Number)
    map = promoteWallCellManual(map, { x, y })
    map = {
      ...map,
      tiles: map.tiles.map((row, rowY) => row.map((id, colX) => (rowY === y && colX === x ? 'plainBulkhead' : id))),
    }
    const rebuilt = assembleTileWallsFromFloors(map, ruleset)
    assert.equal(rebuilt.tiles[y][x], 'plainBulkhead')
    assert.ok(rebuilt.autoPaint.regions[0].manualWallKeys.includes(key))
  })

  it('does not recreate a deleted Auto-Paint wall cell on Rebuild', () => {
    let map = createNullMap({ name: 'deleted', width: 10, height: 10 })
    map = paintFloors(map, rectCells(3, 3, 5, 5))
    const ruleset = bulkheadRuleset()
    map = assembleTileWallsFromFloors(map, ruleset)
    const key = map.autoPaint.regions[0].generatedWallKeys[0]
    const [x, y] = key.split(',').map(Number)
    map = {
      ...map,
      tiles: map.tiles.map((row, rowY) => row.map((id, colX) => (rowY === y && colX === x ? NULL_TILE : id))),
      floorUnder: { ...map.floorUnder },
    }
    delete map.floorUnder[key]
    map = noteAutoPaintWallCleared(map, { x, y })
    const rebuilt = assembleTileWallsFromFloors(map, ruleset)
    assert.ok(rebuilt.autoPaint.regions[0].suppressedWallKeys.includes(key))
    assert.ok(!rebuilt.autoPaint.regions[0].generatedWallKeys.includes(key))
    assert.equal(rebuilt.tiles[y][x], NULL_TILE)
  })

  it('does not claim non-Null exterior cells', () => {
    let map = createNullMap({ name: 'bulk', width: 6, height: 6 })
    map = paintFloors(map, [[2, 2]])
    map.tiles[2][1] = 'bulkhead'
    const floors = collectFloorKeys(map, floorIdsForRuleset(getAutoPaintRuleset()))
    const underlay = exteriorUnderlayKeys(map, floors)
    assert.ok(!underlay.includes(cellKey({ x: 1, y: 2 })))
    assert.ok(underlay.includes(cellKey({ x: 3, y: 2 })))
  })

  it('leaves maps without autoPaint unchanged on serialize omit', () => {
    const map = createNullMap({ name: 'blank', width: 4, height: 4 })
    const file = serializeMap(map)
    assert.equal(file.autoPaint, undefined)
  })
})

describe('Auto-Paint wall run packing (128 / 64 / 32)', () => {
  it('packs underlay cells as 128 then 64', () => {
    assert.deepEqual(
      packUnderlayRun(5).map((part) => part.len),
      [WALL_LEN_LONG, WALL_LEN_LONG, WALL_LEN_SHORT],
    )
    assert.deepEqual(
      packUnderlayRun(2).map((part) => part.len),
      [WALL_LEN_LONG],
    )
    assert.deepEqual(
      packUnderlayRun(1).map((part) => part.len),
      [WALL_LEN_SHORT],
    )
  })

  it('packs tip cells as 128 + 64 + 32 stub', () => {
    assert.deepEqual(
      packTipCells(7).map((part) => part.len),
      [WALL_LEN_LONG, WALL_LEN_SHORT, WALL_LEN_STUB],
    )
    assert.deepEqual(
      packTipCells(1).map((part) => part.len),
      [WALL_LEN_STUB],
    )
  })
})

describe('Auto-Paint Generate Map', () => {
  it('snaps custom sizes to Template Deck presets', () => {
    const exact = snapAutoPaintGenerateSize('templateDeck', 20, 14)
    assert.equal(exact.snapped, false)
    assert.equal(exact.sizeId, 'medium')
    const custom = snapAutoPaintGenerateSize('templateDeck', 19, 13)
    assert.equal(custom.snapped, true)
    assert.equal(custom.width, 20)
    assert.equal(custom.height, 14)
  })

  it('packs 128/64 walls with corners and floor under underlay', () => {
    const source = createNullMap({ name: 'gen', width: 20, height: 14 })
    const { map, error } = generateAutoPaintMap(source, 'template-32', () => 0.25)
    assert.equal(error, undefined)
    assert.equal(map.autoPaint?.rulesetId, 'template-32')
    const floors = collectFloorKeys(map, floorIdsForRuleset(getAutoPaintRuleset('template-32')))
    assert.ok(floors.length > 10)
    const underlayKeys = map.autoPaint.regions[0].generatedUnderlayKeys
    assert.ok(underlayKeys.length > 0)
    for (const key of underlayKeys) {
      const [x, y] = key.split(',').map(Number)
      assert.equal(map.tiles[y][x], 'templateWall')
      assert.equal(map.floorUnder[key], 'floor', `floor under wall at ${key}`)
    }
    const autoPieces = (map.templatePiecePlacements ?? []).filter((entry) => entry.autoPaint)
    assert.ok(autoPieces.length > 0)
    assert.ok(autoPieces.some((entry) => entry.pieceId.includes('Corner')), 'corner / 32 stubs')
    assert.ok(
      autoPieces.some((entry) => /Long/i.test(entry.pieceId)),
      '128-long pieces',
    )
    assert.ok(
      autoPieces.some((entry) => /Wall32$|Hull32$/.test(entry.pieceId) || entry.pieceId.includes('Wall32')),
      '64-long pieces',
    )
    let doorCount = 0
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[y][x] === 'doorway') doorCount += 1
      }
    }
    assert.ok(doorCount > 0, 'doorway tiles from deck layout')
    assert.ok(autoPieces.some((entry) => entry.pieceId.includes('DoorFrame')), 'door frames')
    assert.ok(map.markers.playerStarts.length > 0)
    for (const marker of [...map.markers.playerStarts, ...map.markers.enemySpawns]) {
      assert.ok(!getTile(map.tiles[marker.y][marker.x])?.wall)
      assert.notEqual(map.tiles[marker.y][marker.x], 'templateWall')
    }
  })
})
