// The map's ambient light level (maps/mapFormat.js ambient).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap, FULL_LIGHT, parseMapFile, serializeMap } from '../src/maps/mapFormat.js'

describe('ambient light', () => {
  it('new maps and maps saved before ambient light are fully lit', () => {
    assert.equal(createBlankMap().ambient, FULL_LIGHT)
    const { ambient, ...older } = serializeMap(createBlankMap({ name: 'Old' }))
    assert.equal(ambient, FULL_LIGHT)
    assert.equal(parseMapFile(older, 'Old').ambient, FULL_LIGHT)
  })

  it('round-trips through the file and is kept between 0 and 100', () => {
    const file = serializeMap({ ...createBlankMap({ name: 'Dim' }), ambient: 35 })
    assert.equal(parseMapFile(file, 'Dim').ambient, 35)
    assert.equal(parseMapFile({ ...file, ambient: -20 }, 'Dim').ambient, 0)
    assert.equal(parseMapFile({ ...file, ambient: 250 }, 'Dim').ambient, FULL_LIGHT)
    assert.equal(parseMapFile({ ...file, ambient: 'dark' }, 'Dim').ambient, FULL_LIGHT)
  })
})
