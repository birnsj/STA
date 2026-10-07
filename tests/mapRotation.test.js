// Rotated tiles and the long-wall brush (maps/mapEdits.js, maps/mapFormat.js rotated, maps/wallPanels.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap, isRotated, parseMapFile, resizeMap, serializeMap } from '../src/maps/mapFormat.js'
import { brushPositions, paintBrush } from '../src/maps/mapEdits.js'
import { getWallPanels } from '../src/maps/wallPanels.js'

const blank = () => createBlankMap({ name: 'Test', width: 6, height: 6 })

describe('long-wall brush', () => {
  it('a wall with panels lays two tiles, along x or along y when rotated', () => {
    assert.deepEqual(brushPositions(blank(), { x: 2, y: 2 }, 'bulkhead', false), [{ x: 2, y: 2 }, { x: 3, y: 2 }])
    assert.deepEqual(brushPositions(blank(), { x: 2, y: 2 }, 'bulkhead', true), [{ x: 2, y: 2 }, { x: 2, y: 3 }])
  })

  it('other tiles and the map edge leave one tile', () => {
    assert.deepEqual(brushPositions(blank(), { x: 2, y: 2 }, 'crate', false), [{ x: 2, y: 2 }])
    assert.deepEqual(brushPositions(blank(), { x: 5, y: 2 }, 'bulkhead', false), [{ x: 5, y: 2 }])
  })

  it('a rotated long wall pairs into one panel along y', () => {
    const map = paintBrush(blank(), { x: 2, y: 2 }, 'bulkhead', true)
    const panels = getWallPanels(map)
    assert.equal(panels.get('2,2').axis, 'y')
    assert.equal(panels.get('2,3').axis, 'y')
  })

  it('an unrotated long wall pairs along x', () => {
    const map = paintBrush(blank(), { x: 2, y: 2 }, 'bulkhead', false)
    assert.equal(getWallPanels(map).get('2,2').axis, 'x')
  })
})

describe('rotation in map files', () => {
  it('survives saving, loading and resizing', () => {
    const map = paintBrush(blank(), { x: 2, y: 2 }, 'crate', true)
    const file = serializeMap(map)
    assert.deepEqual(file.rotated, [[2, 2]])
    const loaded = parseMapFile(file, 'Test')
    assert.equal(isRotated(loaded, { x: 2, y: 2 }), true)
    assert.equal(isRotated(loaded, { x: 3, y: 2 }), false)
    assert.equal(isRotated(resizeMap(loaded, 4, 4), { x: 2, y: 2 }), true)
  })

  it('maps saved before rotation load with nothing rotated', () => {
    const file = { ...serializeMap(blank()) }
    delete file.rotated
    assert.equal(parseMapFile(file, 'Test').rotated.flat().some(Boolean), false)
  })

  it('painting a tile unrotated clears its rotation', () => {
    const map = paintBrush(paintBrush(blank(), { x: 2, y: 2 }, 'crate', true), { x: 2, y: 2 }, 'floor', false)
    assert.equal(isRotated(map, { x: 2, y: 2 }), false)
  })
})
