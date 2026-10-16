// Generate Map's optional hazard scatter (mapGenerators.js withGeneratedHazards).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import hazardData from '../src/data/adaptation/world/hazards.json'
import { generateMap, sizeFor, withGeneratedHazards } from '../src/maps/mapGenerators.js'
import { getTile } from '../src/maps/mapFormat.js'
import { seededRandomInt } from '../src/rules/seededRandom.js'

const keyOf = ({ x, y }) => `${x},${y}`

describe('withGeneratedHazards', () => {
  it('scatters hazard regions on open floor and leaves starts clear', () => {
    const layout = generateMap({ name: 'Test', mapType: 'starshipDeck', biome: 'temperate', ...sizeFor('starshipDeck', 'medium') }, seededRandomInt(42))
    const map = withGeneratedHazards(layout, seededRandomInt(99))
    assert.ok(map.hazards.length >= 2)
    assert.ok(map.hazards.length <= 8)
    const reserved = new Set([...(map.markers.playerStarts ?? []), ...(map.markers.enemySpawns ?? [])].map(keyOf))
    const seen = new Set()
    for (const region of map.hazards) {
      assert.ok(hazardData.types[region.type], region.type)
      assert.ok(Object.keys(region.tiles).length >= 1)
      for (const [key, intensity] of Object.entries(region.tiles)) {
        assert.ok(!seen.has(key), `tile ${key} in two regions`)
        seen.add(key)
        assert.ok(intensity >= 1 && intensity <= 3)
        assert.ok(!reserved.has(key), `hazard on spawn ${key}`)
        const [x, y] = key.split(',').map(Number)
        assert.equal(getTile(map.tiles[y][x]).solid, false)
      }
    }
  })

  it('leaves hazards empty when Generate Map runs without the option', () => {
    const map = generateMap({ name: 'Test', mapType: 'starshipDeck', biome: 'temperate', ...sizeFor('starshipDeck', 'medium') }, seededRandomInt(7))
    assert.deepEqual(map.hazards, [])
  })
})
