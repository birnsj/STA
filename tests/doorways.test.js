// Generated doorways are two tiles wide (maps/generators/shared.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { generateMap, MAP_GENERATORS, sizeFor } from '../src/maps/mapGenerators.js'
import { seededRandomInt } from '../src/rules/seededRandom.js'

const DOORS = new Set(['doorway', 'forceField'])

// Every doorway tile has another doorway tile beside it (a two-wide doorway), on every location that has doors.
describe('two-tile doorways', () => {
  for (const generator of MAP_GENERATORS) {
    it(`${generator.label}: no single-tile doorways`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const map = generateMap({ name: 'Test', mapType: generator.id, biome: 'temperate', ...sizeFor(generator.id, 'medium') }, seededRandomInt(seed))
        const at = (x, y) => map.tiles[y]?.[x]
        map.tiles.forEach((row, y) =>
          row.forEach((id, x) => {
            if (id !== 'doorway') return
            const paired = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((other) => DOORS.has(other))
            assert.ok(paired, `${generator.id} seed ${seed}: lone doorway at ${x},${y}`)
          }),
        )
      }
    })
  }
})
