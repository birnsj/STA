import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveAutoPaintTileId, resolveTemplatePieceToTile } from '../src/maps/autoPaint/templatePalette.js'
import { editorTemplatePaletteItems, listEditorTemplatePieces, templatePieceGroups } from '../src/maps/templatePieces.js'

describe('Auto-Paint shares Dev Edit Template catalogue', () => {
  it('editorTemplatePaletteItems matches templatePieceGroups Template Pieces', () => {
    const group = templatePieceGroups().find((entry) => entry.id === 'template-pieces')
    assert.ok(group?.pieces?.length > 20)
    const listed = listEditorTemplatePieces()
    assert.equal(listed.length, group.pieces.length)
    const items = editorTemplatePaletteItems()
    assert.equal(items.length, group.pieces.length)
    assert.ok(items.every((item) => item.kind === 'piece'))
    assert.ok(items.some((item) => item.id === 'tplStarshipWall32'))
  })

  it('resolves Template Pieces to wall32 tiles without a parallel id table', () => {
    assert.equal(resolveTemplatePieceToTile('tplStarshipWall32'), 'wall32')
    assert.equal(resolveTemplatePieceToTile('tplStarshipWall32Corner'), 'wall32Corner')
    assert.equal(resolveTemplatePieceToTile('tplStarshipHull32'), 'wall32')
    assert.equal(resolveTemplatePieceToTile('tplStarshipFloor'), 'floor')
    assert.equal(resolveAutoPaintTileId('wall32'), 'wall32')
    assert.equal(resolveAutoPaintTileId('tplStarshipWall32'), 'wall32')
  })
})
