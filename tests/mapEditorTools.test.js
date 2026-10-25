// The map editor's selection and Move-tool helpers (maps/mapEdits.js selectionAt, swapTilesWithObjects).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap, parseMapFile, serializeMap } from '../src/maps/mapFormat.js'
import {
  eraseMarkers,
  moveGroundItem,
  paintTile,
  placeGroundItem,
  placeNpc,
  removeGroundItem,
  resizeMap,
  setAreaLabel,
  stackTileOn,
  swapTilesWithObjects,
  selectionAt,
  toggleMarker,
  updateGroundItem,
} from '../src/maps/mapEdits.js'

const blank = () => createBlankMap({ name: 'Test', width: 6, height: 6 })
const object = (id, x, y) => ({ id, position: [x, y] })

describe('swapTilesWithObjects', () => {
  it('swaps the tiles and leaves placements alone when no object stands on either', () => {
    const map = paintTile(blank(), { x: 1, y: 1 }, 'crate')
    const swapped = swapTilesWithObjects(map, { x: 1, y: 1 }, { x: 2, y: 1 }, [object('a', 4, 4)])
    assert.equal(swapped.map.tiles[1][2], 'crate')
    assert.deepEqual(swapped.carried, [])
    assert.deepEqual(swapped.map.objectPlacements ?? {}, {})
  })

  it('an object goes with its tile, and both directions are recorded', () => {
    const swapped = swapTilesWithObjects(blank(), { x: 1, y: 1 }, { x: 2, y: 1 }, [object('a', 1, 1), object('b', 2, 1)])
    assert.deepEqual(swapped.carried, [['a', { x: 2, y: 1 }], ['b', { x: 1, y: 1 }]])
    assert.deepEqual(swapped.map.objectPlacements, { a: { x: 2, y: 1 }, b: { x: 1, y: 1 } })
  })

  it('keeps earlier placements of other objects', () => {
    const map = { ...blank(), objectPlacements: { other: { x: 5, y: 5 } } }
    const swapped = swapTilesWithObjects(map, { x: 0, y: 0 }, { x: 1, y: 0 }, [object('a', 0, 0)])
    assert.deepEqual(swapped.map.objectPlacements, { other: { x: 5, y: 5 }, a: { x: 1, y: 0 } })
  })

  it('moves the complete tile structure and its supported item subtree', () => {
    let map = paintTile(blank(), { x: 1, y: 1 }, 'crate', true)
    map = stackTileOn(map, { x: 1, y: 1 }, 'crate')
    map = {
      ...map,
      groundItemPlacements: [
        { id: 'parent', itemId: 'medkit', position: { x: 1.25, y: 1.25 }, on: { tile: [1, 1] } },
        { id: 'child', itemId: 'hypospray', position: { x: 1.25, y: 1.25 }, on: { placement: 'parent' } },
      ],
    }
    const moved = swapTilesWithObjects(map, { x: 1, y: 1 }, { x: 3, y: 2 }, [])
    assert.equal(moved.error, undefined)
    assert.equal(moved.map.tiles[2][3], 'crate')
    assert.deepEqual(moved.map.stackOver['3,2'], ['crate'])
    assert.equal(moved.map.stackOver['1,1'], undefined)
    assert.equal(moved.map.floorUnder['3,2'], 'floor')
    assert.equal(moved.map.floorUnder['1,1'], undefined)
    assert.deepEqual(moved.map.groundItemPlacements[0], {
      id: 'parent',
      itemId: 'medkit',
      position: { x: 3.25, y: 2.25 },
      on: { tile: [3, 2] },
    })
    assert.deepEqual(moved.map.groundItemPlacements[1].position, { x: 3.25, y: 2.25 })
    assert.deepEqual(moved.map.groundItemPlacements[1].on, { placement: 'parent' })
  })

  it('moves a ground-item support together with all descendants', () => {
    const placed = placeGroundItem(blank(), { x: 1.2, y: 1.2 }, 'medkit')
    const parent = placed.object
    const map = {
      ...placed.map,
      groundItemPlacements: [
        parent,
        { id: 'child', itemId: 'hypospray', position: { ...parent.position }, on: { placement: parent.id } },
        { id: 'grandchild', itemId: 'autosuture', position: { ...parent.position }, on: { placement: 'child' } },
      ],
    }
    const moved = moveGroundItem(map, parent.id, { x: 3.2, y: 2.2 })
    const nextParent = moved.groundItemPlacements.find((entry) => entry.id === parent.id)
    const child = moved.groundItemPlacements.find((entry) => entry.id === 'child')
    const grandchild = moved.groundItemPlacements.find((entry) => entry.id === 'grandchild')
    const dx = nextParent.position.x - parent.position.x
    const dy = nextParent.position.y - parent.position.y
    assert.deepEqual(child.position, { x: parent.position.x + dx, y: parent.position.y + dy })
    assert.deepEqual(grandchild.position, child.position)
    assert.deepEqual(child.on, { placement: parent.id })
    assert.deepEqual(grandchild.on, { placement: 'child' })
  })

  it('rejects an invalid parent destination without partially moving its descendants', () => {
    const placed = placeGroundItem(blank(), { x: 1.2, y: 1.2 }, 'medkit')
    const map = {
      ...placed.map,
      groundItemPlacements: [
        placed.object,
        { id: 'child', itemId: 'hypospray', position: { ...placed.object.position }, on: { placement: placed.object.id } },
      ],
    }
    assert.equal(moveGroundItem(map, placed.object.id, { x: -2, y: -2 }), map)
    assert.deepEqual(map.groundItemPlacements[1].on, { placement: placed.object.id })
  })

  it('keeps the generic ground-item update API on the same subtree movement authority', () => {
    const map = {
      ...blank(),
      groundItemPlacements: [
        { id: 'parent', itemId: 'medkit', position: { x: 1.25, y: 1.25 } },
        { id: 'child', itemId: 'hypospray', position: { x: 1.25, y: 1.25 }, on: { placement: 'parent' } },
      ],
    }
    const moved = updateGroundItem(map, 'parent', { position: { x: 3.25, y: 2.25 } })
    assert.deepEqual(moved.groundItemPlacements[1].position, moved.groundItemPlacements[0].position)
    assert.deepEqual(moved.groundItemPlacements[1].on, { placement: 'parent' })
  })

  it('settles a child without allowing it to rest on its own descendant when a parent is removed', () => {
    const map = {
      ...blank(),
      groundItemPlacements: [
        { id: 'parent', itemId: 'medkit', position: { x: 2.25, y: 2.25 } },
        { id: 'child', itemId: 'hypospray', position: { x: 2.25, y: 2.25 }, on: { placement: 'parent' } },
        { id: 'grandchild', itemId: 'autosuture', position: { x: 2.25, y: 2.25 }, on: { placement: 'child' } },
      ],
    }
    const removed = removeGroundItem(map, 'parent')
    assert.deepEqual(removed.groundItemPlacements.map((entry) => entry.id), ['child', 'grandchild'])
    assert.equal(removed.groundItemPlacements[0].on, undefined)
    assert.deepEqual(removed.groundItemPlacements[1].on, { placement: 'child' })
  })
})

