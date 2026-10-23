// Calibration tileset and the Object Systems Regression map: registration, authored height, and a save round trip.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { getItemById, getItems } from '../src/rules/equipment.js'
import { canStackTileOn, stackSizeOf, surfaceOfTile, tileSurfaceAt } from '../src/rules/placement.js'
import { getTile, PALETTE_GROUPS, parseMapFile, serializeMap, TILES, validateMap } from '../src/maps/mapFormat.js'
import loadout from '../src/data/adaptation/startingEquipment.json'

const root = path.resolve(import.meta.dirname, '..')
const mapFile = JSON.parse(fs.readFileSync(path.join(root, 'maps/Object Systems Regression.json'), 'utf8'))

const HEIGHTS = [
  ['calBlock8', 8, 96],
  ['calBlock16', 16, 96],
  ['calBlock32', 32, 96],
  ['calBlock64', 64, 100],
  ['calBlock92', 92, 128],
]

describe('calibration tileset', () => {
  it('keeps production wall height and the 64-wide tile picture', () => {
    const wall = getTile('bulkhead')
    assert.equal(wall.height, 92)
    assert.equal(wall.imageHeight, 128)
    assert.equal(getTile('floor').height, 0)
    assert.equal(getTile('floor').image, '/art/sprites/environment/starship/floor.png')
  })

  it('lists Calibration groups without removing the location groups', () => {
    const groups = PALETTE_GROUPS.filter((group) => group.section === 'Calibration')
    assert.deepEqual(
      groups.map((group) => group.label),
      ['Floors', 'Heights', 'Walls', 'Surfaces', 'Furniture'],
    )
    assert.equal(PALETTE_GROUPS[0].id, 'starship')
    assert.ok(groups[0].tiles.includes('null'))
    assert.equal(getTile('null').empty, true)
    for (const id of groups.flatMap((group) => group.tiles)) {
      if (id === 'null') continue
      const tile = getTile(id)
      assert.equal(tile.id, id)
      assert.ok(fs.existsSync(path.join(root, 'public', tile.image)))
    }
  })

  it('stores physical height apart from the picture height', () => {
    for (const [id, height, picture] of HEIGHTS) {
      const tile = getTile(id)
      assert.equal(tile.height, height)
      assert.equal(tile.imageHeight ?? 96, picture)
      assert.notEqual(tile.height, tile.imageHeight ?? 96)
      assert.equal(surfaceOfTile(tile).topZ, height)
    }
    assert.equal(getTile('calWall').height, 92)
    assert.equal(getTile('calWall').imageHeight, 128)
    assert.equal(getTile('calWall').wall, true)
    assert.equal(getTile('calWallHalf').height, 46)
    assert.equal(getTile('calWallHalf').imageHeight, undefined)
    assert.equal(getTile('calChair').height, 12)
    assert.equal(getTile('calLocker').height, 52)
    assert.equal(getTile('calLocker').imageHeight, undefined)
    assert.equal(getTile('calShelf').height, 37)
    assert.equal(getTile('calConsole').cover, true)
    const symbols = TILES.map((tile) => tile.symbol)
    assert.equal(new Set(symbols).size, symbols.length)
  })

  it('measures square calibration items at their labelled footprint and leaves them out of the loadout', () => {
    assert.deepEqual(stackSizeOf('calFoot8Red'), { width: 8, depth: 8, height: 8 })
    assert.deepEqual(stackSizeOf('calFoot16Green'), { width: 16, depth: 16, height: 8 })
    assert.deepEqual(stackSizeOf('calFoot32Blue'), { width: 32, depth: 32, height: 8 })
    assert.deepEqual(stackSizeOf('calFoot64Gray'), { width: 64, depth: 64, height: 8 })
    assert.deepEqual(stackSizeOf('calBoxRed'), { width: 32, depth: 32, height: 16 })
    assert.deepEqual(stackSizeOf('calTallNarrow'), { width: 8, depth: 8, height: 48 })
    assert.deepEqual(stackSizeOf('calPartial'), { width: 32, depth: 32, height: 16 })
    assert.deepEqual(stackSizeOf('calHollow'), { width: 32, depth: 32, height: 16 })
    // The engine forces a square from the opaque box, so these selection sprites do not keep a rectangular footprint.
    assert.deepEqual(stackSizeOf('calWideLow'), { width: 20, depth: 20, height: 4 })
    const issued = JSON.stringify(loadout)
    for (const item of getItems().filter((entry) => entry.category === 'calibration')) {
      assert.equal(issued.includes(`"${item.id}"`), false)
      assert.ok(fs.existsSync(path.join(root, 'public', item.worldImage)))
    }
  })
})

describe('Object Systems Regression map', () => {
  const map = parseMapFile(mapFile, 'Object Systems Regression')

  it('loads six zones, the experiment grid, and a stack within the cap', () => {
    assert.equal(map.width, 40)
    assert.equal(map.height, 30)
    assert.deepEqual(
      map.areas.map((area) => area.name),
      ['Zone A — Scale', 'Zone B — Selection', 'Zone C — Stacking', 'Zone D — Surfaces', 'Zone E — Walls', 'Zone F — Inventory', 'Experiment'],
    )
    assert.equal(map.markers.playerStarts.length, 4)
    assert.deepEqual(validateMap(map).filter((warning) => /solid tile|needs a name/.test(warning)), [])
    assert.equal(tileSurfaceAt(map, { x: 32, y: 6 }).topZ, 56)
    assert.equal(tileSurfaceAt(map, { x: 29, y: 6 }).topZ, 32)
    assert.equal(tileSurfaceAt(map, { x: 35, y: 6 }).topZ, 72)
    assert.equal(canStackTileOn(map, { x: 32, y: 6 }, 'calBlock8').ok, true)
    const full = {
      ...map,
      stackOver: { ...map.stackOver, '32,6': ['calBlock16', 'calBlock8', 'calBlock8'] },
    }
    assert.equal(canStackTileOn(full, { x: 32, y: 6 }, 'calBlock8').ok, false)
    for (const entry of map.groundItemPlacements) assert.ok(getItemById(entry.itemId), entry.itemId)
    assert.ok(map.groundItemPlacements.some((entry) => entry.itemId === 'standardTricorder'))
    assert.ok(map.groundItemPlacements.some((entry) => entry.itemId === 'phaserType1'))
  })

  it('keeps placements and stack metadata across a save', () => {
    const again = parseMapFile(serializeMap(map), 'Object Systems Regression')
    assert.deepEqual(again.tiles, map.tiles)
    assert.deepEqual(again.stackOver, map.stackOver)
    assert.deepEqual(again.groundItemPlacements, map.groundItemPlacements)
    assert.deepEqual(again.areas, map.areas)
    assert.deepEqual(again.markers, map.markers)
    assert.equal(again.objects.length, 0)
  })
})
