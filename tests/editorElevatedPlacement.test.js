// Map editor on raised surfaces: where a pointer means an item to go, which item a click picks, and how high it is drawn.
// Regression for the editor using the floor under the pointer (it rejected or misplaced drops on crate and table tops).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { project } from '../src/maps/iso.js'
import { makeAlphaMask } from '../src/maps/propPick.js'
import { createBlankMap, getTile } from '../src/maps/mapFormat.js'
import {
  groundItemAtBoard,
  groundItemElevation,
  groundItemTargetAt,
  paintTile,
  placeGroundItem,
  placementPlaneZ,
  selectionCandidates,
} from '../src/maps/mapEdits.js'

const blank = () => createBlankMap({ name: 'Test', width: 8, height: 8 })
const crateAt = (map, x, y) => paintTile(map, { x, y }, 'crate')
const CRATE_TOP = getTile('crate').height
const maskOf = () => makeAlphaMask(1, 1, new Uint8Array([0, 0, 0, 255]))

// A board point on a crate's raised top, `up` px above its centre (negative = toward the front of the top).
const onTop = (tile, up = 0) => {
  const centre = project(tile)
  return { x: centre.x, y: centre.y - CRATE_TOP - up }
}

describe('groundItemTargetAt (editor pointer → drop cell)', () => {
  for (const cellPx of [64, 2]) {
    for (const [label, up] of [['centre', 0], ['front', -12], ['back', 12]]) {
      it(`${label} of a crate top lands on the crate at a ${cellPx}px grid`, () => {
        const map = crateAt(blank(), 3, 3)
        const position = groundItemTargetAt(map, onTop({ x: 3, y: 3 }, up), { cellPx })
        const placed = placeGroundItem(map, position, 'medkit', cellPx)
        assert.ok(placed, `${label} of the top was rejected`)
        assert.deepEqual(placed.object.on, { tile: [3, 3] })
      })
    }
  }

  it('still accepts the back of a crate that stands against a wall', () => {
    const map = crateAt(blank(), 1, 1)
    const position = groundItemTargetAt(map, onTop({ x: 1, y: 1 }, 12), { cellPx: 2 })
    const placed = placeGroundItem(map, position, 'medkit', 2)
    assert.ok(placed)
    assert.deepEqual(placed.object.on, { tile: [1, 1] })
  })

  it('snaps a box to the cell under the pointer and stacks a second drop on that cell', () => {
    const map = crateAt(blank(), 3, 3)
    const first = placeGroundItem(map, { x: 2.75, y: 2.75 }, 'medkit', 64)
    assert.ok(first)
    assert.deepEqual(first.object.position, { x: 3, y: 3 })
    const beside = placeGroundItem(first.map, { x: 3.25, y: 2.75 }, 'medkit', 64)
    assert.ok(beside)
    assert.deepEqual(beside.object.on, { tile: [3, 3] })
    assert.deepEqual(beside.object.position, { x: 3.5, y: 3 })
    const stacked = placeGroundItem(beside.map, { x: 2.75, y: 2.75 }, 'medkit', 64)
    assert.ok(stacked)
    assert.equal(stacked.object.on.placement, first.object.id)
    assert.deepEqual(stacked.object.position, { x: 3, y: 3 })
  })

  it('falls back to the floor under the pointer where there is no surface', () => {
    const map = blank()
    const position = groundItemTargetAt(map, project({ x: 4, y: 4 }), { cellPx: 2 })
    assert.deepEqual(position, { x: 4, y: 4 })
    const placed = placeGroundItem(map, position, 'medkit', 2)
    assert.ok(placed)
    assert.equal(placed.object.on, undefined)
  })

  it('fills the tile under the cursor and stacks the next drop', () => {
    const tile = { x: 3, y: 3 }
    let map = crateAt(blank(), tile.x, tile.y)
    const aim = { x: 3.1, y: 3.1 }
    const screen = project(aim)
    const position = groundItemTargetAt(map, { x: screen.x, y: screen.y - CRATE_TOP }, { cellPx: 64 })
    const step = placeGroundItem(map, position, 'stackBoxRed', 64)
    assert.ok(step)
    assert.deepEqual(step.object.on, { tile: [tile.x, tile.y] })
    assert.deepEqual(step.object.position, { x: 3.5, y: 3.5 })
    const stackedAt = groundItemTargetAt(step.map, { x: screen.x, y: screen.y - CRATE_TOP }, { cellPx: 64 })
    const stacked = placeGroundItem(step.map, stackedAt, 'stackBoxRed', 64)
    assert.equal(stacked.object.on.placement, step.object.id)
    assert.deepEqual(stacked.object.position, { x: 3.5, y: 3.5 })
  })

  it('puts a second box in the other cell of the tile, and stacks only on a full cell', () => {
    const tile = { x: 4, y: 4 }
    let map = crateAt(blank(), tile.x, tile.y)
    const onCrate = (aim) => {
      const screen = project(aim)
      return groundItemTargetAt(map, { x: screen.x, y: screen.y - CRATE_TOP })
    }
    const front = placeGroundItem(map, onCrate({ x: 4.25, y: 4.25 }), 'stackBoxRed')
    assert.deepEqual(front.object.position, { x: 4.5, y: 4.5 })
    assert.deepEqual(front.object.on, { tile: [4, 4] })
    map = front.map
    const behind = placeGroundItem(map, onCrate({ x: 3.75, y: 3.75 }), 'stackBoxRed')
    assert.ok(behind)
    assert.deepEqual(behind.object.on, { tile: [4, 4] })
    assert.deepEqual(behind.object.position, { x: 4, y: 4 })
    const stacked = placeGroundItem(behind.map, onCrate({ x: 4.25, y: 4.25 }), 'stackBoxRed')
    assert.equal(stacked.object.on.placement, front.object.id)
    assert.deepEqual(stacked.object.position, { x: 4.5, y: 4.5 })
  })
})

