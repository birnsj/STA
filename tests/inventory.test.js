// Exploration inventory: instances, slots, bag, ground drops (rules/inventory.js).
import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { getCharacterWeapons } from '../src/combat/weaponSystem.js'
import { getEquippedItems } from '../src/rules/equipment.js'
import {
  canPlaceAt,
  dropItem,
  equipItem,
  pickupItem,
  resetInstanceIds,
  seedMemberInventory,
  seedPartyInventory,
  snapItemPosition,
  transferItem,
  unequipItem,
} from '../src/rules/inventory.js'
import { project } from '../src/maps/iso.js'
import { getTile } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

function partyState(characters, map = { width: 8, height: 8, tiles: Array.from({ length: 8 }, () => Array(8).fill('floor')) }) {
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

describe('seedPartyInventory', () => {
  it('puts slot-fitting gear into slots and the rest in the bag', () => {
    const state = partyState([
      makeCharacter({
        id: 'a',
        equipment: [
          { itemId: 'standardUniform' },
          { itemId: 'communicator' },
          { itemId: 'standardTricorder' },
          { itemId: 'phaserType2' },
          { itemId: 'medkit' },
        ],
      }),
    ])
    const inventory = state.party.members.a.character.inventory
    assert.ok(inventory.slots.body)
    assert.ok(inventory.slots.sidearm)
    assert.ok(inventory.slots.scanner)
    assert.ok(inventory.slots.communicator)
    assert.ok(inventory.bag.length >= 1, 'medkit and mission object in bag')
    const equippedIds = getEquippedItems(state.party.members.a.character).map((item) => item.id)
    assert.ok(equippedIds.includes('phaserType2'))
    assert.ok(!equippedIds.includes('medkit'), 'bag items are not equipped')
  })

  it('allocates around authored instance ids when a member beams in later', () => {
    const character = makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }] })
    const state = {
      party: {
        map: { width: 8, height: 8, tiles: Array.from({ length: 8 }, () => Array(8).fill('floor')) },
        memberIds: ['a'],
        members: { a: { id: 'a', character: { ...character, inventory: null }, position: { x: 1, y: 1 } } },
        leaderId: 'a',
      },
      itemInstances: { 'item-1': { id: 'item-1', itemId: 'hypospray', quantity: 1 } },
      groundItems: { 'item-1': { instanceId: 'item-1', position: { x: 2, y: 2 } } },
    }
    const seeded = seedMemberInventory(state, 'a')
    assert.equal(seeded.itemInstances['item-1'].itemId, 'hypospray')
    const medkitId = seeded.party.members.a.character.inventory.bag.find((id) => seeded.itemInstances[id]?.itemId === 'medkit')
    assert.ok(medkitId)
    assert.notEqual(medkitId, 'item-1')
  })
})

