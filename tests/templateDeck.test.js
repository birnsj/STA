import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap, getTile } from '../src/maps/mapFormat.js'
import { generateMap } from '../src/maps/mapGenerators.js'
import { TEMPLATE_WALL_UNDERLAY } from '../src/maps/generators/templateDeck.js'
import { getTemplatePiece } from '../src/maps/templatePieces.js'

function seeded(seed = 1) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

describe('Template Deck generator', () => {
  it('places 32-thick Template Piece walls with corners at junctions', () => {
    const blank = { ...createBlankMap({ width: 20, height: 14 }), mapType: 'templateDeck' }
    const map = generateMap(blank, seeded(7))
    assert.equal(map.mapType, 'templateDeck')
    const placements = map.templatePiecePlacements ?? []
    assert.ok(placements.length > 20, `expected many wall pieces, got ${placements.length}`)

    let walls = 0
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[y][x] === TEMPLATE_WALL_UNDERLAY) {
          walls += 1
          assert.equal(getTile(map.tiles[y][x]).empty, true)
          assert.equal(getTile(map.tiles[y][x]).solid, true)
          assert.equal(getTile(map.tiles[y][x]).blocksSight, true)
        }
      }
    }
    assert.ok(walls > 10)

    const ids = new Set(placements.map((entry) => entry.pieceId))
    assert.ok(ids.has('tplStarshipWall32Corner') || ids.has('tplStarshipHull32Corner'), 'corners at intersections')
    assert.equal(ids.has('tplStarshipWall32Tee'), false, 'no tee pieces')
    assert.equal(ids.has('tplStarshipWall32Cross'), false, 'no cross pieces')
    assert.ok([...ids].some((id) => id.includes('Wall32') || id.includes('Hull32')), '32-thick walls')

    for (const entry of placements) {
      const def = getTemplatePiece(entry.pieceId)
      assert.ok(def, entry.pieceId)
      if (/Corner/i.test(entry.pieceId)) {
        assert.ok(def.tags?.includes('corner'), entry.pieceId)
        assert.deepEqual(def.footprint, { width: 32, depth: 32 })
      }
      if (def.tags?.includes('straight') && def.tags?.includes('thick32') && !def.tags?.includes('long')) {
        assert.equal(def.footprint.depth, 32)
      }
    }
  })

  it('clears Template Pieces when generating a non-template location', () => {
    const withPieces = {
      ...createBlankMap({ width: 14, height: 10 }),
      mapType: 'starshipDeck',
      templatePiecePlacements: [{ id: 'x', pieceId: 'tplStarshipWall32', position: { x: 1, y: 1 }, rotation: 0, scale: 1, order: 0 }],
    }
    const map = generateMap(withPieces, seeded(3))
    assert.deepEqual(map.templatePiecePlacements, [])
  })
})
