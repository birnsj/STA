// A prop stacked on a surface changes no floor tile. The dirty rect must still include that cell, or the
// board never draws the piece on top until some later tile edit.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { boardLayout, changedArea, imagesFor } from '../src/components/maps/canvasTiles.js'
import { createBlankMap, getTile } from '../src/maps/mapFormat.js'
import { paintTile } from '../src/maps/mapEdits.js'
import { bigFlipbook, tileFlipbook } from '../src/maps/tileArt.js'

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

describe('stackOver image discovery', () => {
  it('includes base, big, and animated art for a tile used only in a stack', () => {
    const map = createBlankMap({ width: 2, height: 2 })
    map.stackOver = { '0,0': ['machinery'] }
    const tile = getTile('machinery')
    const images = new Set(imagesFor(map))
    assert.ok(images.has(tile.image))
    assert.ok(images.has(tile.big.image))
    for (const book of [tileFlipbook(tile), bigFlipbook(tile)]) {
      assert.ok(book)
      for (const sprite of book.sprites) {
        assert.ok(images.has(sprite.href))
        if (sprite.emission) assert.ok(images.has(sprite.emission))
      }
    }
  })
})
