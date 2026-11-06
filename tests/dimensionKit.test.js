// Dimension Kit: separate from Calibration; solid-but-lit size/footprint tests.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { getItemById, getItems } from '../src/rules/equipment.js'
import { getTile, PALETTE_GROUPS } from '../src/maps/mapFormat.js'
import { TEMPLATE_PIECES, getTemplatePiece, templatePieceGroups } from '../src/maps/templatePieces.js'

const root = path.resolve(import.meta.dirname, '..')

describe('Dimension Kit', () => {
  it('lists Dimension tile groups without removing Calibration', () => {
    const dim = PALETTE_GROUPS.filter((group) => group.section === 'Dimension')
    const cal = PALETTE_GROUPS.filter((group) => group.section === 'Calibration')
    assert.deepEqual(
      dim.map((group) => group.label),
      ['Floors', 'Heights', 'Walls', 'Columns', 'Surfaces', 'Furniture'],
    )
    assert.equal(cal.length, 5)
    assert.ok(getTile('calFloor'))
    assert.ok(getTile('dimFloor'))
    assert.equal(getTile('dimWall32Thick').height, 92)
    assert.equal(getTile('dimColumn32').wall, true)
    assert.equal(getTile('dimSteps4').height, 32)
    assert.equal(getTile('dimSteps6').height, 48)
    assert.ok(getTile('dimBlock4'))
    assert.ok(getTile('dimColumn8'))
    // Longer-than-cell pieces are Template Pieces only (tile canvas is 64 wide).
    assert.equal(getTile('dimWall32Long'), undefined)
    assert.equal(getTile('dimStepsWide'), undefined)
    assert.ok(getTemplatePiece('tplDimWall32Long'))
    assert.ok(getTemplatePiece('tplDimStepsWide'))
    const tiny = getTemplatePiece('tplDimTiny4h8')
    assert.deepEqual(tiny.footprint, { width: 4, depth: 4 })
    assert.equal(tiny.height, 8)
    assert.ok(tiny.tags.includes('tiny'))
    for (const id of dim.flatMap((group) => group.tiles)) {
      const tile = getTile(id)
      assert.equal(tile.id, id)
      assert.ok(fs.existsSync(path.join(root, 'public', tile.image)), tile.image)
    }
  })

  it('keeps Dimension Template Pieces and items out of the Starship / Calibration sets', () => {
    assert.ok(TEMPLATE_PIECES.some((piece) => piece.id === 'tplStarshipWall32'))
    assert.ok(getTemplatePiece('tplDimWall32'))
    assert.ok(templatePieceGroups().some((group) => group.id === 'template-dimension'))
    const items = getItems().filter((item) => item.category === 'dimension')
    assert.ok(items.length >= 12)
    assert.equal(getItemById('calFoot8Red')?.category, 'calibration')
    assert.equal(getItemById('dimFoot8')?.category, 'dimension')
    assert.equal(getItemById('dimTiny4h8')?.category, 'dimension')
    assert.ok(getItemById('dimTiny4h8')?.tags?.includes('tiny'))
    assert.ok(items.filter((item) => item.tags?.includes('tiny')).length >= 16)
    for (const item of items) {
      assert.ok(fs.existsSync(path.join(root, 'public', item.worldImage)), item.worldImage)
    }
  })
})
