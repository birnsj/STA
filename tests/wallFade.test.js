// Tall walls and see-through blocks (maps/wallFade.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { drawnHeight, fadedBlockKeys } from '../src/maps/wallFade.js'
import { getTile } from '../src/maps/mapFormat.js'
import { fadeWholePanels, getWallPanels } from '../src/maps/wallPanels.js'
import { fadeWholeBigObjects, getBigObjects } from '../src/maps/bigObjects.js'

// A 5 x 5 deck with one bulkhead (a fading wall) and one crate (a block that doesn't fade) in the middle row.
const map = {
  width: 5,
  height: 5,
  tiles: Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => (y === 2 && x === 2 ? 'bulkhead' : y === 2 && x === 3 ? 'crate' : 'floor'))),
}

describe('wall fading', () => {
  it('walls are drawn twice as tall when tall walls are on', () => {
    const wall = getTile('bulkhead')
    assert.equal(drawnHeight(wall, true), wall.height * 2)
    assert.equal(drawnHeight(wall, false), wall.height)
    assert.equal(drawnHeight(getTile('crate'), true), getTile('crate').height)
  })

  it('a wall fades when a party member stands right behind it', () => {
    assert.deepEqual([...fadedBlockKeys(map, [{ x: 1, y: 1 }], true)], ['2,2'])
  })

  it('a wall does not fade for someone in front of it or off to the side', () => {
    assert.equal(fadedBlockKeys(map, [{ x: 3, y: 3 }], true).size, 0)
    assert.equal(fadedBlockKeys(map, [{ x: 4, y: 0 }], true).size, 0)
  })

  it('blocks without Fade never fade', () => {
    assert.equal(fadedBlockKeys(map, [{ x: 2, y: 1 }], true).has('3,2'), false)
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
  it('tall objects are drawn twice as tall like walls', () => {
    const tree = getTile('tree')
    assert.equal(drawnHeight(tree, true), tree.height * 2)
    assert.equal(drawnHeight(tree, false), tree.height)
  })

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
    const hidden = fadedBlockKeys(bigMap, [{ x: 1, y: 1 }], true, groups)
    assert.ok(hidden.size > 0)
    assert.deepEqual([...fadeWholeBigObjects(hidden, groups)].sort(), ['2,2', '2,3', '3,2', '3,3'])
    assert.equal(fadedBlockKeys(bigMap, [{ x: 4, y: 4 }], true, groups).size, 0)
  })

  it('objects 32 high or lower never fade', () => {
    const boulders = mapOf(['.....', '.....', '..oo.', '..oo.', '.....'])
    assert.equal(fadedBlockKeys(boulders, [{ x: 1, y: 1 }], true, getBigObjects(boulders)).size, 0)
  })
})
