// Deck Generate Map styles (deckGenerators.json / deckStyles.js) and wall variations.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getDeckStyle,
  replaceDeckStylesLocal,
  setDeckStyleLocal,
} from '../src/maps/generators/deckStyles.js'
import {
  getWallVariantSet,
  replaceWallVariantsLocal,
  setWallVariantSetLocal,
} from '../src/maps/generators/wallVariantStyles.js'
import { isWallCorner } from '../src/maps/generators/wallVariants.js'
import { generateMap, sizeFor } from '../src/maps/mapGenerators.js'
import { seededRandomInt } from '../src/rules/seededRandom.js'
import seed from '../src/data/adaptation/maps/deckGenerators.json'
import wallSeed from '../src/data/adaptation/maps/generatedWallVariants.json'

describe('deckStyles', () => {
  it('seeds starshipDeck, laboratory, and alienVessel from deckGenerators.json', () => {
    replaceDeckStylesLocal(seed)
    assert.equal(getDeckStyle('starshipDeck').wall, 'bulkhead')
    assert.equal(getDeckStyle('laboratory').floor, 'labFloor')
    assert.equal(getDeckStyle('alienVessel').hazard, false)
  })

  it('falls back when a tile id is unknown', () => {
    replaceDeckStylesLocal(seed)
    setDeckStyleLocal('starshipDeck', { wall: 'notARealTile' })
    assert.equal(getDeckStyle('starshipDeck').wall, 'bulkhead')
  })

  it('setDeckStyleLocal updates generateMap wall tiles', () => {
    replaceDeckStylesLocal(seed)
    setDeckStyleLocal('starshipDeck', { wall: 'plainBulkhead', hazard: false })
    const map = generateMap(
      { name: 'Test', mapType: 'starshipDeck', biome: 'temperate', ...sizeFor('starshipDeck', 'medium') },
      seededRandomInt(11),
    )
    let walls = 0
    map.tiles.forEach((row) =>
      row.forEach((tile) => {
        if (tile === 'plainBulkhead') walls++
        if (tile === 'bulkhead') assert.fail('still used default bulkhead')
      }),
    )
    assert.ok(walls > 0, 'expected plainBulkhead walls')
    replaceDeckStylesLocal(seed)
  })

  it('laboratory and alienVessel use their configured floors', () => {
    replaceDeckStylesLocal(seed)
    const lab = generateMap(
      { name: 'Test', mapType: 'laboratory', biome: 'temperate', ...sizeFor('laboratory', 'medium') },
      seededRandomInt(2),
    )
    const alien = generateMap(
      { name: 'Test', mapType: 'alienVessel', biome: 'temperate', ...sizeFor('alienVessel', 'medium') },
      seededRandomInt(2),
    )
    assert.ok(lab.tiles.flat().includes('labFloor'))
    assert.ok(alien.tiles.flat().includes('alienDeck'))
    assert.ok(alien.tiles.flat().includes('alienBulkhead'))
  })
})

describe('wall variant styles', () => {
  it('seeds bulkhead fittings from generatedWallVariants.json', () => {
    replaceWallVariantsLocal(wallSeed)
    const set = getWallVariantSet('bulkhead')
    assert.ok(set)
    assert.equal(set.share, 0.4)
    assert.ok(set.panelVariants.includes('lcarsPanel'))
    assert.ok(set.tileVariants.includes('lcarsWall'))
  })

  it('setWallVariantSetLocal changes generateMap fittings', () => {
    replaceDeckStylesLocal(seed)
    replaceWallVariantsLocal(wallSeed)
    setWallVariantSetLocal('bulkhead', {
      share: 1,
      panelVariants: ['lcarsPanel'],
      tileVariants: ['lcarsWall'],
    })
    const map = generateMap(
      { name: 'Test', mapType: 'starshipDeck', biome: 'temperate', ...sizeFor('starshipDeck', 'medium') },
      seededRandomInt(5),
    )
    const fitted = map.tiles.flat().filter((tile) => tile === 'lcarsPanel' || tile === 'lcarsWall')
    assert.ok(fitted.length > 0, 'expected LCARS fittings when share is 1')
    replaceWallVariantsLocal(wallSeed)
  })

  it('clearing both lists removes variants for that wall', () => {
    replaceWallVariantsLocal(wallSeed)
    setWallVariantSetLocal('bulkhead', { panelVariants: [], tileVariants: [] })
    assert.equal(getWallVariantSet('bulkhead'), null)
    replaceWallVariantsLocal(wallSeed)
  })
})

describe('deck wall corners', () => {
  it('places the style corner tile on wall junctions when set', () => {
    replaceDeckStylesLocal(seed)
    replaceWallVariantsLocal({ walls: {} })
    setDeckStyleLocal('starshipDeck', { corner: 'plainBulkhead' })
    const map = generateMap(
      { name: 'Test', mapType: 'starshipDeck', biome: 'temperate', ...sizeFor('starshipDeck', 'medium') },
      seededRandomInt(3),
    )
    let corners = 0
    map.tiles.forEach((row, y) =>
      row.forEach((tile, x) => {
        if (tile === 'plainBulkhead') {
          corners++
          assert.ok(isWallCorner(map, x, y), `corner tile at ${x},${y} should be a junction`)
        }
      }),
    )
    assert.ok(corners > 0, 'expected corner tiles at junctions')
    replaceDeckStylesLocal(seed)
    replaceWallVariantsLocal(wallSeed)
  })

  it('leaves junctions as wall when corner is null', () => {
    replaceDeckStylesLocal(seed)
    replaceWallVariantsLocal({ walls: {} })
    setDeckStyleLocal('starshipDeck', { corner: null })
    const map = generateMap(
      { name: 'Test', mapType: 'starshipDeck', biome: 'temperate', ...sizeFor('starshipDeck', 'medium') },
      seededRandomInt(3),
    )
    let junctions = 0
    map.tiles.forEach((row, y) =>
      row.forEach((tile, x) => {
        if (tile === 'bulkhead' && isWallCorner(map, x, y)) junctions++
      }),
    )
    assert.ok(junctions > 0, 'expected plain bulkhead junctions when corner unset')
    replaceDeckStylesLocal(seed)
    replaceWallVariantsLocal(wallSeed)
  })
})
