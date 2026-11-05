import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createBlankMap,
  normalizeTemplateRotation,
  parseMapFile,
  resizeMap,
  serializeMap,
} from '../src/maps/mapFormat.js'
import {
  moveTemplatePiece,
  placeTemplatePiece,
  removeTemplatePiece,
  snapTemplatePiecePosition,
  templatePieceFits,
  templatePieceSprites,
  templatePieceTargetAt,
  updateTemplatePiece,
} from '../src/maps/mapEdits.js'
import { TEMPLATE_PIECES, getTemplatePiece } from '../src/maps/templatePieces.js'
import { project, unproject } from '../src/maps/iso.js'
import { snapItemPosition } from '../src/rules/itemGrid.js'

describe('templatePieces catalogue', () => {
  it('ships the full Starship & Station overlay kit with south-tip anchors', () => {
    const expected = [
      'tplStarshipWall32',
      'tplStarshipWall32Window',
      'tplStarshipWall32Lcars',
      'tplStarshipWall32Conduit',
      'tplStarshipWall32Hatch',
      'tplStarshipWall32Computer',
      'tplStarshipWall32Corner',
      'tplStarshipWall32LcarsLong',
      'tplStarshipWall32ConduitLong',
      'tplStarshipWall32HatchLong',
      'tplStarshipWall32ComputerLong',
      'tplStarshipHalfBulkhead',
      'tplStarshipHalfBulkheadCorner',
      'tplStarshipFloor',
      'tplStarshipDoorway',
      'tplStarshipGrating',
      'tplStarshipMachinery',
      'tplStarshipCrate',
      'tplStarshipEpsControl',
    ]
    assert.equal(TEMPLATE_PIECES.length, expected.length)
    for (const id of expected) assert.ok(getTemplatePiece(id), id)
    for (const piece of TEMPLATE_PIECES) {
      assert.ok(piece.href)
      assert.ok(piece.size?.width > 0 && piece.size?.height > 0)
      assert.ok(Number.isFinite(piece.anchorX), `${piece.id} needs anchorX`)
      assert.ok(piece.tags?.includes('starship'))
    }
    const wall = getTemplatePiece('tplStarshipWall32')
    assert.notEqual(wall.anchorX, wall.size.width / 2)
    assert.deepEqual(wall.footprint, { width: 64, depth: 32 })
    assert.deepEqual(getTemplatePiece('tplStarshipWall32Corner').footprint, { width: 32, depth: 32 })
    assert.deepEqual(getTemplatePiece('tplStarshipWall32LcarsLong').footprint, { width: 128, depth: 32 })
    assert.deepEqual(getTemplatePiece('tplStarshipHalfBulkhead').footprint, { width: 64, depth: 8 })
    assert.deepEqual(getTemplatePiece('tplStarshipFloor').footprint, { width: 64, depth: 64 })
    assert.equal(getTemplatePiece('tplStarshipCrate').height, 16)
    assert.equal(getTemplatePiece('tplStarshipMachinery').height, 40)
  })

  it('exposes south-tip anchorX on wall sprites for grid alignment', () => {
    const blank = createBlankMap({ width: 8, height: 8 })
    const placed = placeTemplatePiece(blank, { x: 2, y: 3 }, 'tplStarshipWall32', 64)
    assert.ok(placed)
    const sprites = templatePieceSprites(placed.map)
    assert.equal(sprites.length, 1)
    assert.equal(sprites[0].spriteAnchorX, getTemplatePiece('tplStarshipWall32').anchorX)
  })
})