describe('groundItemAtBoard and selectionCandidates', () => {
  const withMedkitOnCrate = () => {
    const map = crateAt(blank(), 3, 3)
    return placeGroundItem(map, { x: 3, y: 3 }, 'medkit', 2).map
  }

  it('picks an item where it is drawn on the crate, not by its floor cell', () => {
    const map = withMedkitOnCrate()
    const item = map.groundItemPlacements[0]
    assert.equal(groundItemAtBoard(map, onTop({ x: 3, y: 3 }, 6), { maskOf })?.id, item.id)
    assert.equal(groundItemAtBoard(map, project({ x: 6, y: 6 }), { maskOf }), null)
  })

  it('selectionCandidates offers an item on a table from a click whose floor tile is elsewhere', () => {
    const map = withMedkitOnCrate()
    const item = map.groundItemPlacements[0]
    // The floor under the click is two tiles away from the crate; only the board point finds the item.
    const candidates = selectionCandidates(map, [], { x: 2, y: 2 }, { cellPx: 2, boardPoint: onTop({ x: 3, y: 3 }, 6), maskOf })
    assert.equal(candidates.find((candidate) => candidate.kind === 'groundItem')?.groundItem.id, item.id)
    const without = selectionCandidates(map, [], { x: 2, y: 2 }, { cellPx: 2 })
    assert.ok(!without.some((candidate) => candidate.kind === 'groundItem'))
  })
})

describe('groundItemElevation (how high the editor draws a placement)', () => {
  it('lifts an item on a crate by the crate top', () => {
    const map = crateAt(blank(), 3, 3)
    const entry = { id: 'a', itemId: 'medkit', position: { x: 3, y: 3 }, on: { tile: [3, 3] } }
    assert.equal(groundItemElevation(map, entry).z, CRATE_TOP)
  })

  it('lifts an item resting on another item by both tops', () => {
    const caseEntry = { id: 'case1', itemId: 'equipmentCase', position: { x: 3, y: 3 }, on: { tile: [3, 3] } }
    const topEntry = { id: 'top1', itemId: 'phaserType2', position: { x: 3, y: 3 }, on: { placement: 'case1' } }
    const map = { ...crateAt(blank(), 3, 3), groundItemPlacements: [caseEntry, topEntry] }
    const caseZ = groundItemElevation(map, caseEntry).z
    const topZ = groundItemElevation(map, topEntry).z
    assert.equal(caseZ, CRATE_TOP)
    assert.ok(topZ > caseZ, 'an item on the case sits above the case, not at floor height')
  })

  it('draws a floor item at height 0 and an unauthored item on a surface lifted', () => {
    const map = crateAt(blank(), 3, 3)
    assert.equal(groundItemElevation(map, { id: 'f', position: { x: 5, y: 5 } }).z, 0)
    assert.equal(groundItemElevation(map, { id: 'u', position: { x: 3, y: 3 } }).z, CRATE_TOP)
  })
})

describe('placementPlaneZ (guide grid height while placing an item)', () => {
  it('stays on the floor away from a surface and rises to the crate top on that tile', () => {
    const map = crateAt(blank(), 3, 3)
    assert.equal(placementPlaneZ(map, { x: 5, y: 5 }, 'medkit'), 0)
    assert.equal(placementPlaneZ(map, { x: 3, y: 3 }, 'medkit'), CRATE_TOP)
  })

  it('rises to an item top, and a drag of that item keeps the plane on the crate', () => {
    const map = crateAt(blank(), 3, 3)
    const placed = placeGroundItem(map, { x: 3, y: 3 }, 'medkit', 2)
    assert.ok(placed)
    const onItem = placementPlaneZ(placed.map, placed.object.position, 'hypospray')
    assert.ok(onItem > CRATE_TOP)
    assert.equal(placementPlaneZ(placed.map, placed.object.position, 'medkit', { excludeId: placed.object.id }), CRATE_TOP)
  })
})
