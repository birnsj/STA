// Map-authored groundItemPlacements seed session ground inventory (Inventory Object Test map).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, beforeEach } from 'node:test'
import { createExplorationState } from '../src/exploration/explorationState.js'
import { groundItemAt, moveGroundItem, placeGroundItem, removeGroundItem } from '../src/maps/mapEdits.js'
import { parseMapFile, serializeMap, validateMap } from '../src/maps/mapFormat.js'
import { zOf } from '../src/rules/placement.js'
import {
  dropItem,
  groundItemViews,
  pickupItem,
  resetInstanceIds,
  seedGroundItemPlacements,
  snapItemPosition,
} from '../src/rules/inventory.js'
import { makeCharacter } from './support/characters.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const MAP_PATH = path.join(ROOT, 'maps', 'Inventory Object Test.json')

const TM_IDS = [
  'hypospray',
  'autosuture',
  'osteogenicStimulator',
  'corticalInhibitor',
  'corticalStimulator',
  'cytoplasmicStimulator',
  'dermalStimulator',
  'detronalScanner',
  'neuralCalipers',
  'neuralStimulator',
  'neuralTransducer',
  'sonicSeparator',
  'vascularRegenerator',
  'medicalShotgun',
  'hyperspanner',
  'plasmaTorch',
  'tridentScanner',
  'magneticProbe',
  'odnRecoupler',
  'fluxCoupler',
  'dualiticInverter',
  'focalAdjustmentSpanner',
  'graviticCaliper',
  'ionicFlowRegulator',
  'microResonator',
  'parametricScanner',
  'phaseModulator',
  'selfSealingStemBolt',
  'starfleetPadd',
  'isolinearOpticalChip',
  'phaserRifle',
  'phaserRifle2255',
  'laserPistol2250',
  'disruptorPistol',
  'dkTahg',
  'klingonBatleth',
  'mekleth',
  'kurleth',
  'kutluch',
  'gintak',
  'ushaantor',
  'vulcanLirpa',
]

beforeEach(() => resetInstanceIds(1))

function loadTestMap() {
  const file = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'))
  return parseMapFile(file, 'Inventory Object Test')
}

describe('groundItemPlacements schema', () => {
  it('parses and round-trips placements from Inventory Object Test', () => {
    const map = loadTestMap()
    assert.equal(map.groundItemPlacements.length, TM_IDS.length)
    const ids = map.groundItemPlacements.map((entry) => entry.itemId).sort()
    assert.deepEqual(ids, [...TM_IDS].sort())
    const again = parseMapFile(serializeMap(map), map.id)
    assert.deepEqual(again.groundItemPlacements, map.groundItemPlacements)
  })

  it('drops out-of-bounds placements on parse; unknown itemIds wait for seed', () => {
    const map = parseMapFile(
      {
        name: 'Tiny',
        rows: ['####', '#..#', '#..#', '####'],
        groundItemPlacements: [
          { itemId: 'hypospray', position: [1, 1] },
          { itemId: 'notARealItem', position: [2, 1] },
          { itemId: 'autosuture', position: [99, 99] },
        ],
      },
      'Tiny',
    )
    assert.equal(map.groundItemPlacements.length, 2)
    assert.deepEqual(
      map.groundItemPlacements.map((entry) => entry.itemId),
      ['hypospray', 'notARealItem'],
    )
    assert.ok(map.groundItemPlacements.every((entry) => entry.id))
  })

  it('migrates missing ids on parse and omits default pickable/visible on serialize', () => {
    const map = parseMapFile(
      {
        name: 'Migrate',
        rows: ['######', '#....#', '#....#', '######'],
        groundItemPlacements: [
          { itemId: 'hypospray', position: [1.1, 1.2], name: 'Medkit', pickable: false, visible: false },
          { itemId: 'autosuture', position: [2, 1] },
        ],
      },
      'Migrate',
    )
    assert.equal(map.groundItemPlacements[0].id, 'hypospray1')
    assert.equal(map.groundItemPlacements[1].id, 'autosuture1')
    assert.equal(map.groundItemPlacements[0].pickable, false)
    assert.equal(map.groundItemPlacements[0].visible, false)
    const disk = serializeMap(map)
    assert.equal(disk.groundItemPlacements[0].pickable, false)
    assert.equal(disk.groundItemPlacements[0].visible, false)
    assert.equal(disk.groundItemPlacements[0].name, 'Medkit')
    assert.equal(disk.groundItemPlacements[1].pickable, undefined)
    assert.equal(disk.groundItemPlacements[1].visible, undefined)
    assert.ok(disk.groundItemPlacements.every((entry) => entry.id))
  })
})