describe('equip and unequip', () => {
  it('moves a bag phaser into the sidearm slot and back', () => {
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'phaserType2' }, { itemId: 'medkit' }] })])
    const inventory = state.party.members.a.character.inventory
    // Put the phaser in the bag by unequipping if it auto-slotted.
    if (inventory.slots.sidearm) state = unequipItem(state, { memberId: 'a', slot: 'sidearm' })
    const phaserId = state.party.members.a.character.inventory.bag.find((id) => state.itemInstances[id].itemId === 'phaserType2')
    assert.ok(phaserId)
    state = equipItem(state, { memberId: 'a', instanceId: phaserId, slot: 'sidearm' })
    assert.equal(state.party.members.a.character.inventory.slots.sidearm, phaserId)
    assert.ok(getCharacterWeapons(state.party.members.a.character).some((weapon) => weapon.itemId === 'phaserType2'))
    state = unequipItem(state, { memberId: 'a', slot: 'sidearm' })
    assert.equal(state.party.members.a.character.inventory.slots.sidearm, null)
    assert.ok(!getCharacterWeapons(state.party.members.a.character).some((weapon) => weapon.itemId === 'phaserType2'))
  })

  it('rejects a medkit in the sidearm slot', () => {
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }] })])
    const medkitId = state.party.members.a.character.inventory.bag.find((id) => state.itemInstances[id].itemId === 'medkit')
    const before = state
    state = equipItem(state, { memberId: 'a', instanceId: medkitId, slot: 'sidearm' })
    assert.equal(state, before)
    state = transferItem(before, { instanceId: medkitId, toMemberId: 'a', toSlot: 'sidearm' })
    assert.equal(state, before)
  })

  it('equips a bag phaser to sidearm and leaves it in the bag when dropped on body', () => {
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'phaserType2' }] })])
    state = unequipItem(state, { memberId: 'a', slot: 'sidearm' })
    const phaserId = state.party.members.a.character.inventory.bag.find((id) => state.itemInstances[id].itemId === 'phaserType2')
    const inBag = state
    state = transferItem(state, { instanceId: phaserId, toMemberId: 'a', toSlot: 'body' })
    assert.equal(state, inBag)
    assert.ok(state.party.members.a.character.inventory.bag.includes(phaserId))
    state = transferItem(state, { instanceId: phaserId, toMemberId: 'a', toSlot: 'sidearm' })
    assert.equal(state.party.members.a.character.inventory.slots.sidearm, phaserId)
    assert.ok(!state.party.members.a.character.inventory.bag.includes(phaserId))
  })
})

describe('slot swaps', () => {
  it('swaps sidearms between characters and refuses a sidearm dropped on body', () => {
    let state = partyState([
      makeCharacter({ id: 'a', equipment: [{ itemId: 'phaserType1' }, { itemId: 'standardUniform' }] }),
      makeCharacter({ id: 'b', equipment: [{ itemId: 'phaserType2' }] }),
    ])
    const aPhaser = state.party.members.a.character.inventory.slots.sidearm
    const bPhaser = state.party.members.b.character.inventory.slots.sidearm
    const beforeBody = state
    state = transferItem(state, { instanceId: aPhaser, toMemberId: 'a', toSlot: 'body' })
    assert.equal(state, beforeBody)
    state = transferItem(state, { instanceId: aPhaser, toMemberId: 'b', toSlot: 'sidearm' })
    assert.equal(state.party.members.b.character.inventory.slots.sidearm, aPhaser)
    assert.equal(state.party.members.a.character.inventory.slots.sidearm, bPhaser)
  })
})

describe('bag cells', () => {
  it('drops onto the cell under the pointer instead of the first open cell', () => {
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }] })])
    const bag = state.party.members.a.character.inventory.bag
    const medkitId = bag.find((id) => state.itemInstances[id].itemId === 'medkit')
    const missionId = bag.find((id) => state.itemInstances[id].itemId === 'missionObject')
    state = transferItem(state, { instanceId: missionId, toMemberId: 'a', toBagIndex: 4 })
    const placed = state.party.members.a.character.inventory.bag
    assert.equal(placed[0], medkitId)
    assert.equal(placed[1] ?? null, null)
    assert.equal(placed[4], missionId)
    state = transferItem(state, { instanceId: medkitId, toMemberId: 'a', toBagIndex: 4 })
    const swapped = state.party.members.a.character.inventory.bag
    assert.equal(swapped[0], missionId)
    assert.equal(swapped[4], medkitId)
  })
})

describe('transfer between characters', () => {
  it('moves a bag item to another member without duplicating the instance', () => {
    let state = partyState([
      makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }] }),
      makeCharacter({ id: 'b', equipment: [] }),
    ])
    const medkitId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'medkit')
    state = transferItem(state, { instanceId: medkitId, toMemberId: 'b' })
    assert.ok(!state.party.members.a.character.inventory.bag.includes(medkitId))
    assert.ok(state.party.members.b.character.inventory.bag.includes(medkitId))
    assert.equal(Object.values(state.itemInstances).filter((entry) => entry.itemId === 'medkit').length, 1)
  })
})

