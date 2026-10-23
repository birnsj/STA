// Elevated placement surfaces (rules/placement.js) and canPlaceAt / dropItem integration.
import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import {
  canPlaceAt,
  dropItem,
  pickupItem,
  resetInstanceIds,
  seedPartyInventory,
  transferItem,
} from '../src/rules/inventory.js'
import { project, TILE_H, unproject } from '../src/maps/iso.js'
import {
  approachPoint,
  canPlaceOn,
  canStackTileOn,
  groundItemDepth,
  surfaceTileAtBoard,
  pointInFootprint,
  pointInSurfaceFootprint,
  stackSizeOf,
  propSpriteSize,
  surfaceOfItem,
  surfaceOfTile,
  supportAt,
  supportAtBoard,
  tileSurfaceAt,
  zOf,
} from '../src/rules/placement.js'
import { parseMapFile, serializeMap } from '../src/maps/mapFormat.js'
import { placeGroundItem, stackTileOn } from '../src/maps/mapEdits.js'
import { makeCharacter } from './support/characters.js'

function mapWith(tiles) {
  const height = tiles.length
  const width = tiles[0].length
  return { width, height, tiles, stackOver: {} }
}

function partyState(characters, map) {
  const members = {}
  const memberIds = characters.map((character, index) => {
    const id = character.id ?? `m${index}`
    members[id] = {
      id,
      character: { ...character, id, equipment: [...(character.equipment ?? [])] },
      position: { x: index, y: 0 },
    }
    return id
  })
  return seedPartyInventory({
    party: { map, memberIds, members, leaderId: memberIds[0], selectedIds: [...memberIds] },
    itemInstances: {},
    groundItems: {},
  })
}

beforeEach(() => resetInstanceIds(1))

describe('surfaceOfTile', () => {
  it('resolves opt-in surfaces with topZ from tile height', () => {
    const crate = surfaceOfTile('crate')
    assert.ok(crate)
    assert.equal(crate.topZ, 16)
    assert.equal(crate.inset, 0.05)
    assert.equal(crate.maxStack, 3)
    const table = surfaceOfTile('table')
    assert.equal(table.topZ, 11)
    assert.equal(table.maxStack, 1)
    assert.equal(surfaceOfTile('floor'), null)
    assert.equal(surfaceOfTile('machinery'), null)
  })
})

describe('pointInSurfaceFootprint', () => {
  it('accepts most of the tile top and rejects past the inset edge', () => {
    assert.ok(pointInSurfaceFootprint({ x: 2, y: 2 }, { x: 2, y: 2 }, 0.05))
    assert.ok(pointInSurfaceFootprint({ x: 2.4, y: 2 }, { x: 2, y: 2 }, 0.05))
    assert.ok(pointInSurfaceFootprint({ x: 2.4, y: 2.4 }, { x: 2, y: 2 }, 0.05), 'square footprint covers corners')
    assert.ok(!pointInSurfaceFootprint({ x: 2.5, y: 2.5 }, { x: 2, y: 2 }, 0.05))
  })
})

