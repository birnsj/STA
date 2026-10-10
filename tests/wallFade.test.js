// Tall walls and see-through blocks (maps/wallFade.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { analyseWalls, fadedBlockKeys, wallFadeStep } from '../src/maps/wallFade.js'
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
// fade), 't' tree (big, fades), 'c' crate (not big), 'd' doorway, '.' floor.
const symbols = { '#': 'bulkhead', r: 'rockWall', o: 'rock', t: 'tree', c: 'crate', d: 'doorway', '.': 'floor' }
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

describe('walls that fade together (Prototype: room cutaway, sections, stickiness)', () => {
  // A room (10 x 8 floor) inside an open yard, its doorway ('d') in the south wall.
  const yard = mapOf([
    '..................',
    '.############.....',
    ...Array.from({ length: 8 }, () => '.#..........#.....'),
    '.#####d######.....',
    '..................',
  ])

  it('splits the floor into spaces: the walled room is a room, the yard touching the edge is open', () => {
    const { spaceAt, spaces } = analyseWalls(yard)
    const room = spaceAt[3 * yard.width + 3]
    assert.equal(spaces[room].kind, 'room')
    assert.equal(spaces[spaceAt[0]].kind, 'open')
    assert.equal(spaceAt[10 * yard.width + 6], -1, 'the doorway belongs to no space')
  })

  it('a room side is solid again once every figure is 4 tiles out from it', () => {
    assert.ok(wallFadeStep(yard, [{ id: 'a', position: { x: 5, y: 6.1 } }]).keys.has('5,10'), '3.9 tiles: faded')
    assert.equal(wallFadeStep(yard, [{ id: 'a', position: { x: 5, y: 6 } }]).keys.has('5,10'), false, '4 tiles: solid')
  })

  it("a room side fades whole when a figure is near it, straight out from the wall", () => {
    const corner = wallFadeStep(yard, [{ id: 'a', position: { x: 11, y: 9 } }]).keys
    for (const key of ['12,1', '12,5', '12,10', '7,10', '1,10']) assert.ok(corner.has(key), key)
    assert.equal(wallFadeStep(yard, [{ id: 'a', position: { x: 5, y: 4 } }]).keys.size, 0, 'no side within 2 tiles')
    const south = wallFadeStep(yard, [{ id: 'a', position: { x: 3, y: 8 } }]).keys
    for (const key of ['1,10', '5,10', '7,10', '12,10']) assert.ok(south.has(key), `${key}: the whole south side, past the doorway`)
    assert.equal(south.has('12,4'), false, 'the east side is 9 tiles away')
    assert.equal(south.has('1,8'), false, 'the west wall is behind the room')
    assert.equal(south.has('3,1'), false, 'the north wall is behind the room')
  })

  it("corners fade with the room's sides: the main corner with either side, a far post never with a back wall", () => {
    const east = wallFadeStep(yard, [{ id: 'a', position: { x: 11, y: 3 } }]).keys
    assert.ok(east.has('12,1') && east.has('12,10'), 'both ends of the east side')
    assert.equal(east.has('11,1') || east.has('7,1'), false, 'the north wall behind stays solid')
    assert.equal(east.has('9,10'), false, 'the south side is out of range')
  })

  it('in the doorway a figure keeps the room it came from', () => {
    const inside = wallFadeStep(yard, [{ id: 'a', position: { x: 6, y: 9 } }])
    const doorway = wallFadeStep(yard, [{ id: 'a', position: { x: 6, y: 10 } }], null, inside)
    assert.ok(doorway.keys.has('4,10'))
    assert.equal(wallFadeStep(yard, [{ id: 'a', position: { x: 6, y: 10 } }]).keys.has('4,10'), false)
  })

  it('a faded section comes back once every figure is more than 2 tiles from it', () => {
    const near = wallFadeStep(yard, [{ id: 'a', position: { x: 11, y: 4 } }])
    assert.ok(near.keys.has('12,2'))
    assert.equal(wallFadeStep(yard, [{ id: 'a', position: { x: 7, y: 4 } }], null, near).keys.has('12,2'), false)
    const pair = wallFadeStep(yard, [{ id: 'a', position: { x: 7, y: 4 } }, { id: 'b', position: { x: 10, y: 4 } }], null, near)
    assert.ok(pair.keys.has('12,2'), 'one figure still near keeps it')
  })

  it('a narrow passage is a corridor, and a hiding wall fades with its section', () => {
    const corridor = mapOf(['##########', '#........#', '#........#', '##########'])
    const { spaceAt, spaces } = analyseWalls(corridor)
    assert.equal(spaces[spaceAt[1 * corridor.width + 1]].kind, 'corridor')
    const { sectionOf } = analyseWalls(mapOf(['##########']))
    assert.equal(sectionOf.get('0,0').length, 6)
    assert.equal(sectionOf.get('9,0').length, 4)
  })

  it('a faded block stays faded until the figure is clear of it by the margin', () => {
    const wall = { width: 5, height: 5, tiles: map.tiles }
    const behind = wallFadeStep(wall, [{ id: 'a', position: { x: 1, y: 1 } }])
    assert.ok(behind.keys.has('2,2'))
    // Sidestepping at the same depth, just past where the wall stops hiding the figure: faded only with the memory.
    let edge = null
    for (let t = 0; t <= 1.5 && !edge; t += 0.02) {
      const point = { x: 1 + t, y: 1 - t }
      const fresh = wallFadeStep(wall, [{ id: 'a', position: point }]).keys.has('2,2')
      const sticky = wallFadeStep(wall, [{ id: 'a', position: point }], null, behind).keys.has('2,2')
      if (!fresh && sticky) edge = point
    }
    assert.ok(edge, 'a strip just outside the wall stays faded with memory')
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