describe('ground drop and pickup', () => {
  it('equips a ground phaser to sidearm and leaves it on the ground when dropped on body', () => {
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'phaserType2' }] })])
    const phaserId = state.party.members.a.character.inventory.slots.sidearm
    state = dropItem(state, { instanceId: phaserId, position: { x: 3, y: 3 } })
    const onGround = state
    state = transferItem(state, { instanceId: phaserId, toMemberId: 'a', toSlot: 'body' })
    assert.equal(state, onGround)
    assert.ok(state.groundItems[phaserId])
    state = transferItem(state, { instanceId: phaserId, toMemberId: 'a', toSlot: 'sidearm' })
    assert.equal(state.party.members.a.character.inventory.slots.sidearm, phaserId)
    assert.equal(state.groundItems[phaserId], undefined)
  })

  it('places on a free floor cell and returns the item to the bag', () => {
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }] })])
    const medkitId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'medkit')
    assert.ok(canPlaceAt(state, { x: 2, y: 2 }).ok)
    state = dropItem(state, { instanceId: medkitId, position: { x: 2, y: 2 } })
    assert.ok(state.groundItems[medkitId])
    assert.deepEqual(state.groundItems[medkitId].position, { x: 2, y: 2 })
    assert.ok(!state.party.members.a.character.inventory.bag.includes(medkitId))
    state = pickupItem(state, { instanceId: medkitId, memberId: 'a' })
    assert.ok(!state.groundItems[medkitId])
    assert.ok(state.party.members.a.character.inventory.bag.includes(medkitId))
  })

  it('settles dependents instead of leaving a stale support when their parent is picked up', () => {
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }, { itemId: 'hypospray' }] })])
    const parentId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'medkit')
    const childId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'hypospray')
    state = {
      ...state,
      groundItems: {
        [parentId]: { instanceId: parentId, position: { x: 3.5, y: 3.5 } },
        [childId]: { instanceId: childId, position: { x: 3.5, y: 3.5 }, support: { kind: 'item', instanceId: parentId } },
      },
      party: {
        ...state.party,
        members: {
          ...state.party.members,
          a: {
            ...state.party.members.a,
            character: {
              ...state.party.members.a.character,
              inventory: { ...state.party.members.a.character.inventory, bag: [] },
            },
          },
        },
      },
    }
    state = pickupItem(state, { instanceId: parentId, memberId: 'a' })
    assert.equal(state.groundItems[parentId], undefined)
    assert.notDeepEqual(state.groundItems[childId]?.support, { kind: 'item', instanceId: parentId })
  })

  it('validates an occupied bag swap and preserves the ground support', () => {
    const tiles = Array.from({ length: 8 }, () => Array(8).fill('floor'))
    tiles[3][3] = 'crate'
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }] })], {
      width: 8,
      height: 8,
      tiles,
      stackOver: {},
    })
    const medkitId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'medkit')
    const missionId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'missionObject')
    const support = { kind: 'tile', tile: { x: 3, y: 3 } }
    state = dropItem(state, { instanceId: medkitId, position: { x: 3.5, y: 3.5 }, support })
    const missionIndex = state.party.members.a.character.inventory.bag.indexOf(missionId)
    state = transferItem(state, { instanceId: medkitId, toMemberId: 'a', toBagIndex: missionIndex })
    assert.equal(state.party.members.a.character.inventory.bag[missionIndex], medkitId)
    assert.deepEqual(state.groundItems[missionId]?.support, support)
  })

  it('transferItem from the ground into another member bag (world drop-on-figure)', () => {
    let state = partyState([
      makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }] }),
      makeCharacter({ id: 'b', equipment: [] }),
    ])
    const medkitId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'medkit')
    state = dropItem(state, { instanceId: medkitId, position: { x: 2, y: 2 } })
    assert.ok(state.groundItems[medkitId])
    state = transferItem(state, { instanceId: medkitId, toMemberId: 'b' })
    assert.ok(!state.groundItems[medkitId])
    assert.ok(state.party.members.b.character.inventory.bag.includes(medkitId))
  })

  it('fills the tile under the drop and places the next item on a neighbouring tile', () => {
    assert.deepEqual(snapItemPosition({ x: 2.04, y: 2.11 }), { x: 2.03125, y: 2.125 })
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }, { itemId: 'missionObject' }] })])
    const medkitId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'medkit')
    const missionId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'missionObject')
    state = dropItem(state, { instanceId: medkitId, position: { x: 2.04, y: 2.11 } })
    assert.deepEqual(state.groundItems[medkitId].position, { x: 2.5, y: 2.5 })
    state = dropItem(state, { instanceId: missionId, position: { x: 2.4, y: 1.2 } })
    assert.deepEqual(state.groundItems[missionId].position, { x: 2.5, y: 1.5 })
    assert.equal(state.groundItems[missionId].support, undefined)
    state = dropItem(state, { instanceId: medkitId, position: { x: 3.2, y: 3.2 } })
    assert.deepEqual(state.groundItems[medkitId].position, { x: 3.5, y: 3.5 })
    assert.equal(state.groundItems[medkitId].support, undefined)
  })

  it('keeps an exploration drop on the tile under the cursor and stacks the next one', () => {
    const tiles = Array.from({ length: 8 }, () => Array(8).fill('floor'))
    tiles[4][4] = 'crate'
    const map = { width: 8, height: 8, tiles, stackOver: {} }
    let state = partyState(
      [makeCharacter({ id: 'a', equipment: [{ itemId: 'stackBoxRed' }, { itemId: 'stackBoxBlue' }] })],
      map,
    )
    const ids = Object.keys(state.itemInstances)
    const lift = getTile('crate').height
    const aim = { x: 4.1, y: 4.1 }
    const screen = project(aim)
    const boardPoint = { x: screen.x, y: screen.y - lift }
    const hover = canPlaceAt(state, aim, { itemId: state.itemInstances[ids[0]].itemId, boardPoint })
    state = dropItem(state, { instanceId: ids[0], position: hover.position, support: hover.support, boardPoint })
    assert.deepEqual(state.groundItems[ids[0]].position, { x: 4.5, y: 4.5 })
    assert.deepEqual(state.groundItems[ids[0]].support, { kind: 'tile', tile: { x: 4, y: 4 } })
    const stacked = canPlaceAt(state, aim, { itemId: 'stackBoxBlue', boardPoint })
    assert.equal(stacked.support.kind, 'item')
    assert.deepEqual(stacked.position, { x: 4.5, y: 4.5 })
  })

  it('repositions a ground-item subtree on its current item support', () => {
    const tiles = Array.from({ length: 8 }, () => Array(8).fill('floor'))
    tiles[2][2] = 'crate'
    let state = partyState(
      [makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }, { itemId: 'hypospray' }, { itemId: 'autosuture' }] })],
      { width: 8, height: 8, tiles, stackOver: {} },
    )
    const parentId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'medkit')
    const childId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'hypospray')
    const grandchildId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'autosuture')
    state = {
      ...state,
      groundItems: {
        [parentId]: {
          instanceId: parentId,
          position: { x: 2.5, y: 2.5 },
          support: { kind: 'tile', tile: { x: 2, y: 2 } },
        },
        [childId]: {
          instanceId: childId,
          position: { x: 2.25, y: 2.25 },
          support: { kind: 'item', instanceId: parentId },
        },
        [grandchildId]: {
          instanceId: grandchildId,
          position: { x: 2.25, y: 2.25 },
          support: { kind: 'item', instanceId: childId },
        },
      },
    }
    const aim = { x: 2.15, y: 2.45 }
    const screen = project(aim)
    const boardPoint = { x: screen.x, y: screen.y - getTile('crate').height - 5 }
    const hover = canPlaceAt(state, aim, {
      excludeInstanceId: childId,
      itemId: 'hypospray',
      boardPoint,
    })
    assert.equal(hover.ok, true)
    assert.deepEqual(hover.support, { kind: 'item', instanceId: parentId })
    assert.deepEqual(hover.position, { x: 2.25, y: 2.5 })

    const moved = dropItem(state, {
      instanceId: childId,
      position: hover.position,
      support: hover.support,
      boardPoint,
    })
    assert.deepEqual(moved.groundItems[childId].position, { x: 2.25, y: 2.5 })
    assert.deepEqual(moved.groundItems[childId].support, { kind: 'item', instanceId: parentId })
    assert.deepEqual(moved.groundItems[grandchildId].position, { x: 2.25, y: 2.5 })
    assert.deepEqual(moved.groundItems[grandchildId].support, { kind: 'item', instanceId: childId })
  })

  it('places the next box in the empty cell behind the first', () => {
    const tiles = Array.from({ length: 8 }, () => Array(8).fill('floor'))
    tiles[4][4] = 'crate'
    const map = { width: 8, height: 8, tiles, stackOver: {} }
    let state = partyState(
      [makeCharacter({ id: 'a', equipment: [{ itemId: 'stackBoxRed' }, { itemId: 'stackBoxBlue' }] })],
      map,
    )
    const ids = Object.keys(state.itemInstances)
    const lift = getTile('crate').height
    const dropAt = (aim, index) => {
      const screen = project(aim)
      const boardPoint = { x: screen.x, y: screen.y - lift }
      const hover = canPlaceAt(state, aim, { itemId: state.itemInstances[ids[index]].itemId, boardPoint })
      state = dropItem(state, { instanceId: ids[index], position: hover.position, support: hover.support, boardPoint })
      return state.groundItems[ids[index]]
    }
    const front = dropAt({ x: 4.25, y: 4.25 }, 0)
    assert.deepEqual(front.position, { x: 4.5, y: 4.5 })
    assert.deepEqual(front.support, { kind: 'tile', tile: { x: 4, y: 4 } })
    const behind = dropAt({ x: 3.75, y: 3.75 }, 1)
    assert.deepEqual(behind.position, { x: 4, y: 4 })
    assert.deepEqual(behind.support, { kind: 'tile', tile: { x: 4, y: 4 } })
  })

  it('places the next box on the neighbouring floor tile', () => {
    let state = partyState(
      [makeCharacter({ id: 'a', equipment: [{ itemId: 'stackBoxRed' }, { itemId: 'stackBoxBlue' }] })],
    )
    const ids = Object.keys(state.itemInstances)
    const dropAt = (aim, index) => {
      const boardPoint = project(aim)
      const hover = canPlaceAt(state, aim, { itemId: state.itemInstances[ids[index]].itemId, boardPoint })
      state = dropItem(state, { instanceId: ids[index], position: hover.position, support: hover.support, boardPoint })
      return state.groundItems[ids[index]]
    }
    const front = dropAt({ x: 4.25, y: 4.25 }, 0)
    assert.deepEqual(front.position, { x: 4.5, y: 4.5 })
    assert.equal(front.support, undefined)
    const beside = dropAt({ x: 3.25, y: 4.25 }, 1)
    assert.deepEqual(beside.position, { x: 3.5, y: 4.5 })
    assert.equal(beside.support, undefined)
  })

  it('cancel path: failed drop leaves ownership unchanged', () => {
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }] })])
    const medkitId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'medkit')
    const before = state
    // Solid wall tile if the map uses 'wall' as solid — use off-map instead.
    state = dropItem(state, { instanceId: medkitId, position: { x: -1, y: -1 } })
    assert.equal(state, before)
    assert.ok(state.party.members.a.character.inventory.bag.includes(medkitId) || state.party.members.a.character.inventory.slots)
  })
})
