import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap, mapPlayErrors, parseMapFile, serializeMap, validateMap } from '../src/maps/mapFormat.js'

const file = (overrides = {}) => ({ name: 'Test', rows: ['####', '#..#', '#..#', '####'], ...overrides })

describe('map format structural diagnostics', () => {
  it('accepts legacy and supported schemas, and rejects unsupported versions', () => {
    assert.equal(parseMapFile(file(), 'Legacy').width, 4)
    assert.equal(parseMapFile(file({ schemaVersion: 1 }), 'One').width, 4)
    assert.equal(parseMapFile(file({ schemaVersion: 2 }), 'Two').width, 4)
    assert.throws(() => parseMapFile(file({ schemaVersion: 3 }), 'Future'), /schemaVersion.*unsupported version 3/)
  })

  it('rejects malformed position tuples and unknown tile symbols or ids', () => {
    assert.throws(() => parseMapFile(file({ areas: [{ name: 'Bad', position: [1] }] }), 'Bad'), /areas\[0\]\.position/)
    assert.throws(() => parseMapFile(file({ rows: ['#☃'] }), 'Bad'), /unknown tile symbol/)
    assert.throws(() => parseMapFile(file({ floorUnder: { '1,1': 'missingTile' } }), 'Bad'), /unknown tile id “missingTile”/)
    const map = createBlankMap({ width: 4, height: 4 })
    map.tiles[1][1] = 'missingTile'
    assert.throws(() => serializeMap(map), /unknown tile id “missingTile”/)
    assert.ok(validateMap(map).some((warning) => warning.includes('references unknown tile “missingTile”')))
  })

  it('rejects duplicate authored ids and invalid support graphs', () => {
    assert.throws(
      () =>
        parseMapFile(
          file({
            hazards: [
              { id: 'same', type: 'fire', tiles: [[1, 1, 1]] },
              { id: 'same', type: 'fire', tiles: [[2, 1, 1]] },
            ],
          }),
          'Duplicate',
        ),
      /duplicate authored id “same”/,
    )
    assert.throws(
      () =>
        parseMapFile(
          file({
            groundItemPlacements: [
              { id: 'a', itemId: 'medkit', position: [1, 1], on: { placement: 'b' } },
              { id: 'b', itemId: 'medkit', position: [1, 1], on: { placement: 'a' } },
            ],
          }),
          'Cycle',
        ),
      /support cycle/,
    )
    assert.throws(
      () =>
        parseMapFile(
          file({ groundItemPlacements: [{ id: 'a', itemId: 'medkit', position: [1, 1], on: { placement: 'missing' } }] }),
          'Missing',
        ),
      /missing placement/,
    )
    assert.throws(
      () =>
        parseMapFile(
          file({ groundItemPlacements: [{ id: 'a', itemId: 'medkit', position: [1, 1], on: { tile: [1, 1], placement: 'b' } }] }),
          'Ambiguous',
        ),
      /expected exactly one tile or placement reference/,
    )
  })

  it('reports support cycles in in-memory maps', () => {
    const map = createBlankMap({ width: 4, height: 4 })
    map.markers.playerStarts.push({ x: 1, y: 1 })
    map.groundItemPlacements = [
      { id: 'a', itemId: 'medkit', position: { x: 1, y: 1 }, on: { placement: 'b' } },
      { id: 'b', itemId: 'medkit', position: { x: 1, y: 1 }, on: { placement: 'a' } },
    ]
    assert.ok(validateMap(map).some((warning) => warning.includes('support cycle')))
    assert.ok(mapPlayErrors(map).some((error) => error.includes('support cycle')))
  })

  it('blocks play for runtime-invalid occupancy but not ordinary authoring advice', () => {
    const map = createBlankMap({ width: 4, height: 4 })
    map.markers.playerStarts.push({ x: 0, y: 0 })
    assert.ok(mapPlayErrors(map).some((error) => error.includes('solid tile')))
    map.markers.playerStarts = [{ x: 1, y: 1 }]
    assert.deepEqual(mapPlayErrors(map), [])
    assert.ok(validateMap({ ...map, name: '' }).some((warning) => warning.includes('needs a name')))
    assert.deepEqual(mapPlayErrors({ ...map, name: '' }), [])
  })
})
