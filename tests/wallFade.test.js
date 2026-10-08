// Tall walls and see-through blocks (maps/wallFade.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fadedBlockKeys } from '../src/maps/wallFade.js'
import { getTile, imageSize, TILES } from '../src/maps/mapFormat.js'
import { TILE_H } from '../src/maps/iso.js'
import { fadeWholePanels, getWallPanels } from '../src/maps/wallPanels.js'
import { fadeWholeBigObjects, getBigObjects } from '../src/maps/bigObjects.js'

// A 5 x 5 deck with one bulkhead (a fading wall) and one crate (a block that doesn't fade) in the middle row.
const map = {
  width: 5,
  height: 5,
  tiles: Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => (y === 2 && x === 2 ? 'bulkhead' : y === 2 && x === 3 ? 'crate' : 'floor'))),
}

describe('tile images (drawn at their own size, never stretched)', () => {
  it('every block image is tall enough to hold its block', () => {
    for (const tile of TILES.filter((candidate) => candidate.height > 0)) {
      const top = imageSize(tile).height - TILE_H - tile.height
      assert.ok(top >= 0, `${tile.id} reaches ${-top} above its image`)
    }
  })

  it('walls and tall objects have taller images; big objects have their own', () => {
    assert.equal(imageSize(getTile('bulkhead')).height, 128)
    assert.equal(imageSize(getTile('crate')).height, 96)
    for (const tile of TILES.filter((candidate) => candidate.big)) {
      assert.match(tile.big.image, /-big\.png$/, tile.id)
      assert.ok(tile.big.height > 0, tile.id)
    }
  })
})

describe('wall fading', () => {
  it('a wall fades when a party member stands right behind it', () => {
    assert.deepEqual([...fadedBlockKeys(map, [{ x: 1, y: 1 }])], ['2,2'])
  })

  it('a wall does not fade for someone in front of it or off to the side', () => {
    assert.equal(fadedBlockKeys(map, [{ x: 3, y: 3 }]).size, 0)
    assert.equal(fadedBlockKeys(map, [{ x: 4, y: 0 }]).size, 0)
  })

  it('blocks without Fade never fade', () => {
    assert.equal(fadedBlockKeys(map, [{ x: 2, y: 1 }]).has('3,2'), false)
  })
})

// rows: one character per tile: '#' bulkhead (a built wall), 'r' rock wall (no panels), 'o' boulder (big, too low to
// fade), 't' tree (big, fades), 'c' crate (not big), '.' floor.
const symbols = { '#': 'bulkhead', r: 'rockWall', o: 'rock', t: 'tree', c: 'crate', '.': 'floor' }
const mapOf = (rows) => ({ width: rows[0].length, height: rows.length, tiles: rows.map((row) => [...row].map((char) => symbols[char])) })

describe('two-tile wall panels', () => {
  it('pairs a straight run of built walls, every other panel with a window, and leaves an odd one single', () => {
    const panels = getWallPanels(mapOf(['#####']))
    assert.deepEqual(panels.get('0,0'), { axis: 'x', half: 0, window: false })
    assert.deepEqual(panels.get('1,0'), { axis: 'x', half: 1, window: false })
    assert.deepEqual(panels.get('2,0'), { axis: 'x', half: 0, window: true })
    assert.deepEqual(panels.get('3,0'), { axis: 'x', half: 1, window: true })
    assert.equal(panels.has('4,0'), false)
  })

  it('pairs walls running along y once the x runs are taken', () => {
    const panels = getWallPanels(mapOf(['#.', '#.', '#.']))
    assert.deepEqual(panels.get('0,0'), { axis: 'y', half: 0, window: false })
    assert.deepEqual(panels.get('0,1'), { axis: 'y', half: 1, window: false })
    assert.equal(panels.has('0,2'), false)
  })

  it('natural walls and gaps break runs', () => {
    assert.equal(getWallPanels(mapOf(['rrrr'])).size, 0)
    assert.equal(getWallPanels(mapOf(['#.#'])).size, 0)
    assert.equal(getWallPanels(mapOf(['#r#'])).size, 0)
  })

  it('fades both halves of a panel when either half fades', () => {
    const panels = getWallPanels(mapOf(['#####']))
    assert.deepEqual([...fadeWholePanels(new Set(['1,0']), panels)].sort(), ['0,0', '1,0'])
    assert.deepEqual([...fadeWholePanels(new Set(['2,0']), panels)].sort(), ['2,0', '3,0'])
    assert.deepEqual([...fadeWholePanels(new Set(['4,0']), panels)], ['4,0'])
  })
})

describe('tall and big objects', () => {
  it('a 2x2 square of a big object becomes one object; leftovers and non-big objects stay single', () => {
    const groups = getBigObjects(mapOf(['ooo.', 'ooo.', 'cc..', 'cc..']))
    for (const key of ['0,0', '1,0', '0,1', '1,1']) assert.deepEqual(groups.get(key), { x: 0, y: 0 })
    assert.equal(groups.has('2,0'), false)
    assert.equal(groups.has('0,2'), false)
    assert.equal(groups.size, 4)
  })

  it('a big object fades as one when someone stands behind it', () => {
    const bigMap = mapOf(['.....', '.....', '..tt.', '..tt.', '.....'])
    const groups = getBigObjects(bigMap)
    const hidden = fadedBlockKeys(bigMap, [{ x: 1, y: 1 }], groups)
    assert.ok(hidden.size > 0)
    assert.deepEqual([...fadeWholeBigObjects(hidden, groups)].sort(), ['2,2', '2,3', '3,2', '3,3'])
    assert.equal(fadedBlockKeys(bigMap, [{ x: 4, y: 4 }], groups).size, 0)
  })

  it('objects 32 high or lower never fade', () => {
    const boulders = mapOf(['.....', '.....', '..oo.', '..oo.', '.....'])
    assert.equal(fadedBlockKeys(boulders, [{ x: 1, y: 1 }], getBigObjects(boulders)).size, 0)
  })
})
