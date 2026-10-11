// Generate Map's wall fittings never land on a corner or T-junction (maps/generators/wallVariants.js, designer request
// Oct 2026: a fitting there reads as hanging off the wall).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import variantData from '../src/data/adaptation/maps/generatedWallVariants.json' with { type: 'json' }
import { generateMap, MAP_GENERATORS, sizeFor } from '../src/maps/mapGenerators.js'
import { isWallCorner } from '../src/maps/generators/wallVariants.js'
import { seededRandomInt } from '../src/rules/seededRandom.js'

const VARIANTS = new Set(Object.values(variantData.walls).flatMap((set) => [...(set.panelVariants ?? []), ...(set.tileVariants ?? [])]))

describe('generated wall fittings skip corners', () => {
  for (const generator of MAP_GENERATORS) {
    it(`${generator.label}: no fitting on a corner`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const map = generateMap({ name: 'Test', mapType: generator.id, biome: 'temperate', ...sizeFor(generator.id, 'medium') }, seededRandomInt(seed))
        map.tiles.forEach((row, y) =>
          row.forEach((id, x) => {
            if (VARIANTS.has(id)) assert.ok(!isWallCorner(map, x, y), `${generator.id} seed ${seed}: ${id} on a corner at ${x},${y}`)
          }),
        )
      }
    })
  }
})
