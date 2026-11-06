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
import {
  TEMPLATE_PIECES,
  getTemplatePiece,
  templateOverlayEmissionAt,
  templatePieceArt,
  templatePieceFootprint,
  templatePieceGroups,
  templatePieceSpriteInfo,
} from '../src/maps/templatePieces.js'
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
      'tplStarshipWall32PlainLong',
      'tplStarshipWall32WindowLong',
      'tplStarshipWall32LcarsLong',
      'tplStarshipWall32ConduitLong',
      'tplStarshipWall32HatchLong',
      'tplStarshipWall32ComputerLong',
      'tplStarshipWall32Tee',
      'tplStarshipWall32Cross',
      'tplStarshipWall32Alcove',
      'tplStarshipDoorFrame',
      'tplStarshipHull32',
      'tplStarshipHull32Long',
      'tplStarshipHull32Corner',
      'tplStarshipHullViewport',
      'tplStarshipHullViewportLong',
      'tplStarshipDockCollar',
      'tplStarshipHalfBulkhead',
      'tplStarshipHalfBulkheadCorner',
      'tplStarshipFloor',
      'tplStarshipDoorway',
      'tplStarshipGrating',
      'tplStarshipFloor128',
      'tplStarshipFloor128x64',
      'tplStarshipFloor192x128',
      'tplStarshipFloor192x64',
      'tplStarshipFloor256',
      'tplStarshipFloorCorridor128',
      'tplStarshipFloorCorridor128x64',
      'tplStarshipFloorCorridor192x128',
      'tplStarshipFloorCargo128',
      'tplStarshipFloorCargo128x64',
      'tplStarshipFloorCarpet128',
      'tplStarshipFloorCarpet192x128',
      'tplStarshipFloorSickbay128',
      'tplStarshipGrating128',
      'tplStarshipGrating128x64',
      'tplStarshipDoorway128x64',
      'tplStarshipMachinery',
      'tplStarshipMachineryTall',
      'tplStarshipMachineryWide',
      'tplStarshipPillar32',
      'tplStarshipPillar16',
      'tplStarshipWarpCoil',
      'tplStarshipPipeRiser',
      'tplStarshipJunctionBox',
      'tplStarshipCrate',
      'tplStarshipEpsControl',
      'tplStarshipChair',
      'tplStarshipStool',
      'tplStarshipBench',
      'tplStarshipBenchLong',
      'tplStarshipTable',
      'tplStarshipBed',
      'tplStarshipConsole',
      'tplStarshipConsoleWide',
      'tplStarshipWallConsole',
      'tplStarshipLocker',
      'tplStarshipLockerWide',
      'tplStarshipShelf',
    ]
    const starship = TEMPLATE_PIECES.filter((piece) => piece.tags?.includes('starship'))
    assert.equal(starship.length, expected.length)
    for (const id of expected) assert.ok(getTemplatePiece(id), id)
    for (const piece of starship) {
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
    assert.deepEqual(getTemplatePiece('tplStarshipWall32PlainLong').footprint, { width: 128, depth: 32 })
    assert.deepEqual(getTemplatePiece('tplStarshipHull32').footprint, { width: 64, depth: 32 })
    assert.equal(getTemplatePiece('tplStarshipHull32').face, 'hull')
    assert.ok(getTemplatePiece('tplStarshipHullViewport').animation?.overlay)
    assert.ok(getTemplatePiece('tplStarshipDockCollar').animation?.overlay)
    assert.deepEqual(getTemplatePiece('tplStarshipHalfBulkhead').footprint, { width: 64, depth: 8 })
    assert.deepEqual(getTemplatePiece('tplStarshipFloor').footprint, { width: 64, depth: 64 })
    assert.deepEqual(getTemplatePiece('tplStarshipFloor128').footprint, { width: 128, depth: 128 })
    assert.deepEqual(getTemplatePiece('tplStarshipFloor256').footprint, { width: 256, depth: 256 })
    assert.deepEqual(getTemplatePiece('tplStarshipFloorCorridor128x64').footprint, { width: 128, depth: 64 })
    assert.equal(getTemplatePiece('tplStarshipFloorCorridor128').material, 'floorCorridor')
    assert.ok(getTemplatePiece('tplStarshipFloorSickbay128').animation?.overlay)
    assert.ok(getTemplatePiece('tplStarshipGrating128').animation?.overlay)
    assert.ok(getTemplatePiece('tplStarshipDoorway128x64').animation?.overlay)
    assert.equal(getTemplatePiece('tplStarshipCrate').height, 16)
    assert.equal(getTemplatePiece('tplStarshipMachinery').height, 40)
    assert.equal(getTemplatePiece('tplStarshipMachineryTall').height, 64)
    assert.deepEqual(getTemplatePiece('tplStarshipMachineryWide').footprint, { width: 128, depth: 64 })
    assert.deepEqual(getTemplatePiece('tplStarshipPillar32').footprint, { width: 32, depth: 32 })
    assert.ok(getTemplatePiece('tplStarshipWarpCoil').animation?.overlay)
    assert.equal(getTemplatePiece('tplStarshipWarpCoil').animation.emitColour, '#6fc8ff')
    assert.equal(getTemplatePiece('tplStarshipJunctionBox').fade, false)
    assert.equal(getTemplatePiece('tplStarshipPillar32').fade, true)
    assert.deepEqual(getTemplatePiece('tplStarshipChair').footprint, { width: 36, depth: 42 })
    assert.deepEqual(getTemplatePiece('tplStarshipConsole').footprint, { width: 60, depth: 50 })
    assert.equal(getTemplatePiece('tplStarshipConsole').cover, true)
    assert.ok(getTemplatePiece('tplStarshipConsole').animation?.overlay)
    assert.equal(getTemplatePiece('tplStarshipConsole').animation.emitColour, '#7aa8ff')
    assert.ok(getTemplatePiece('tplStarshipBed').animation?.overlay)
    assert.equal(getTemplatePiece('tplStarshipLocker').fade, true)
    assert.equal(getTemplatePiece('tplStarshipShelf').fade, true)
    assert.equal(getTemplatePiece('tplStarshipChair').fade, false)
  })

  it('ships a Dimension Kit separate from Starship templates', () => {
    const dimension = TEMPLATE_PIECES.filter((piece) => piece.tags?.includes('dimension'))
    assert.ok(dimension.length >= 80, `expected expanded Dimension templates, got ${dimension.length}`)
    for (const piece of dimension) {
      assert.ok(piece.id.startsWith('tplDim'))
      assert.ok(Number.isFinite(piece.anchorX), `${piece.id} needs anchorX`)
      assert.ok(piece.footprint?.width > 0 && piece.footprint?.depth > 0)
      assert.equal(piece.tags?.includes('starship'), false)
    }
    assert.deepEqual(getTemplatePiece('tplDimWall32').footprint, { width: 64, depth: 32 })
    assert.deepEqual(getTemplatePiece('tplDimFloor64x32').footprint, { width: 64, depth: 32 })
    assert.deepEqual(getTemplatePiece('tplDimFloor256').footprint, { width: 256, depth: 256 })
    assert.deepEqual(getTemplatePiece('tplDimPost32').footprint, { width: 32, depth: 32 })
    assert.ok(getTemplatePiece('tplDimSteps6'))
    assert.ok(getTemplatePiece('tplDimRampTall'))
    const groups = templatePieceGroups()
    assert.ok(groups.some((group) => group.id === 'template-pieces'))
    assert.ok(groups.some((group) => group.id === 'template-dimension'))
  })

  it('exposes south-tip anchorX on wall sprites for grid alignment', () => {
    const blank = createBlankMap({ width: 8, height: 8 })
    const placed = placeTemplatePiece(blank, { x: 2, y: 3 }, 'tplStarshipWall32', 64)
    assert.ok(placed)
    const sprites = templatePieceSprites(placed.map)
    assert.equal(sprites.length, 1)
    assert.equal(sprites[0].spriteAnchorX, getTemplatePiece('tplStarshipWall32').anchorX)
  })

  it('yaws Template Piece art around the vertical (baked orients, no screen spin)', () => {
    const wall = getTemplatePiece('tplStarshipWall32')
    assert.ok(wall.orients?.['90']?.href)
    assert.ok(wall.orients?.['180']?.href)
    assert.ok(wall.orients?.['270']?.href)
    const at0 = templatePieceArt(wall, 0)
    const at90 = templatePieceArt(wall, 90)
    assert.equal(at0.href, wall.href)
    assert.notEqual(at90.href, wall.href)
    assert.deepEqual(templatePieceFootprint(wall, 0), { width: 64, depth: 32 })
    assert.deepEqual(templatePieceFootprint(wall, 90), { width: 32, depth: 64 })

    const blank = createBlankMap({ width: 8, height: 8 })
    const placed = placeTemplatePiece(blank, { x: 2, y: 3 }, 'tplStarshipWall32', 64, { rotation: 90 })
    const sprites = templatePieceSprites(placed.map)
    assert.equal(sprites[0].rotation, 0)
    assert.equal(sprites[0].yaw, 90)
    assert.equal(sprites[0].worldImage, at90.href)
    assert.equal(sprites[0].spriteAnchorX, at90.anchorX)
  })

  it('exposes overlay emission frames for fitting pieces', () => {
    const plain = getTemplatePiece('tplStarshipWall32')
    assert.equal(plain.animation, undefined)
    assert.equal(templateOverlayEmissionAt(plain.animation, 0), null)

    const window = getTemplatePiece('tplStarshipWall32Window')
    assert.ok(window.animation?.overlay)
    assert.equal(window.animation.images.length, 2)
    const frame0 = templateOverlayEmissionAt(window.animation, 0)
    const frame1 = templateOverlayEmissionAt(window.animation, 0.5)
    assert.equal(frame0, window.animation.images[0].emission)
    assert.equal(frame1, window.animation.images[1].emission)

    const info = templatePieceSpriteInfo(window)
    assert.equal(info.animation.steps, 2)
    assert.equal(info.animation.emissions.length, 2)
    assert.ok(info.images.some((entry) => entry.label === 'Yaw 90°'))
  })

  it('matches Starship wall cover / fade defaults', () => {
    assert.equal(getTemplatePiece('tplStarshipWall32Lcars').cover, false)
    assert.equal(getTemplatePiece('tplStarshipWall32Lcars').fade, true)
    assert.equal(getTemplatePiece('tplStarshipWall32Lcars').animation.emitColour, '#a8c0ff')
    assert.equal(getTemplatePiece('tplStarshipCrate').cover, true)
    assert.equal(getTemplatePiece('tplStarshipCrate').fade, false)
    assert.equal(getTemplatePiece('tplStarshipFloor').fade, false)
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
    // Fine grids (32 and under) share origin 0 with item snap; coarse 64+ sit on tile edges (−0.5).
    assert.deepEqual(templatePieceTargetAt(board, 32), snapItemPosition(unproject(board), 32))
    assert.deepEqual(snapTemplatePiecePosition({ x: 3.2, y: 4.1 }, 32), { x: 3, y: 4 })
    assert.deepEqual(snapTemplatePiecePosition({ x: 3.3, y: 4.4 }, 8), snapItemPosition({ x: 3.3, y: 4.4 }, 8))
    assert.deepEqual(templatePieceTargetAt(board, 64), { x: 3.5, y: 4.5 })
    assert.deepEqual(snapTemplatePiecePosition({ x: 3.2, y: 4.1 }, 64), { x: 3.5, y: 4.5 })
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

  it('keeps a neighbouring floor when the pointer still hits that floor’s sprite', () => {
    const blank = createBlankMap({ width: 8, height: 8 })
    const first = placeTemplatePiece(blank, { x: 3, y: 4 }, 'tplStarshipFloor', 32)
    assert.ok(first)
    // Painting the next cell while replaceIds still names the neighbour (sprite under the pointer).
    const next = placeTemplatePiece(first.map, { x: 2, y: 4 }, 'tplStarshipFloor', 32, {
      replaceIds: [first.object.id],
    })
    assert.ok(next)
    assert.equal(next.map.templatePiecePlacements.length, 2)
    assert.ok(next.map.templatePiecePlacements.some((entry) => entry.id === first.object.id))
    // Same tip still replaces (id may be reused once the old tip is cleared).
    const over = placeTemplatePiece(first.map, { x: 3, y: 4 }, 'tplStarshipFloor', 32, {
      replaceIds: [first.object.id],
    })
    assert.ok(over)
    assert.equal(over.map.templatePiecePlacements.length, 1)
    assert.deepEqual(over.map.templatePiecePlacements[0].position, first.object.position)
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