describe('templatePiecePlacements schema', () => {
  it('omits empty placements and round-trips rotation in 90° steps', () => {
    const blank = createBlankMap({ width: 8, height: 8 })
    const serializedBlank = serializeMap(blank)
    assert.equal('templatePiecePlacements' in serializedBlank, false)

    const placed = placeTemplatePiece(blank, { x: 1, y: 2 }, 'tplStarshipWall32', 64, { rotation: 95 })
    assert.ok(placed)
    assert.equal(placed.object.rotation, 90)
    const file = serializeMap(placed.map)
    assert.ok(Array.isArray(file.templatePiecePlacements))
    assert.equal(file.templatePiecePlacements.length, 1)
    assert.equal(file.templatePiecePlacements[0].rotation, 90)
    assert.equal(file.templatePiecePlacements[0].pieceId, 'tplStarshipWall32')

    const loaded = parseMapFile(file, 'test')
    assert.equal(loaded.templatePiecePlacements.length, 1)
    assert.equal(loaded.templatePiecePlacements[0].rotation, 90)

    const spun = updateTemplatePiece(loaded, loaded.templatePiecePlacements[0].id, { rotation: 180 })
    assert.equal(spun.templatePiecePlacements[0].rotation, 180)
    const cleared = removeTemplatePiece(spun, spun.templatePiecePlacements[0].id)
    assert.equal(cleared.templatePiecePlacements.length, 0)
  })

  it('normalizeTemplateRotation snaps to quarter turns', () => {
    assert.equal(normalizeTemplateRotation(0), 0)
    assert.equal(normalizeTemplateRotation(44), 0)
    assert.equal(normalizeTemplateRotation(45), 90)
    assert.equal(normalizeTemplateRotation(90), 90)
    assert.equal(normalizeTemplateRotation(-90), 270)
  })
})

describe('templatePiece snap', () => {
  it('snaps tips to the chosen guide grid', () => {
    const board = project({ x: 3.25, y: 4.75 })
    assert.deepEqual(templatePieceTargetAt(board, 64), snapItemPosition(unproject(board), 64))
    assert.deepEqual(templatePieceTargetAt(board, 32), snapItemPosition(unproject(board), 32))
    assert.deepEqual(snapTemplatePiecePosition({ x: 3.2, y: 4.1 }, 32), { x: 3, y: 4 })
    assert.deepEqual(snapTemplatePiecePosition({ x: 3.3, y: 4.4 }, 8), snapItemPosition({ x: 3.3, y: 4.4 }, 8))
  })

  it('overwrites the same tip but keeps a neighbour placed beside it', () => {
    const blank = createBlankMap({ width: 8, height: 8 })
    const first = placeTemplatePiece(blank, { x: 3, y: 4 }, 'tplStarshipWall32', 64)
    assert.ok(first)
    const over = placeTemplatePiece(first.map, { x: 3, y: 4 }, 'tplStarshipWall32Corner', 64)
    assert.ok(over)
    assert.equal(over.map.templatePiecePlacements.length, 1)
    assert.equal(over.map.templatePiecePlacements[0].pieceId, 'tplStarshipWall32Corner')

    // Tip at the far end of the first wall's run — adjacent, must not delete the first wall.
    const beside = placeTemplatePiece(first.map, { x: 2, y: 4 }, 'tplStarshipWall32', 64)
    assert.ok(beside)
    assert.equal(beside.map.templatePiecePlacements.length, 2)
  })

  it('allows tips on the outer rim (width/height inclusive)', () => {
    const blank = createBlankMap({ width: 8, height: 6 })
    assert.equal(templatePieceFits(blank, { x: 8, y: 6 }), true)
    assert.equal(templatePieceFits(blank, { x: 8, y: 0 }), true)
    assert.equal(templatePieceFits(blank, { x: 0, y: 6 }), true)
    assert.equal(templatePieceFits(blank, { x: 8.125, y: 3 }), false)
    assert.equal(templatePieceFits(blank, { x: -0.125, y: 3 }), false)

    const placed = placeTemplatePiece(blank, { x: 8, y: 6 }, 'tplStarshipWall32')
    assert.ok(placed)
    assert.deepEqual(placed.object.position, { x: 8, y: 6 })

    const moved = moveTemplatePiece(placed.map, placed.object.id, { x: 8, y: 0 })
    assert.deepEqual(moved.templatePiecePlacements[0].position, { x: 8, y: 0 })

    const file = serializeMap(moved)
    const loaded = parseMapFile(file, 'test')
    assert.deepEqual(loaded.templatePiecePlacements[0].position, { x: 8, y: 0 })

    const shrunk = resizeMap(loaded, 7, 6)
    assert.equal(shrunk.templatePiecePlacements.length, 0)
  })
})