describe('canPlaceAt on surfaces', () => {
  it('rejects solid tiles without a surface (baseline)', () => {
    const map = mapWith([
      ['floor', 'floor', 'floor'],
      ['floor', 'machinery', 'floor'],
      ['floor', 'floor', 'floor'],
    ])
    const state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }] })], map)
    const check = canPlaceAt(state, { x: 1, y: 1 })
    assert.equal(check.ok, false)
    assert.equal(check.reason, 'Blocked.')
  })

  it('allows a phaser on a table and records support + z', () => {
    const map = mapWith([
      ['floor', 'floor', 'floor'],
      ['floor', 'table', 'floor'],
      ['floor', 'floor', 'floor'],
    ])
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'phaserType2' }] })], map)
    const inventory = state.party.members.a.character.inventory
    const phaserId = inventory.slots.sidearm || inventory.bag.find((id) => state.itemInstances[id]?.itemId === 'phaserType2')
    assert.ok(phaserId)
    const check = canPlaceAt(state, { x: 1, y: 1 }, { category: 'weapon' })
    assert.ok(check.ok)
    assert.deepEqual(check.support, { kind: 'tile', tile: { x: 1, y: 1 } })
    assert.equal(check.z, 11)
    state = dropItem(state, { instanceId: phaserId, position: { x: 1, y: 1 } })
    assert.ok(state.groundItems[phaserId])
    assert.deepEqual(state.groundItems[phaserId].support, { kind: 'tile', tile: { x: 1, y: 1 } })
    assert.equal(zOf(state, state.groundItems[phaserId]), 11)
    assert.ok(groundItemDepth(state, state.groundItems[phaserId]) > 1 + 1)
  })

  it('allows a tricorder on an eps console', () => {
    const map = mapWith([
      ['floor', 'floor'],
      ['floor', 'epsControl'],
    ])
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'standardTricorder' }] })], map)
    const id = state.party.members.a.character.inventory.slots.scanner
    assert.ok(id)
    state = dropItem(state, { instanceId: id, position: { x: 1, y: 1 } })
    assert.equal(state.groundItems[id].support.kind, 'tile')
    assert.equal(zOf(state, state.groundItems[id]), 22)
  })

  it('stacks the next item when the table is already full', () => {
    const map = mapWith([
      ['floor', 'floor', 'floor'],
      ['floor', 'table', 'floor'],
      ['floor', 'floor', 'floor'],
    ])
    let state = partyState(
      [makeCharacter({ id: 'a', equipment: [{ itemId: 'phaserType2' }, { itemId: 'medkit' }, { itemId: 'communicator' }] })],
      map,
    )
    const medkitId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'medkit')
    const commId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'communicator')
    state = dropItem(state, { instanceId: medkitId, position: { x: 1.25, y: 1.25 } })
    const at = state.groundItems[medkitId].position
    state = dropItem(state, { instanceId: commId, position: { x: at.x - 0.2, y: at.y - 0.2 } })
    assert.equal(state.groundItems[medkitId].support.kind, 'tile')
    assert.equal(state.groundItems[commId].support.kind, 'item')
    assert.equal(state.groundItems[commId].support.instanceId, medkitId)
    // Repositioning the occupant is still allowed on the same spot.
    assert.ok(canPlaceAt(state, at, { excludeInstanceId: medkitId, itemId: 'medkit' }).ok)
  })

  it('keeps floor placement identical when no surface is present', () => {
    const map = mapWith(Array.from({ length: 4 }, () => Array(4).fill('floor')))
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }] })], map)
    const id = state.party.members.a.character.inventory.bag.find((i) => state.itemInstances[i].itemId === 'medkit')
    const check = canPlaceAt(state, { x: 2.04, y: 2.11 })
    assert.ok(check.ok)
    assert.equal(check.support, null)
    assert.equal(check.z, 0)
    state = dropItem(state, { instanceId: id, position: { x: 2.04, y: 2.11 } })
    assert.equal(state.groundItems[id].support, undefined)
    assert.deepEqual(state.groundItems[id].position, check.position)
  })

  it('supportAt prefers a table under the point', () => {
    const map = mapWith([
      ['floor', 'floor'],
      ['floor', 'crate'],
    ])
    const state = partyState([makeCharacter({ id: 'a', equipment: [] })], map)
    const support = supportAt(state, { x: 1, y: 1 })
    assert.equal(support.kind, 'tile')
    assert.equal(support.z, 16)
  })
})

describe('stackOver height', () => {
  it('sums heights for tileSurfaceAt and canStackTileOn respects the cap', () => {
    const map = mapWith([
      ['floor', 'floor'],
      ['floor', 'crate'],
    ])
    map.stackOver = { '1,1': ['crate'] }
    const surface = tileSurfaceAt(map, { x: 1, y: 1 })
    // Base crate height 16 + stacked crate height 16.
    assert.equal(surface.topZ, 32)
    assert.equal(surface.stackLevel, 1)
    assert.ok(canStackTileOn(map, { x: 1, y: 1 }, 'crate').ok)
    map.stackOver['1,1'] = ['crate', 'crate', 'crate']
    assert.equal(canStackTileOn(map, { x: 1, y: 1 }, 'crate').ok, false)
  })

  it('a point on a three-high crate top is that stack, not the floor cell behind it', () => {
    const map = mapWith([
      ['floor', 'floor', 'floor', 'floor'],
      ['floor', 'floor', 'floor', 'floor'],
      ['floor', 'floor', 'floor', 'floor'],
      ['floor', 'crate', 'floor', 'floor'],
    ])
    map.stackOver = { '1,3': ['crate', 'crate'] }
    const surface = tileSurfaceAt(map, { x: 1, y: 3 })
    const centre = project({ x: 1, y: 3 })
    const onTop = { x: centre.x, y: centre.y - surface.topZ }
    const behind = unproject(onTop)
    assert.ok(Math.round(behind.x) !== 1 || Math.round(behind.y) !== 3)
    assert.deepEqual(surfaceTileAtBoard(map, onTop), { x: 1, y: 3 })
  })
})

