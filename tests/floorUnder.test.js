// Sparse floorUnder memory: walls/props remember the floor they replaced; erase restores it.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap, createNullMap, NULL_TILE, resizeMap, serializeMap, parseMapFile } from '../src/maps/mapFormat.js'
import { canEraseFloor, eraseStructure, paintFloor, paintTile } from '../src/maps/mapEdits.js'
import { placeNpc } from '../src/maps/mapEdits.js'

describe('floorUnder', () => {
  it('records the floor when a wall is painted and restores it on erase', () => {
    let map = createBlankMap({ width: 6, height: 6 })
    map = paintTile(map, { x: 2, y: 2 }, 'floor')
    map = paintTile(map, { x: 2, y: 2 }, 'bulkhead')
    assert.equal(map.tiles[2][2], 'bulkhead')
    assert.equal(map.floorUnder['2,2'], 'floor')
    const erased = eraseStructure(map, { x: 2, y: 2 })
    assert.equal(erased.map.tiles[2][2], 'floor')
    assert.equal(erased.map.floorUnder['2,2'], undefined)
  })

  it('records Null when a wall is painted on an empty cell', () => {
    let map = createNullMap({ width: 4, height: 4 })
    map = paintTile(map, { x: 1, y: 1 }, 'bulkhead')
    assert.equal(map.floorUnder['1,1'], NULL_TILE)
    const erased = eraseStructure(map, { x: 1, y: 1 })
    assert.equal(erased.map.tiles[1][1], NULL_TILE)
  })

  it('blocks erasing a floor under an NPC', () => {
    let map = createBlankMap({ width: 6, height: 6 })
    const placed = placeNpc(map, { x: 2, y: 2 }, 'redshirt')
    map = placed.map
    const check = canEraseFloor(map, { x: 2, y: 2 })
    assert.equal(check.ok, false)
    const result = paintFloor(map, { x: 2, y: 2 }, NULL_TILE)
    assert.ok(result.error)
  })

  it('allows erasing floor memory under a wall (wall may stand on Null)', () => {
    let map = createBlankMap({ width: 6, height: 6 })
    map = paintTile(map, { x: 2, y: 2 }, 'bulkhead')
    const result = paintFloor(map, { x: 2, y: 2 }, NULL_TILE)
    assert.ok(!result.error)
    assert.equal(result.map.floorUnder['2,2'], NULL_TILE)
    assert.equal(result.map.tiles[2][2], 'bulkhead')
  })

  it('clips floorUnder keys on resize', () => {
    let map = createBlankMap({ width: 8, height: 8 })
    // Interior cell (perimeter is already wall and would not record floorUnder).
    map = paintTile(map, { x: 5, y: 5 }, 'bulkhead')
    assert.ok(map.floorUnder['5,5'])
    const shrunk = resizeMap(map, 4, 4)
    assert.equal(shrunk.floorUnder['5,5'], undefined)
  })

  it('round-trips floorUnder in schema 2', () => {
    let map = createBlankMap({ width: 4, height: 4 })
    map = paintTile(map, { x: 1, y: 1 }, 'bulkhead')
    const file = serializeMap(map)
    assert.equal(file.schemaVersion, 2)
    assert.equal(file.floorUnder['1,1'], 'floor')
    const back = parseMapFile(file, 't')
    assert.equal(back.floorUnder['1,1'], 'floor')
  })
})
