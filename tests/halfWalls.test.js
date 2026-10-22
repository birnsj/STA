// Half bulkheads: hand-placed Ultima-8 thin walls; finishHalfWalls turns junctions into corners and sets rotation
// toward open floor (maps/generators/halfWalls.js). Generate Map starship layouts use full bulkheads again.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { finishHalfWalls, HALF_WALL, HALF_WALL_CORNER, wallRunAxis } from '../src/maps/generators/halfWalls.js'
import { generateMap, sizeFor } from '../src/maps/mapGenerators.js'
import { seededRandomInt } from '../src/rules/seededRandom.js'

describe('finishHalfWalls', () => {
  it('turns an L of half bulkheads into a corner and leaves the straights', () => {
    const floor = 'floor'
    const map = {
      width: 4,
      height: 4,
      tiles: [
        [HALF_WALL, HALF_WALL, HALF_WALL, HALF_WALL],
        [HALF_WALL, floor, floor, HALF_WALL],
        [HALF_WALL, floor, floor, HALF_WALL],
        [HALF_WALL, HALF_WALL, HALF_WALL, HALF_WALL],
      ],
    }
    const next = finishHalfWalls(map)
    assert.equal(next.tiles[0][0], HALF_WALL_CORNER)
    assert.equal(next.tiles[0][3], HALF_WALL_CORNER)
    assert.equal(next.tiles[3][0], HALF_WALL_CORNER)
    assert.equal(next.tiles[3][3], HALF_WALL_CORNER)
    assert.equal(next.tiles[0][1], HALF_WALL)
    assert.equal(next.tiles[1][0], HALF_WALL)
  })

  it('picks the y run image axis for a vertical wall', () => {
    const map = {
      width: 3,
      height: 3,
      tiles: [
        ['floor', HALF_WALL, 'floor'],
        ['floor', HALF_WALL, 'floor'],
        ['floor', HALF_WALL, 'floor'],
      ],
    }
    assert.equal(wallRunAxis(map, { x: 1, y: 1 }), 'y')
  })
})

describe('starship Generate Map uses full bulkheads', () => {
  for (const id of ['starshipDeck', 'spaceStation', 'derelict']) {
    it(`${id}: walls are full bulkheads, not half bulkheads`, () => {
      const map = generateMap({ name: 'Test', mapType: id, biome: 'temperate', ...sizeFor(id, 'medium') }, seededRandomInt(3))
      let bulkhead = 0
      map.tiles.forEach((row) =>
        row.forEach((tile) => {
          if (tile === HALF_WALL || tile === HALF_WALL_CORNER) {
            assert.fail(`${id} placed a half bulkhead`)
          }
          if (tile === 'bulkhead') bulkhead++
        }),
      )
      assert.ok(bulkhead > 0, `${id} placed no bulkheads`)
    })
  }
})
