import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assembleWallsFromFloors,
  collectFloorKeys,
  exteriorUnderlayKeys,
  floorIdsForRuleset,
  promoteTemplatePieceManual,
  removeAutoPaintTemplatePiece,
  tipKeyOf,
  validateAutoPaintRuleset,
} from '../src/maps/autoPaint/index.js'
import { getAutoPaintRuleset, resolveAutoPaintRuleset } from '../src/maps/autoPaint/rulesets.js'
import { createNullMap, NULL_TILE, parseMapFile, serializeMap, cellKey } from '../src/maps/mapFormat.js'

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

describe('Auto-Paint rulesets', () => {
  it('loads the seed ruleset with catalogue ids', () => {
    const ruleset = getAutoPaintRuleset('starship-interior-default')
    assert.equal(ruleset.id, 'starship-interior-default')
    assert.equal(ruleset.walls.straight, 'tplStarshipWall32')
    assert.equal(ruleset.walls.straightLong, 'tplStarshipWall32PlainLong')
    assert.equal(ruleset.walls.corner, 'tplStarshipWall32Corner')
    assert.equal(ruleset.walls.hull, 'tplStarshipHull32')
    assert.equal(ruleset.walls.doorFrame, 'tplStarshipDoorFrame')
    const { ok, errors } = validateAutoPaintRuleset(ruleset)
    assert.equal(ok, true, errors.join('; '))
  })

  it('reports unknown asset ids without inventing replacements', () => {
    const resolved = resolveAutoPaintRuleset({
      id: 'tmp',
      walls: { straight: 'missing-piece', corner: 'also-missing' },
    })
    assert.equal(resolved.walls.straight, 'missing-piece')
    assert.equal(resolved.walls.corner, 'also-missing')
    const { ok, errors } = validateAutoPaintRuleset(resolved)
    assert.equal(ok, false)
    assert.ok(errors.some((line) => line.includes('missing-piece')))
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

describe('assembleWallsFromFloors', () => {
  it('builds underlay and pieces; floorUnder remembers Null not a floor id', () => {
    let map = createNullMap({ name: 'rect', width: 10, height: 10 })
    map = paintFloors(map, rectCells(3, 3, 5, 5))
    const ruleset = getAutoPaintRuleset()
    const next = assembleWallsFromFloors(map, ruleset, { random: () => 0 })
    const region = next.autoPaint.regions[0]
    assert.ok(region.generatedUnderlayKeys.length > 0)
    assert.ok(region.generatedPieceIds.length > 0)
    for (const key of region.generatedUnderlayKeys) {
      const [x, y] = key.split(',').map(Number)
      assert.equal(next.tiles[y][x], ruleset.underlayWallTile)
      assert.equal(next.floorUnder[key], NULL_TILE)
    }
    // Playable floor cells stay floor (walls sit on exterior Null cells).
    assert.equal(next.tiles[4][4], 'floor')
    const file = serializeMap(next)
    const round = parseMapFile(file, 'rect')
    assert.equal(round.floorUnder[region.generatedUnderlayKeys[0]], NULL_TILE)
    assert.ok(round.templatePiecePlacements.some((entry) => entry.autoPaint === true))
  })

  it('restores Null when underlay is stripped on shrink', () => {
    let map = createNullMap({ name: 'shrink', width: 10, height: 10 })
    map = paintFloors(map, rectCells(3, 3, 5, 5))
    const ruleset = getAutoPaintRuleset()
    map = assembleWallsFromFloors(map, ruleset, { random: () => 0 })
    const outerKey = map.autoPaint.regions[0].generatedUnderlayKeys.find((key) => {
      const [x, y] = key.split(',').map(Number)
      return x === 2 || y === 2 || x === 6 || y === 6
    })
    assert.ok(outerKey)
    // Shrink footprint so that underlay cell is no longer adjacent.
    map = paintFloors(
      { ...map, tiles: map.tiles.map((row) => row.slice()) },
      rectCells(4, 4, 4, 4),
    )
    // Clear old floors outside the single cell so collectFloorKeys shrinks.
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[y][x] === 'floor' && !(x === 4 && y === 4)) map.tiles[y][x] = NULL_TILE
      }
    }
    const rebuilt = assembleWallsFromFloors(map, ruleset, { random: () => 0 })
    const [ox, oy] = outerKey.split(',').map(Number)
    if (!rebuilt.autoPaint.regions[0].generatedUnderlayKeys.includes(outerKey)) {
      assert.equal(rebuilt.tiles[oy][ox], NULL_TILE)
      assert.equal(rebuilt.floorUnder[outerKey], undefined)
    }
  })

  it('builds walls for L, U, and concave footprints', () => {
    const ruleset = getAutoPaintRuleset()
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
      const next = assembleWallsFromFloors(map, ruleset, { random: () => 0 })
      assert.ok(next.autoPaint.regions[0].generatedUnderlayKeys.length >= 4, shape.name)
      assert.ok(next.templatePiecePlacements.length >= 2, shape.name)
    }
  })

  it('builds when the floor touches the map edge', () => {
    let map = createNullMap({ name: 'edge', width: 8, height: 8 })
    map = paintFloors(map, rectCells(0, 0, 2, 2))
    const next = assembleWallsFromFloors(map, getAutoPaintRuleset(), { random: () => 0 })
    assert.ok(next.autoPaint.regions[0].generatedUnderlayKeys.length > 0)
    assert.equal(next.tiles[0][0], 'floor')
  })

  it('preserves a manually promoted piece and does not place another auto piece on its tip', () => {
    let map = createNullMap({ name: 'manual', width: 10, height: 10 })
    map = paintFloors(map, rectCells(3, 3, 4, 4))
    const ruleset = getAutoPaintRuleset()
    map = assembleWallsFromFloors(map, ruleset, { random: () => 0 })
    const piece = map.templatePiecePlacements.find((entry) => entry.autoPaint)
    assert.ok(piece)
    const tip = tipKeyOf(piece.position)
    map = promoteTemplatePieceManual(map, piece.id)
    const rebuilt = assembleWallsFromFloors(map, ruleset, { random: () => 0 })
    const kept = rebuilt.templatePiecePlacements.find((entry) => entry.id === piece.id)
    assert.ok(kept)
    assert.equal(kept.autoPaint, false)
    const atTip = rebuilt.templatePiecePlacements.filter((entry) => tipKeyOf(entry.position) === tip)
    assert.equal(atTip.length, 1)
    assert.equal(atTip[0].id, piece.id)
  })

  it('does not recreate a deleted Auto-Paint piece tip on Rebuild', () => {
    let map = createNullMap({ name: 'deleted', width: 10, height: 10 })
    map = paintFloors(map, rectCells(3, 3, 5, 5))
    const ruleset = getAutoPaintRuleset()
    map = assembleWallsFromFloors(map, ruleset, { random: () => 0 })
    const piece = map.templatePiecePlacements.find((entry) => entry.autoPaint)
    assert.ok(piece)
    const tip = tipKeyOf(piece.position)
    map = removeAutoPaintTemplatePiece(map, piece.id)
    assert.ok(map.autoPaint.regions[0].suppressedTipKeys.includes(tip))
    assert.ok(!map.templatePiecePlacements.some((entry) => entry.id === piece.id))
    const rebuilt = assembleWallsFromFloors(map, ruleset, { random: () => 0 })
    assert.ok(rebuilt.autoPaint.regions[0].suppressedTipKeys.includes(tip))
    assert.ok(!rebuilt.templatePiecePlacements.some((entry) => tipKeyOf(entry.position) === tip))
    const file = serializeMap(rebuilt)
    const round = parseMapFile(file, 'deleted')
    assert.ok(round.autoPaint.regions[0].suppressedTipKeys.includes(tip))
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
