// The map editor's selection and Move-tool helpers (maps/mapEdits.js selectionAt, swapTilesWithObjects).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { paintTile, swapTilesWithObjects, selectionAt, toggleMarker } from '../src/maps/mapEdits.js'

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
