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
  pieceFootprintAabb,
  pieceKitFromRuleset,
  placePackedWallPieces,
  promoteWallCellManual,
  resolveAutoPaintRuleset,
  rulesetUsesTemplatePieces,
  snapAutoPaintGenerateSize,
  validateAutoPaintRuleset,
  wallEdgesContinuouslyCovered,
  WALL_LEN_LONG,
  WALL_LEN_SHORT,
  WALL_LEN_STUB,
  WALL_TIP_PX,
} from '../src/maps/autoPaint/index.js'
import { getAutoPaintRuleset } from '../src/maps/autoPaint/rulesets.js'
import { assembleWallsFromFloors as assembleTileWallsFromFloors } from '../src/maps/autoPaint/wallsTiles.js'
import { snapTemplatePiecePosition } from '../src/maps/mapEdits.js'
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
    assert.deepEqual(ruleset.walls.straight, [{ id: 'tplStarshipWall32', weight: 1 }])
    assert.deepEqual(ruleset.walls.corner, [{ id: 'tplStarshipWall32Corner', weight: 1 }])
    assert.deepEqual(ruleset.walls.straightLong, [{ id: 'tplStarshipWall32PlainLong', weight: 1 }])
    assert.equal(ruleset.walls.doorFrame, null)
    assert.equal(rulesetUsesTemplatePieces(ruleset), true)
    const kit = pieceKitFromRuleset(ruleset)
    assert.deepEqual(kit.straight, [{ id: 'tplStarshipWall32', weight: 1 }])
    assert.deepEqual(kit.corner, [{ id: 'tplStarshipWall32Corner', weight: 1 }])
    assert.deepEqual(kit.straightLong, [{ id: 'tplStarshipWall32PlainLong', weight: 1 }])
    // Explicit null must not fall back to Template Deck doorFrame.
    assert.deepEqual(kit.doorFrame, [])
    assert.deepEqual(kit.hull, [])
    assert.deepEqual(kit.hullCorner, [])
    assert.deepEqual(kit.hullLong, [])
    assert.deepEqual(kit.fittings, [])
    assert.equal(kit.fittingChance, 0)
    assert.ok(getTemplatePiece(kit.straight[0].id))
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
        hullLong: 'tplStarshipHull32Long',
        hullCorner: 'tplStarshipHull32Corner',
        doorFrame: null,
      },
      floors: { defaultTile: 'floor', variants: [] },
    })
    const kit = pieceKitFromRuleset(ruleset)
    assert.deepEqual(kit.straight, [{ id: 'tplStarshipHull32', weight: 1 }])
    assert.deepEqual(kit.corner, [{ id: 'tplStarshipHull32Corner', weight: 1 }])
    assert.deepEqual(kit.hull, [{ id: 'tplStarshipHull32', weight: 1 }])
    assert.deepEqual(kit.hullLong, [{ id: 'tplStarshipHull32Long', weight: 1 }])
    assert.deepEqual(kit.hullCorner, [{ id: 'tplStarshipHull32Corner', weight: 1 }])
    assert.deepEqual(kit.doorFrame, [])
  })

  it('reports unknown tile ids without inventing replacements', () => {
    const resolved = resolveAutoPaintRuleset({
      id: 'tmp',
      walls: { straight: 'missing-wall', corner: 'also-missing' },
    })
    assert.deepEqual(resolved.walls.straight, [{ id: 'missing-wall', weight: 1 }])
    assert.deepEqual(resolved.walls.corner, [{ id: 'also-missing', weight: 1 }])
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

describe('placePackedWallPieces coverage', () => {
  const kit = () =>
    pieceKitFromRuleset(
      resolveAutoPaintRuleset({
        id: 'pack-kit',
        walls: {
          straight: 'tplStarshipWall32',
          straightLong: 'tplStarshipWall32PlainLong',
          corner: 'tplStarshipWall32Corner',
          hull: null,
          hullLong: null,
          hullCorner: null,
          doorFrame: null,
        },
        floors: { defaultTile: 'floor', variants: [] },
        doors: { underlayTile: 'doorway' },
      }),
    )

  function underlayMap(width, height, cells) {
    const map = createNullMap({ name: 'pack', width, height })
    const tiles = map.tiles.map((row) => row.slice())
    for (const [x, y] of cells) tiles[y][x] = 'templateWall'
    return { ...map, tiles, templatePiecePlacements: [], floorUnder: {} }
  }

  function autoPieces(map) {
    return (map.templatePiecePlacements ?? []).filter((entry) => entry.autoPaint)
  }

  function tipKeys(pieces) {
    return pieces.map((entry) => {
      const snapped = snapTemplatePiecePosition(entry.position, WALL_TIP_PX)
      return `${snapped.x},${snapped.y}`
    })
  }

  it('covers a straight run with Corner 32 end caps and 128/64 middle', () => {
    // Free ends always get Bulkhead Corner 32; middle packs 128 then 64.
    const cases = [
      { cells: [[2, 2]], expectLong: 0, expectShort: 0, expectCorners: 2 },
      { cells: [[2, 2], [3, 2]], expectLong: 0, expectShort: 1, expectCorners: 2 },
      { cells: [[2, 2], [3, 2], [4, 2]], expectLong: 1, expectShort: 0, expectCorners: 2 },
      { cells: [[2, 2], [3, 2], [4, 2], [5, 2]], expectLong: 1, expectShort: 1, expectCorners: 2 },
    ]
    for (const entry of cases) {
      const map = placePackedWallPieces(underlayMap(10, 10, entry.cells), kit())
      const pieces = autoPieces(map)
      const longs = pieces.filter((p) => /Long/i.test(p.pieceId)).length
      const shorts = pieces.filter((p) => p.pieceId === 'tplStarshipWall32').length
      const corners = pieces.filter((p) => /Corner/i.test(p.pieceId)).length
      assert.equal(corners, entry.expectCorners, `end-cap corners for ${entry.cells.length} cells`)
      assert.equal(longs, entry.expectLong, `long count for ${entry.cells.length} cells`)
      assert.equal(shorts, entry.expectShort, `short count for ${entry.cells.length} cells`)
      assert.equal(new Set(tipKeys(pieces)).size, pieces.length, 'unique tip keys')
      assert.equal(wallEdgesContinuouslyCovered(map, pieces), true)
    }
  })

  it('places a junction corner on an L and Corner 32 end caps on free arm ends', () => {
    const map = placePackedWallPieces(
      underlayMap(10, 10, [
        [3, 3],
        [4, 3],
        [5, 3],
        [5, 4],
        [5, 5],
      ]),
      kit(),
    )
    const pieces = autoPieces(map)
    const corners = pieces.filter((p) => /Corner/i.test(p.pieceId))
    assert.ok(corners.length >= 3, 'junction corner + free-end caps')
    assert.ok(pieces.some((p) => /Long/i.test(p.pieceId) || p.pieceId === 'tplStarshipWall32'))
    assert.equal(new Set(tipKeys(pieces)).size, pieces.length)
    assert.equal(wallEdgesContinuouslyCovered(map, pieces), true)
  })

  it('handles a T-junction with end caps (no tip collisions)', () => {
    // Horizontal through-run with a south stem at the middle cell (true T at 4,4).
    const map = placePackedWallPieces(
      underlayMap(12, 12, [
        [2, 4],
        [3, 4],
        [4, 4],
        [5, 4],
        [6, 4],
        [4, 5],
        [4, 6],
      ]),
      kit(),
    )
    const pieces = autoPieces(map)
    const corners = pieces.filter((p) => /Corner/i.test(p.pieceId))
    assert.ok(corners.length >= 4, 'junction corner + free-end caps on three arms')
    assert.ok(pieces.length >= 3, 'corner + through + stem coverage')
    assert.equal(new Set(tipKeys(pieces)).size, pieces.length)
    assert.equal(wallEdgesContinuouslyCovered(map, pieces), true)
  })

  it('handles a cross with end caps (one junction corner tip)', () => {
    const map = placePackedWallPieces(
      underlayMap(12, 12, [
        [5, 3],
        [5, 4],
        [4, 5],
        [5, 5],
        [6, 5],
        [5, 6],
        [5, 7],
      ]),
      kit(),
    )
    const pieces = autoPieces(map)
    const corners = pieces.filter((p) => /Corner/i.test(p.pieceId))
    assert.ok(corners.length >= 5, 'junction corner + free-end caps on four arms')
    assert.ok(pieces.some((p) => `${p.position.x},${p.position.y}` === '6,6' || `${p.position.x},${p.position.y}` === '5.5,6' || p.pieceId.includes('Corner')))
    assert.equal(new Set(tipKeys(pieces)).size, pieces.length)
    assert.equal(wallEdgesContinuouslyCovered(map, pieces), true)
  })

  it('does not place door frames when doorFrame role is null', () => {
    const map = underlayMap(8, 8, [
      [2, 3],
      [3, 3],
      [6, 3],
      [7, 3],
    ])
    map.tiles[3][4] = 'floor'
    map.tiles[3][5] = 'floor'
    const packed = placePackedWallPieces(map, kit(), { doorKeys: ['4,3', '5,3'] })
    const pieces = autoPieces(packed)
    assert.ok(!pieces.some((p) => /DoorFrame/i.test(p.pieceId)))
    assert.equal(pieces.filter((p) => p.pieceId === 'tplStarshipDoorway32').length, 3, '96px = 3× Doorway 32')
    assert.ok(pieces.some((p) => /Corner/i.test(p.pieceId)), 'Corner 32 on leftover tip / free wall ends')
    assert.ok(!pieces.some((p) => p.pieceId === 'tplStarshipFloor32'), 'no Floor 32 overlay on openings')
  })

  it('snaps every tip to the 32px tip grid', () => {
    const map = placePackedWallPieces(
      underlayMap(10, 10, [
        [2, 2],
        [3, 2],
        [4, 2],
        [4, 3],
      ]),
      kit(),
    )
    for (const entry of autoPieces(map)) {
      const snapped = snapTemplatePiecePosition(entry.position, WALL_TIP_PX)
      assert.equal(entry.position.x, snapped.x)
      assert.equal(entry.position.y, snapped.y)
      assert.ok([0, 90, 180, 270].includes(entry.rotation))
    }
  })

  it('rebuild yields the same auto piece set for a stable footprint', () => {
    const ruleset = getAutoPaintRuleset('template-32')
    let map = createNullMap({ name: 'rebuild', width: 12, height: 12 })
    map = paintFloors(map, rectCells(3, 3, 7, 6))
    const first = assembleWallsFromFloors(map, ruleset, { random: () => 0.25 })
    const second = assembleWallsFromFloors(first, ruleset, { random: () => 0.25 })
    const ids = (m) =>
      (m.templatePiecePlacements ?? [])
        .filter((e) => e.autoPaint)
        .map((e) => `${e.pieceId}@${e.position.x},${e.position.y}@${e.rotation}`)
        .sort()
    assert.deepEqual(ids(second), ids(first))
  })
})

describe('placePackedWallPieces geometric continuity', () => {
  const kit = () =>
    pieceKitFromRuleset(
      resolveAutoPaintRuleset({
        id: 'geo-kit',
        walls: {
          straight: 'tplStarshipWall32',
          straightLong: 'tplStarshipWall32PlainLong',
          corner: 'tplStarshipWall32Corner',
          hull: null,
          hullLong: null,
          hullCorner: null,
          doorFrame: null,
        },
        floors: { defaultTile: 'floor', variants: [] },
        doors: { underlayTile: 'doorway' },
      }),
    )

  function underlayMap(width, height, cells, { floorFill = true } = {}) {
    const map = createNullMap({ name: 'geo', width, height })
    const tiles = map.tiles.map((row) => row.slice())
    if (floorFill) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) tiles[y][x] = 'floor'
      }
    }
    for (const [x, y] of cells) tiles[y][x] = 'templateWall'
    return { ...map, tiles, templatePiecePlacements: [], floorUnder: {} }
  }

  function autoPieces(map) {
    return (map.templatePiecePlacements ?? []).filter((entry) => entry.autoPaint)
  }

  function byTip(pieces) {
    return Object.fromEntries(
      pieces.map((p) => [`${p.position.x},${p.position.y}`, { pieceId: p.pieceId, rotation: p.rotation }]),
    )
  }

  function assertNoFootprintOverlapInterior(pieces) {
    // Allow half-cell overlap only where a junction fill meets an arm (shared edge).
    // Reject full-cell duplicate coverage from two identical tips (already unique) /
    // two pieces with identical AABBs.
    const boxes = pieces.map((p) => ({ ...pieceFootprintAabb(p), pieceId: p.pieceId }))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
        const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
        if (ox <= 1e-9 || oy <= 1e-9) continue
        const area = ox * oy
        // Junction fill may overlap an arm by at most a 0.5×0.5 square (0.25).
        assert.ok(area <= 0.25 + 1e-9, `overlap area ${area} between ${a.pieceId} and ${b.pieceId}`)
      }
    }
  }

  it('covers straight runs on both axes with exact tip spans', () => {
    const horiz = placePackedWallPieces(underlayMap(10, 10, [[2, 2], [3, 2], [4, 2]]), kit())
    const hPieces = autoPieces(horiz)
    assert.deepEqual(byTip(hPieces), {
      '2.5,3': { pieceId: 'tplStarshipWall32Corner', rotation: 270 },
      '4.5,3': { pieceId: 'tplStarshipWall32PlainLong', rotation: 180 },
      '5,3': { pieceId: 'tplStarshipWall32Corner', rotation: 0 },
    })
    assert.equal(wallEdgesContinuouslyCovered(horiz, hPieces), true)

    const vert = placePackedWallPieces(underlayMap(10, 10, [[2, 2], [2, 3], [2, 4]]), kit())
    const vPieces = autoPieces(vert)
    assert.deepEqual(byTip(vPieces), {
      '3,2.5': { pieceId: 'tplStarshipWall32Corner', rotation: 270 },
      '3,4.5': { pieceId: 'tplStarshipWall32PlainLong', rotation: 270 },
      '3,5': { pieceId: 'tplStarshipWall32Corner', rotation: 180 },
    })
    assert.equal(wallEdgesContinuouslyCovered(vert, vPieces), true)
  })

  it('joins all four L-corners with continuous edge coverage', () => {
    const cases = [
      { name: 'ne', cells: [[5, 3], [5, 4], [6, 4]], cornerTip: '6,5', cornerRot: 0 },
      { name: 'es', cells: [[6, 4], [5, 4], [5, 5]], cornerTip: '6,5', cornerRot: 90 },
      { name: 'sw', cells: [[4, 4], [5, 4], [5, 3]], cornerTip: '6,5', cornerRot: 270 },
      { name: 'wn', cells: [[4, 4], [5, 4], [5, 5]], cornerTip: '6,5', cornerRot: 180 },
    ]
    for (const entry of cases) {
      const map = placePackedWallPieces(underlayMap(12, 12, entry.cells), kit())
      const pieces = autoPieces(map)
      const corners = pieces.filter((p) => /Corner/i.test(p.pieceId))
      assert.ok(corners.length >= 3, `${entry.name} junction + end caps`)
      const junction = pieces.find((p) => /Corner/i.test(p.pieceId) && `${p.position.x},${p.position.y}` === entry.cornerTip)
      assert.ok(junction, `${entry.name} junction tip ${entry.cornerTip}`)
      assert.equal(junction.rotation, entry.cornerRot, `${entry.name} corner rot`)
      assert.equal(wallEdgesContinuouslyCovered(map, pieces), true, `${entry.name} continuity`)
      assertNoFootprintOverlapInterior(pieces)
      assert.equal(new Set(pieces.map((p) => `${p.position.x},${p.position.y}`)).size, pieces.length)
    }
  })

  it('joins T-junctions in four stem orientations', () => {
    const cases = [
      {
        name: 'stem-s',
        cells: [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [4, 5], [4, 6]],
        fillTip: '4.5,5',
        junctionTip: '5,5',
      },
      {
        name: 'stem-n',
        cells: [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [4, 3], [4, 2]],
        fillTip: '4.5,5',
        junctionTip: '5,5',
      },
      {
        name: 'stem-e',
        cells: [[4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [5, 4], [6, 4]],
        fillTip: '5,4.5',
        junctionTip: '5,5',
      },
      {
        name: 'stem-w',
        cells: [[4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [3, 4], [2, 4]],
        fillTip: '5,4.5',
        junctionTip: '5,5',
      },
    ]
    for (const entry of cases) {
      const map = placePackedWallPieces(underlayMap(12, 12, entry.cells), kit())
      const pieces = autoPieces(map)
      const corners = pieces.filter((p) => /Corner/i.test(p.pieceId))
      assert.ok(corners.length >= 4, `${entry.name} junction + end caps`)
      assert.ok(
        pieces.some((p) => /Corner/i.test(p.pieceId) && `${p.position.x},${p.position.y}` === entry.junctionTip),
        `${entry.name} junction corner at ${entry.junctionTip}`,
      )
      assert.ok(
        pieces.some((p) => `${p.position.x},${p.position.y}` === entry.fillTip),
        `${entry.name} junction fill at ${entry.fillTip}`,
      )
      assert.equal(wallEdgesContinuouslyCovered(map, pieces), true, `${entry.name} continuity`)
      assertNoFootprintOverlapInterior(pieces)
    }
  })

  it('joins a cross with both axis fills, junction corner, and end caps', () => {
    const map = placePackedWallPieces(
      underlayMap(12, 12, [
        [5, 3],
        [5, 4],
        [4, 5],
        [5, 5],
        [6, 5],
        [5, 6],
        [5, 7],
      ]),
      kit(),
    )
    const pieces = autoPieces(map)
    assert.ok(pieces.filter((p) => /Corner/i.test(p.pieceId)).length >= 5)
    const tips = new Set(pieces.map((p) => `${p.position.x},${p.position.y}`))
    assert.ok(tips.has('6,6'), 'junction corner tip')
    assert.ok(tips.has('5.5,6'), 'west-arm south-edge fill toward corner')
    assert.ok(tips.has('6,5.5'), 'north-arm east-edge fill')
    assert.equal(wallEdgesContinuouslyCovered(map, pieces), true)
    assertNoFootprintOverlapInterior(pieces)
  })

  it('leaves a 96px doorway lined with Doorway 32 and terminates walls at the gap', () => {
    const map = underlayMap(12, 10, [
      [2, 4],
      [3, 4],
      [6, 4],
      [7, 4],
    ])
    map.tiles[4][4] = 'floor'
    map.tiles[4][5] = 'floor'
    const doorKeys = ['4,4', '5,4']
    const packed = placePackedWallPieces(map, kit(), { doorKeys })
    const pieces = autoPieces(packed)
    assert.ok(!pieces.some((p) => /DoorFrame/i.test(p.pieceId)))
    assert.equal(pieces.filter((p) => p.pieceId === 'tplStarshipDoorway32').length, 3)
    assert.ok(!pieces.some((p) => p.pieceId === 'tplStarshipFloor32'))
    // Wall run pieces must not cover the first 96px (3 tips) of the opening south edge [4, 5.5] at y=5.
    for (const entry of pieces) {
      if (/Doorway32|Corner/i.test(entry.pieceId)) continue
      const box = pieceFootprintAabb(entry)
      if (Math.abs(box.maxY - 5) > 1e-9) continue
      const overlap = Math.min(box.maxX, 5.5) - Math.max(box.minX, 4)
      assert.ok(overlap <= 1e-9, `wall must not bridge 96px doorway south edge, overlap=${overlap}`)
    }
    assert.equal(wallEdgesContinuouslyCovered(packed, pieces, { doorKeys }), true)
  })

  it('joins long walls into doorways and L-corners without gaps', () => {
    const map = underlayMap(16, 12, [
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
      [6, 5],
      [9, 5],
      [10, 5],
      [11, 5],
      [12, 5],
      [12, 6],
      [12, 7],
      [12, 8],
    ])
    map.tiles[5][7] = 'floor'
    map.tiles[5][8] = 'floor'
    const doorKeys = ['7,5', '8,5']
    const packed = placePackedWallPieces(map, kit(), { doorKeys })
    const pieces = autoPieces(packed)
    assert.ok(pieces.some((p) => /Corner/i.test(p.pieceId)))
    assert.ok(pieces.some((p) => /Long/i.test(p.pieceId)))
    assert.equal(wallEdgesContinuouslyCovered(packed, pieces, { doorKeys }), true)
    assertNoFootprintOverlapInterior(pieces)
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
    const doorKeys = map.autoPaint.regions[0].generatedDoorKeys ?? []
    assert.ok(doorKeys.length > 0, 'door opening keys recorded')
    for (const key of doorKeys) {
      const [x, y] = key.split(',').map(Number)
      assert.notEqual(map.tiles[y][x], 'doorway', 'no full-cell doorway tile')
      assert.ok(!getTile(map.tiles[y][x])?.wall, `opening ${key} is walkable floor`)
    }
    const doorway32 = autoPieces.filter((entry) => entry.pieceId === 'tplStarshipDoorway32')
    assert.ok(doorway32.length >= 3, 'at least one 96px (3× Doorway 32) opening')
    assert.equal(doorway32.length % 3, 0, 'Doorway 32 count is multiples of 3')
    assert.ok(
      !autoPieces.some((entry) => entry.pieceId === 'tplStarshipFloor32'),
      'no Floor 32 overlay on openings',
    )
    // Seed doorFrame is null — must not invent Template Deck frames.
    assert.ok(!autoPieces.some((entry) => entry.pieceId.includes('DoorFrame')), 'no door frames when role is null')
    assert.equal(
      wallEdgesContinuouslyCovered(map, autoPieces, { doorId: 'doorway' }),
      true,
      'full-deck tip-grid edge continuity',
    )
    assert.ok(map.markers.playerStarts.length > 0)
    for (const marker of [...map.markers.playerStarts, ...map.markers.enemySpawns]) {
      assert.ok(!getTile(map.tiles[marker.y][marker.x])?.wall)
      assert.notEqual(map.tiles[marker.y][marker.x], 'templateWall')
    }
  })
})