describe('resizeMap support integrity', () => {
  it('settles a surviving child and preserves its nested descendants when the parent is clipped', () => {
    const map = {
      ...blank(),
      groundItemPlacements: [
        { id: 'parent', itemId: 'medkit', position: { x: 5.25, y: 2.25 } },
        { id: 'child', itemId: 'hypospray', position: { x: 4.25, y: 2.25 }, on: { placement: 'parent' } },
        { id: 'grandchild', itemId: 'autosuture', position: { x: 4.25, y: 2.25 }, on: { placement: 'child' } },
      ],
    }
    const resized = resizeMap(map, 5, 6)
    assert.deepEqual(resized.groundItemPlacements.map((entry) => entry.id), ['child', 'grandchild'])
    assert.equal(resized.groundItemPlacements[0].on, undefined)
    assert.deepEqual(resized.groundItemPlacements[0].position, { x: 4.25, y: 2.25 })
    assert.deepEqual(resized.groundItemPlacements[1].on, { placement: 'child' })
  })

  it('settles an item whose tile support is clipped but its position remains in bounds', () => {
    const map = {
      ...blank(),
      groundItemPlacements: [
        { id: 'item', itemId: 'hypospray', position: { x: 4.25, y: 2.25 }, on: { tile: [5, 2] } },
      ],
    }
    const [item] = resizeMap(map, 5, 6).groundItemPlacements
    assert.equal(item.on, undefined)
    assert.deepEqual(item.position, { x: 4.25, y: 2.25 })
  })

  it('preserves complete in-bounds stacks through resize and save/load', () => {
    const map = {
      ...blank(),
      groundItemPlacements: [
        { id: 'parent', itemId: 'medkit', position: { x: 3.25, y: 2.25 } },
        { id: 'child', itemId: 'hypospray', position: { x: 3.25, y: 2.25 }, on: { placement: 'parent' } },
      ],
    }
    const resized = resizeMap(map, 5, 5)
    assert.deepEqual(resized.groundItemPlacements, map.groundItemPlacements)
    const loaded = parseMapFile(JSON.parse(JSON.stringify(serializeMap(resized))), 'Resized')
    assert.deepEqual(loaded.groundItemPlacements, resized.groundItemPlacements)
  })
})

