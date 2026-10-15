// The map editor's edits for destructible objects and hazard regions (maps/mapEdits.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  destructibleAt,
  duplicateDestructible,
  eraseHazardTile,
  hazardRegionAt,
  moveDestructible,
  paintHazardTile,
  paintTile,
  placeDestructible,
  removeDestructible,
  updateDestructible,
  updateHazard,
} from '../src/maps/mapEdits.js'
import { createBlankMap, parseMapFile, serializeMap, WALL_TILE } from '../src/maps/mapFormat.js'

const blank = () => ({ ...createBlankMap({ name: 'Edits', width: 12, height: 10 }) })
const paintAll = (map, type, positions, intensity = 2) => positions.reduce((next, [x, y]) => paintHazardTile(next, { x, y }, type, intensity), map)

describe('destructible edits', () => {
  it('places on free floor only, with unique ids', () => {
    const first = placeDestructible(blank(), { x: 3, y: 3 }, 'gasCylinder')
    assert.equal(first.object.id, 'gasCylinder1')
    assert.equal(placeDestructible(first.map, { x: 3, y: 3 }, 'gasCylinder'), null, 'tile taken')
    assert.equal(placeDestructible(first.map, { x: 0, y: 0 }, 'gasCylinder'), null, 'wall')
    assert.equal(placeDestructible(first.map, { x: 5, y: 5 }, 'gasCylinder', [{ x: 5, y: 5 }]), null, 'challenge object there')
    const second = placeDestructible(first.map, { x: 4, y: 3 }, 'gasCylinder')
    assert.equal(second.object.id, 'gasCylinder2')
  })

  it('moves, edits overrides, duplicates and deletes', () => {
    const { map } = placeDestructible(blank(), { x: 3, y: 3 }, 'epsConduit')
    const moved = moveDestructible(map, 'epsConduit1', { x: 6, y: 4 })
    assert.deepEqual(destructibleAt(moved, { x: 6, y: 4 })?.id, 'epsConduit1')
    assert.equal(moveDestructible(moved, 'epsConduit1', { x: 0, y: 4 }), moved, 'refused onto a wall')

    const edited = updateDestructible(moved, 'epsConduit1', { structure: 7, name: 'Main EPS' })
    assert.equal(edited.destructibles[0].structure, 7)
    const cleared = updateDestructible(edited, 'epsConduit1', { structure: null })
    assert.ok(!('structure' in cleared.destructibles[0]))

    const copy = duplicateDestructible(edited, 'epsConduit1')
    assert.notEqual(copy.object.id, 'epsConduit1')
    assert.equal(copy.object.structure, 7, 'keeps the overrides')
    assert.equal(copy.object.name, 'Main EPS')
    assert.equal(Math.max(Math.abs(copy.object.position.x - 6), Math.abs(copy.object.position.y - 4)), 1, 'next to the original')
    assert.equal(new Set(copy.map.destructibles.map((object) => object.id)).size, 2)

    assert.deepEqual(removeDestructible(copy.map, 'epsConduit1').destructibles.map((object) => object.id), [copy.object.id])
  })

  it('painting a wall over a destructible or a hazard tile removes it', () => {
    let map = placeDestructible(blank(), { x: 3, y: 3 }, 'gasCylinder').map
    map = paintAll(map, 'fire', [[5, 5], [6, 5]])
    map = paintTile(paintTile(map, { x: 3, y: 3 }, WALL_TILE), { x: 5, y: 5 }, WALL_TILE)
    assert.deepEqual(map.destructibles, [])
    assert.deepEqual(map.hazards[0].tiles, { '6,5': 2 })
  })
})

describe('hazard regions', () => {
  it('touching tiles of one type form one region; another type starts its own', () => {
    const map = paintAll(blank(), 'smoke', [[2, 2], [3, 2], [4, 2]])
    assert.equal(map.hazards.length, 1)
    assert.deepEqual(Object.keys(map.hazards[0].tiles).sort(), ['2,2', '3,2', '4,2'])
    const withFire = paintAll(map, 'fire', [[6, 2]])
    assert.equal(withFire.hazards.length, 2)
    assert.equal(paintHazardTile(withFire, { x: 0, y: 0 }, 'fire'), withFire, 'no hazards in walls')
  })

  it('a tile linking two regions merges them', () => {
    let map = paintAll(blank(), 'smoke', [[2, 2], [4, 2]])
    assert.equal(map.hazards.length, 2)
    map = paintHazardTile(map, { x: 3, y: 2 }, 'smoke')
    assert.equal(map.hazards.length, 1)
    assert.equal(Object.keys(map.hazards[0].tiles).length, 3)
  })

  it('erasing the middle of a region splits it into new regions', () => {
    let map = paintAll(blank(), 'toxicGas', [[2, 2], [3, 2], [4, 2], [5, 2], [6, 2]])
    const id = map.hazards[0].id
    map = updateHazard(map, id, { severity: 4 })
    map = eraseHazardTile(map, { x: 4, y: 2 })
    assert.equal(map.hazards.length, 2)
    assert.equal(new Set(map.hazards.map((region) => region.id)).size, 2)
    assert.ok(map.hazards.some((region) => region.id === id), 'one piece keeps the id')
    assert.ok(map.hazards.every((region) => region.severity === 4), 'both keep the overrides')
    assert.equal(hazardRegionAt(map, { x: 4, y: 2 }), null)
  })

  it('painting another type over a tile moves it to that type', () => {
    let map = paintAll(blank(), 'smoke', [[2, 2], [3, 2], [4, 2]])
    map = paintHazardTile(map, { x: 3, y: 2 }, 'fire')
    assert.equal(hazardRegionAt(map, { x: 3, y: 2 }).type, 'fire')
    assert.equal(map.hazards.filter((region) => region.type === 'smoke').length, 2, 'the smoke region split')
  })

  it('round-trips through the map file', () => {
    let map = paintAll(blank(), 'fire', [[2, 2], [3, 2]], 3)
    map = placeDestructible(map, { x: 6, y: 6 }, 'plasmaJunction').map
    map = updateHazard(map, map.hazards[0].id, { spreadChance: 50, neutralizeDifficulty: 3 })
    const back = parseMapFile(JSON.parse(JSON.stringify(serializeMap(map))), 'edits')
    assert.deepEqual(back.hazards, map.hazards)
    assert.deepEqual(back.destructibles, map.destructibles)
  })
})