describe('mapEdits ground items', () => {
  it('places, moves, and removes on the tile the picture fills; rejects solid tiles', () => {
    let map = parseMapFile(
      {
        name: 'Edit',
        rows: ['######', '#....#', '#....#', '######'],
      },
      'Edit',
    )
    const placed = placeGroundItem(map, { x: 1.04, y: 1.11 }, 'hypospray')
    assert.ok(placed)
    map = placed.map
    assert.deepEqual(placed.object.position, { x: 1.25, y: 1.25 })
    assert.equal(groundItemAt(map, placed.object.position)?.id, placed.object.id)
    assert.equal(placeGroundItem(map, { x: 0, y: 0 }, 'autosuture'), null)
    const moved = moveGroundItem(map, placed.object.id, { x: 2.2, y: 1.3 })
    assert.notEqual(moved, map)
    map = moved
    assert.deepEqual(moved.groundItemPlacements[0].position, { x: 2.25, y: 1.5 })
    map = removeGroundItem(map, placed.object.id)
    assert.equal(map.groundItemPlacements.length, 0)
  })
})

describe('createExplorationState seeding', () => {
  it('rejects authored supports that current placement rules cannot resolve', () => {
    const map = parseMapFile(
      {
        name: 'Invalid supports',
        rows: ['#####', '#...#', '#...#', '#####'],
      },
      'Invalid supports',
    )
    const base = { party: { map }, itemInstances: {}, groundItems: {} }
    const state = seedGroundItemPlacements(base, [
      { id: 'bad-tile', itemId: 'medkit', position: { x: 1, y: 1 }, on: { tile: [1, 1] } },
      { id: 'bad-parent', itemId: 'medkit', position: { x: 2, y: 1 }, on: { placement: 'missing' } },
    ])
    assert.deepEqual(state.groundItems, {})
    assert.deepEqual(state.itemInstances, {})
  })

  it('places all Technical Manual catalogue items as ground instances with snapped positions', () => {
    const map = loadTestMap()
    const state = createExplorationState(map, [makeCharacter({ id: 'a', equipment: [] })], 1, { enemiesActive: false })
    const views = groundItemViews(state)
    assert.equal(views.length, TM_IDS.length)
    const itemIds = views.map((view) => view.itemId).sort()
    assert.deepEqual(itemIds, [...TM_IDS].sort())
    for (const view of views) {
      assert.ok(view.worldImage, `${view.itemId} worldImage`)
      assert.deepEqual(view.position, snapItemPosition(view.position))
      assert.ok(view.icon, `${view.itemId} icon`)
    }
  })

  it('skips unknown itemIds at seed time', () => {
    const map = parseMapFile(
      {
        name: 'Skip',
        rows: ['######', '#....#', '#....#', '#....#', '#....#', '######'],
        markers: { playerStarts: [[1, 1]], enemySpawns: [] },
        groundItemPlacements: [
          { itemId: 'hypospray', position: [2, 2] },
          { itemId: 'ghostTool', position: [3, 2] },
        ],
      },
      'Skip',
    )
    // Inject a fake placement that survived parse (unknown ids are not filtered at parse — only missing fields/bounds).
    map.groundItemPlacements.push({ itemId: 'ghostTool', position: { x: 3, y: 2 } })
    const state = createExplorationState(map, [makeCharacter({ id: 'a', equipment: [] })], 1, { enemiesActive: false })
    const views = groundItemViews(state)
    assert.equal(views.length, 1)
    assert.equal(views[0].itemId, 'hypospray')
  })

  it('honors authored id, name, pickable, and visible', () => {
    const map = parseMapFile(
      {
        name: 'Flags',
        rows: ['######', '#....#', '#....#', '#....#', '######'],
        markers: { playerStarts: [[1, 1]], enemySpawns: [] },
        groundItemPlacements: [
          { id: 'hypoA', itemId: 'hypospray', position: [2, 1], name: 'Field Medkit' },
          { id: 'padB', itemId: 'starfleetPadd', position: [3, 1], pickable: false },
          { id: 'scanC', itemId: 'tridentScanner', position: [2, 2], visible: false },
        ],
      },
      'Flags',
    )
    let state = createExplorationState(map, [makeCharacter({ id: 'a', equipment: [] })], 1, { enemiesActive: false })
    assert.ok(state.groundItems.hypoA)
    assert.ok(state.groundItems.padB)
    assert.ok(state.groundItems.scanC)
    const views = groundItemViews(state)
    assert.equal(views.length, 2)
    assert.equal(views.find((view) => view.id === 'hypoA')?.name, 'Field Medkit')
    assert.equal(views.find((view) => view.id === 'padB')?.pickable, false)
    assert.equal(
      views.find((view) => view.id === 'scanC'),
      undefined,
    )
    const memberId = state.party.memberIds[0]
    const blocked = pickupItem(state, { instanceId: 'padB', memberId })
    assert.ok(blocked.groundItems.padB)
    state = pickupItem(state, { instanceId: 'hypoA', memberId })
    assert.ok(!state.groundItems.hypoA)
  })
})