describe('groundItemDepth', () => {
  it('sorts an item on a table with the support tile, above the table sprite', () => {
    const map = mapWith([
      ['floor', 'floor'],
      ['floor', 'table'],
    ])
    const state = partyState([makeCharacter({ id: 'a', equipment: [] })], map)
    const entry = {
      instanceId: 'item-1',
      position: { x: 0.875, y: 0.875 },
      support: { kind: 'tile', tile: { x: 1, y: 1 } },
    }
    const depth = groundItemDepth(state, entry)
    // Must sort after the table block at (1,1); back-corner position alone would be too low.
    assert.ok(depth > 1 + 1, 'item draws after the table block at the same cell')
    assert.ok(depth >= 1 + 1 + 0.55, 'surface depth bias keeps the table front face under the item')
    const floorDepth = groundItemDepth(state, { instanceId: 'x', position: { x: 0.875, y: 0.875 } })
    assert.equal(floorDepth, 0.875 + 0.875 + 0.35)
  })
})

describe('item stack size on a 64×64 spot', () => {
  function put(state, id, itemId, position) {
    const placed = canPlaceOn(state, position, { itemId, category: 'utility' })
    if (!placed.ok) return { state, placed }
    return {
      placed,
      state: {
        ...state,
        itemInstances: { ...state.itemInstances, [id]: { id, itemId, quantity: 1 } },
        groundItems: {
          ...state.groundItems,
          [id]: { instanceId: id, position: placed.position, ...(placed.support ? { support: placed.support } : {}) },
        },
      },
    }
  }

  it('takes the footprint and picture from the image pixels', () => {
    const medkit = stackSizeOf('medkit')
    const communicator = stackSizeOf('communicator')
    const kit = stackSizeOf('equipmentCase')
    assert.deepEqual({ width: medkit.width, depth: medkit.depth, height: medkit.height }, { width: 32, depth: 32, height: 5 })
    assert.deepEqual({ width: communicator.width, depth: communicator.depth, height: communicator.height }, { width: 16, depth: 16, height: 2 })
    assert.equal(kit.height, 6)
    assert.deepEqual(propSpriteSize('medkit'), { width: 32, height: 48 })
    assert.deepEqual(propSpriteSize('communicator'), { width: 16, height: 24 })
    assert.deepEqual(propSpriteSize('stackBoxRed'), { width: 32, height: 48 })
    assert.equal(stackSizeOf('stackBoxRed').height, 8)
  })

  it('fits four large items on a tile and stacks the next one', () => {
    const map = mapWith([
      ['floor', 'floor'],
      ['floor', 'crate'],
    ])
    let state = partyState([makeCharacter({ id: 'a', equipment: [] })], map)
    const drops = [
      { aim: { x: 1.25, y: 1.25 }, at: { x: 1.5, y: 1.5 } },
      { aim: { x: 0.75, y: 0.75 }, at: { x: 1, y: 1 } },
      { aim: { x: 1.25, y: 0.75 }, at: { x: 1.5, y: 1 } },
      { aim: { x: 0.75, y: 1.25 }, at: { x: 1, y: 1.5 } },
    ]
    drops.forEach((slot, i) => {
      const step = put(state, `m${i}`, 'medkit', slot.aim)
      assert.equal(step.placed.ok, true, step.placed.reason)
      assert.equal(step.placed.support.kind, 'tile')
      assert.deepEqual(step.placed.position, slot.at)
      state = step.state
    })
    const stacked = put(state, 'm4', 'medkit', { x: 1.25, y: 1.25 })
    assert.equal(stacked.placed.ok, true, stacked.placed.reason)
    assert.equal(stacked.placed.support.kind, 'item')
  })

  it('fills the cell under the pointer, not the whole tile', () => {
    const map = mapWith([
      ['floor', 'floor'],
      ['floor', 'crate'],
    ])
    let state = partyState([makeCharacter({ id: 'a', equipment: [] })], map)
    const front = put(state, 'front', 'medkit', { x: 1.1, y: 1.1 })
    assert.equal(front.placed.support.kind, 'tile')
    assert.deepEqual(front.placed.position, { x: 1.5, y: 1.5 })
    const back = put(front.state, 'back', 'medkit', { x: 0.6, y: 0.6 })
    assert.equal(back.placed.support.kind, 'tile')
    assert.deepEqual(back.placed.position, { x: 1, y: 1 })
  })
})

