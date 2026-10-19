// Map-authored groundItemPlacements seed session ground inventory (Inventory Object Test map).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, beforeEach } from 'node:test'
import { createExplorationState } from '../src/exploration/explorationState.js'
import { groundItemAt, moveGroundItem, placeGroundItem, removeGroundItem } from '../src/maps/mapEdits.js'
import { parseMapFile, serializeMap } from '../src/maps/mapFormat.js'
import {
  dropItem,
  groundItemViews,
  pickupItem,
  resetInstanceIds,
  snapItemPosition,
} from '../src/rules/inventory.js'
import { makeCharacter } from './support/characters.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const MAP_PATH = path.join(ROOT, 'maps', 'Inventory Object Test.json')

const TM_IDS = [
  'starfleetPadd',
  'hypospray',
  'hyperspanner',
  'plasmaTorch',
  'tridentScanner',
  'magneticProbe',
  'odnRecoupler',
  'fluxCoupler',
  'autosuture',
  'osteogenicStimulator',
  'phaserRifle',
  'klingonBatleth',
]

beforeEach(() => resetInstanceIds(1))

function loadTestMap() {
  const file = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'))
  return parseMapFile(file, 'Inventory Object Test')
}

describe('groundItemPlacements schema', () => {
  it('parses and round-trips placements from Inventory Object Test', () => {
    const map = loadTestMap()
    assert.equal(map.groundItemPlacements.length, 12)
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
  it('places, moves, and removes with 8×8 snap; rejects solid tiles', () => {
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
    assert.deepEqual(placed.object.position, snapItemPosition({ x: 1.04, y: 1.11 }))
    assert.equal(groundItemAt(map, placed.object.position)?.id, placed.object.id)
    assert.equal(placeGroundItem(map, { x: 0, y: 0 }, 'autosuture'), null)
    const moved = moveGroundItem(map, placed.object.id, { x: 2.2, y: 1.3 })
    assert.notEqual(moved, map)
    map = moved
    assert.deepEqual(groundItemAt(map, { x: 2.2, y: 1.3 })?.position, snapItemPosition({ x: 2.2, y: 1.3 }))
    map = removeGroundItem(map, placed.object.id)
    assert.equal(map.groundItemPlacements.length, 0)
  })
})

describe('createExplorationState seeding', () => {
  it('places all 12 Technical Manual items as ground instances with snapped positions', () => {
    const map = loadTestMap()
    const state = createExplorationState(map, [makeCharacter({ id: 'a', equipment: [] })], 1, { enemiesActive: false })
    const views = groundItemViews(state)
    assert.equal(views.length, 12)
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
    assert.equal(before.length, 12)
    for (const view of before) {
      const itemId = view.itemId
      const instanceId = view.instanceId
      state = pickupItem(state, { instanceId, memberId })
      assert.ok(!state.groundItems[instanceId])
      assert.equal(state.itemInstances[instanceId].itemId, itemId)
      state = dropItem(state, { instanceId, position: { x: 4, y: 4 } })
      assert.ok(state.groundItems[instanceId])
      assert.equal(state.itemInstances[instanceId].itemId, itemId)
      assert.deepEqual(state.groundItems[instanceId].position, snapItemPosition({ x: 4, y: 4 }))
      // Move aside so the next drop can reuse the same cell.
      state = dropItem(state, {
        instanceId,
        position: { x: 4 + before.indexOf(view) * 0.125, y: 5 },
      })
    }
    assert.equal(groundItemViews(state).length, 12)
    assert.equal(new Set(groundItemViews(state).map((view) => view.itemId)).size, 12)
  })
})