describe('stack painting', () => {
  it('does not replace the base or erase the tower when the stack is full', () => {
    let map = paintTile(blank(), { x: 2, y: 2 }, 'crate')
    map = stackTileOn(map, { x: 2, y: 2 }, 'crate')
    map = stackTileOn(map, { x: 2, y: 2 }, 'crate')
    map = stackTileOn(map, { x: 2, y: 2 }, 'crate')
    const painted = paintTile(map, { x: 2, y: 2 }, 'machinery')
    assert.equal(painted, map)
    assert.equal(painted.tiles[2][2], 'crate')
    assert.deepEqual(painted.stackOver['2,2'], ['crate', 'crate', 'crate'])
  })

  it('refuses a solid paint instead of deleting existing occupants', () => {
    let map = toggleMarker(blank(), 'playerStarts', { x: 2, y: 2 })
    map = placeNpc(map, { x: 2, y: 2 }, 'redshirt').map
    const painted = paintTile(map, { x: 2, y: 2 }, 'bulkhead')
    assert.equal(painted, map)
    assert.equal(painted.npcs.length, 1)
    assert.equal(painted.markers.playerStarts.length, 1)
  })
})

describe('selectionAt', () => {
  it('finds a player start, an enemy spawn and an object by tile', () => {
    let map = toggleMarker(blank(), 'playerStarts', { x: 1, y: 1 })
    map = toggleMarker(map, 'enemySpawns', { x: 3, y: 3 })
    const objects = [object('a', 5, 5)]
    assert.equal(selectionAt(map, objects, { x: 1, y: 1 }).markerKind, 'playerStarts')
    assert.equal(selectionAt(map, objects, { x: 3, y: 3 }).markerKind, 'enemySpawns')
    assert.equal(selectionAt(map, objects, { x: 5, y: 5 }).object.id, 'a')
  })

  it('an empty tile selects nothing', () => {
    assert.deepEqual(selectionAt(blank(), [], { x: 2, y: 2 }), { npc: null, markerKind: null, object: null })
  })
})

describe('layer-aware marker erase', () => {
  const crowded = () => {
    let map = toggleMarker(blank(), 'playerStarts', { x: 2, y: 2 })
    map = placeNpc(map, { x: 2, y: 2 }, 'redshirt').map
    return setAreaLabel(map, { x: 2, y: 2 }, 'Bridge')
  }

  it('leaves character-layer records when only markers are editable', () => {
    const map = eraseMarkers(crowded(), { x: 2, y: 2 }, { characters: false, markers: true })
    assert.equal(map.npcs.length, 1)
    assert.equal(map.markers.playerStarts.length, 1)
    assert.equal(map.areas.length, 0)
  })

  it('leaves marker-layer records when only characters are editable', () => {
    const map = eraseMarkers(crowded(), { x: 2, y: 2 }, { characters: true, markers: false })
    assert.equal(map.npcs.length, 0)
    assert.equal(map.markers.playerStarts.length, 0)
    assert.equal(map.areas.length, 1)
  })
})
