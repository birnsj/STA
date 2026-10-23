// A prop stacked on a surface changes no floor tile. The dirty rect must still include that cell, or the
// board never draws the piece on top until some later tile edit.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { boardLayout, changedArea } from '../src/components/maps/canvasTiles.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { paintTile } from '../src/maps/mapEdits.js'

describe('changedArea stackOver', () => {
  it('a first prop placed on a height block dirties that cell', () => {
    const blank = createBlankMap({ width: 4, height: 4 })
    const base = paintTile(blank, { x: 1, y: 1 }, 'calBlock16')
    const stacked = paintTile(base, { x: 1, y: 1 }, 'calBlock8')
    assert.deepEqual(stacked.stackOver['1,1'], ['calBlock8'])
    assert.equal(stacked.tiles[1][1], 'calBlock16')
    const area = changedArea(boardLayout(base), boardLayout(stacked))
    assert.ok(area && area !== 'all')
    assert.ok(area.width > 0 && area.height > 0)
  })

  it('reports nothing when the stack is unchanged', () => {
    const blank = createBlankMap({ width: 4, height: 4 })
    const base = paintTile(blank, { x: 1, y: 1 }, 'calBlock16')
    const stacked = paintTile(base, { x: 1, y: 1 }, 'calBlock8')
    assert.equal(changedArea(boardLayout(stacked), boardLayout(stacked)), null)
  })
})