describe('item-on-item and editor stacking', () => {
  it('allows a phaser on an equipment case on a crate', () => {
    const map = mapWith([
      ['floor', 'floor'],
      ['floor', 'crate'],
    ])
    let state = partyState(
      [makeCharacter({ id: 'a', equipment: [{ itemId: 'equipmentCase' }, { itemId: 'phaserType2' }] })],
      map,
    )
    const caseId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'equipmentCase')
    const phaserId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'phaserType2')
    state = dropItem(state, { instanceId: caseId, position: { x: 1.25, y: 1.25 } })
    assert.deepEqual(state.groundItems[caseId].support, { kind: 'tile', tile: { x: 1, y: 1 } })
    const casePos = state.groundItems[caseId].position
    state = dropItem(state, { instanceId: phaserId, position: { x: casePos.x - 0.2, y: casePos.y - 0.2 } })
    assert.equal(state.groundItems[phaserId].support.kind, 'item')
    assert.equal(state.groundItems[phaserId].support.instanceId, caseId)
    assert.ok(zOf(state, state.groundItems[phaserId]) > zOf(state, state.groundItems[caseId]))
  })
})

describe('supportAtBoard (iso tabletop hit)', () => {
  it('a point on the back of a ground box stays on that box', () => {
    const map = mapWith([
      ['floor', 'floor', 'floor', 'floor'],
      ['floor', 'floor', 'floor', 'floor'],
      ['floor', 'floor', 'floor', 'floor'],
      ['floor', 'floor', 'floor', 'floor'],
    ])
    let state = partyState(
      [makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }, { itemId: 'standardTricorder' }] })],
      map,
    )
    const medkitId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'medkit')
    const tricorderId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'standardTricorder')
    state = dropItem(state, { instanceId: medkitId, position: { x: 2, y: 2 } })
    const medkit = state.groundItems[medkitId]
    const surface = surfaceOfItem('medkit')
    const foot = surface.footprint
    const center = { x: medkit.position.x - foot.width / 2, y: medkit.position.y - foot.depth / 2 }
    const c = project(center)
    const halfH = (TILE_H / 2) * foot.depth
    // Near the back tip of the lid. On the floor plane that point is the cell behind the box.
    const boardPoint = { x: c.x, y: c.y - surface.topZ - 0.9 * halfH }
    const onStand = unproject(boardPoint)
    assert.equal(pointInFootprint(onStand, medkit.position, foot), false)
    const place = canPlaceOn(state, { x: 0, y: 0 }, { boardPoint, itemId: 'standardTricorder', category: 'scanner' })
    assert.ok(place.ok, place.reason)
    assert.equal(place.support?.kind, 'item')
    assert.equal(place.support.instanceId, medkitId)
    state = dropItem(state, { instanceId: tricorderId, position: place.position, support: place.support, boardPoint })
    const dropped = state.groundItems[tricorderId]
    assert.ok(groundItemDepth(state, dropped) > groundItemDepth(state, state.groundItems[medkitId]))
  })

  it('hits a table when the pointer is on the raised top, not the floor behind it', () => {
    const map = mapWith([
      ['floor', 'floor', 'floor'],
      ['floor', 'table', 'floor'],
      ['floor', 'floor', 'floor'],
    ])
    const state = partyState([makeCharacter({ id: 'a', equipment: [] })], map)
    const topZ = surfaceOfTile('table').topZ
    assert.equal(topZ, 11)
    // Screen centre of the tabletop = project(table) shifted up by topZ.
    const centre = project({ x: 1, y: 1 })
    const boardPoint = { x: centre.x, y: centre.y - topZ }
    const support = supportAtBoard(state, boardPoint)
    assert.ok(support)
    assert.equal(support.kind, 'tile')
    assert.deepEqual(support.tile, { x: 1, y: 1 })
    assert.equal(support.z, topZ)
    const place = canPlaceOn(state, { x: 2, y: 2 }, { boardPoint, category: 'weapon' })
    assert.ok(place.ok)
    assert.deepEqual(place.support, { kind: 'tile', tile: { x: 1, y: 1 } })
  })

  it('still accepts the back of a crate against a wall (screen diamond, not unproject footprint)', () => {
    const map = mapWith([
      ['bulkhead', 'bulkhead', 'bulkhead'],
      ['bulkhead', 'crate', 'bulkhead'],
      ['floor', 'floor', 'floor'],
    ])
    const state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }] })], map)
    const topZ = surfaceOfTile('crate').topZ
    const centre = project({ x: 1, y: 1 })
    // Aim near the back of the raised top (toward the wall) — unproject alone used to miss the footprint.
    const boardPoint = { x: centre.x, y: centre.y - topZ - 6 }
    const place = canPlaceOn(state, { x: 0, y: 0 }, { boardPoint, category: 'medical' })
    assert.ok(place.ok, place.reason)
    assert.deepEqual(place.support, { kind: 'tile', tile: { x: 1, y: 1 } })
  })
})