describe('pickup and drop round-trip', () => {
  it('preserves itemId identity through pickup and drop', () => {
    const map = loadTestMap()
    let state = createExplorationState(map, [makeCharacter({ id: 'a', equipment: [] })], 1, { enemiesActive: false })
    const memberId = state.party.memberIds[0]
    const before = groundItemViews(state)
    assert.equal(before.length, TM_IDS.length)
    for (const view of before) {
      const itemId = view.itemId
      const instanceId = view.instanceId
      state = pickupItem(state, { instanceId, memberId })
      assert.ok(!state.groundItems[instanceId])
      assert.equal(state.itemInstances[instanceId].itemId, itemId)
      // Empty floor rows, one tile apart so stack footprints do not overlap the catalogue layout.
      const index = before.indexOf(view)
      const rows = [1, 2, 5, 6, 9, 10, 13, 14]
      const park = { x: 2 + (index % 10), y: rows[Math.floor(index / 10)] }
      state = dropItem(state, { instanceId, position: park })
      assert.ok(state.groundItems[instanceId])
      assert.equal(state.itemInstances[instanceId].itemId, itemId)
      assert.equal(state.groundItems[instanceId].support, undefined)
      const landed = state.groundItems[instanceId].position
      assert.ok(Math.abs(landed.x - park.x) <= 0.5 && Math.abs(landed.y - park.y) <= 0.5, `${itemId} left its tile`)
    }
    assert.equal(groundItemViews(state).length, TM_IDS.length)
    assert.equal(new Set(groundItemViews(state).map((view) => view.itemId)).size, TM_IDS.length)
  })
})

describe('Stacking Test map', () => {
  it('seeds every authored box, including item-on-item stacks and the raised crates', () => {
    const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'maps', 'Stacking Test.json'), 'utf8'))
    const map = parseMapFile(file, 'Stacking Test')
    assert.deepEqual(validateMap(map), [])
    const state = createExplorationState(map, [makeCharacter({ id: 'a', equipment: [] })], 1, { enemiesActive: false })
    const items = Object.values(state.groundItems)
    assert.equal(items.length, file.groundItemPlacements.length)
    assert.equal(items.filter((entry) => entry.support?.kind === 'item').length, 10)
    assert.ok(items.some((entry) => zOf(state, entry) >= 32))
  })
})