describe('approachPoint', () => {
  it('routes around a solid table to a neighbouring floor tile', () => {
    const map = mapWith([
      ['floor', 'floor', 'floor'],
      ['floor', 'table', 'floor'],
      ['floor', 'floor', 'floor'],
    ])
    const target = approachPoint(map, { x: 1, y: 1 })
    assert.ok(target.x !== 1 || target.y !== 1)
    assert.ok(!map.tiles[Math.round(target.y)][Math.round(target.x)] || map.tiles[Math.round(target.y)][Math.round(target.x)] === 'floor')
  })
})

describe('mapFormat on and stackOver', () => {
  it('round-trips elevated placements and stackOver without migrating legacy maps', () => {
    let map = mapWith([
      ['floor', 'floor', 'floor'],
      ['floor', 'crate', 'floor'],
      ['floor', 'floor', 'floor'],
    ])
    map = {
      ...map,
      id: 'Elevated Test',
      name: 'Elevated Test',
      episodeName: '',
      card: null,
      mapType: 'starshipDeck',
      biome: 'temperate',
      weather: 'clear',
      ambient: 100,
      ambientColour: '#000000',
      floorUnder: {},
      rotated: map.tiles.map((row) => row.map(() => false)),
      areas: [],
      markers: { playerStarts: [{ x: 0, y: 0 }], enemySpawns: [] },
      npcs: [],
      objectives: [],
      objects: null,
      objectPlacements: {},
      destructibles: [],
      hazards: [],
      groundItemPlacements: [],
      briefing: '',
      outro: '',
      outroAbandoned: '',
      outroFailed: '',
      stardate: null,
    }
    map = stackTileOn(map, { x: 1, y: 1 }, 'crate')
    assert.deepEqual(map.stackOver['1,1'], ['crate'])
    const placed = placeGroundItem(map, { x: 1, y: 1 }, 'phaserType2')
    assert.ok(placed)
    map = placed.map
    assert.ok(map.groundItemPlacements[0].on?.tile)
    const file = serializeMap(map)
    assert.ok(file.stackOver)
    assert.ok(file.groundItemPlacements[0].on)
    assert.equal(file.schemaVersion, 2)
    const again = parseMapFile(file, 'Elevated Test')
    assert.deepEqual(again.stackOver['1,1'], ['crate'])
    assert.deepEqual(again.groundItemPlacements[0].on.tile, [1, 1])
  })
})

describe('elevated pickup and transfer', () => {
  it('picks up an elevated item without duplicating the instance', () => {
    const map = mapWith([
      ['floor', 'floor'],
      ['floor', 'table'],
    ])
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'phaserType2' }] })], map)
    const id = state.party.members.a.character.inventory.slots.sidearm
    state = dropItem(state, { instanceId: id, position: { x: 1, y: 1 } })
    assert.ok(state.groundItems[id].support)
    state = pickupItem(state, { instanceId: id, memberId: 'a' })
    assert.equal(state.groundItems[id], undefined)
    assert.ok(state.itemInstances[id])
    assert.equal(Object.keys(state.itemInstances).filter((k) => state.itemInstances[k].itemId === 'phaserType2').length, 1)
  })

  it('moves floor → table → floor with the same instanceId', () => {
    const map = mapWith([
      ['floor', 'floor', 'floor'],
      ['floor', 'table', 'floor'],
      ['floor', 'floor', 'floor'],
    ])
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }] })], map)
    const id = Object.keys(state.itemInstances)[0]
    state = dropItem(state, { instanceId: id, position: { x: 0, y: 0 } })
    assert.equal(state.groundItems[id].support, undefined)
    state = dropItem(state, { instanceId: id, position: { x: 1, y: 1 } })
    assert.deepEqual(state.groundItems[id].support, { kind: 'tile', tile: { x: 1, y: 1 } })
    state = dropItem(state, { instanceId: id, position: { x: 2, y: 2 } })
    assert.equal(state.groundItems[id].support, undefined)
    state = transferItem(state, { instanceId: id, toMemberId: 'a' })
    assert.equal(state.groundItems[id], undefined)
    assert.ok(state.itemInstances[id])
  })
})
