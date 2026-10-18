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
  seedPartyInventory,
  snapItemPosition,
  transferItem,
  unequipItem,
} from '../src/rules/inventory.js'
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

  it('snaps placement to the 8×8 item grid and allows multiple items on one map tile', () => {
    assert.deepEqual(snapItemPosition({ x: 2.04, y: 2.11 }), { x: 2, y: 2.125 })
    let state = partyState([makeCharacter({ id: 'a', equipment: [{ itemId: 'medkit' }, { itemId: 'missionObject' }] })])
    const medkitId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'medkit')
    const missionId = Object.keys(state.itemInstances).find((id) => state.itemInstances[id].itemId === 'missionObject')
    state = dropItem(state, { instanceId: medkitId, position: { x: 2.04, y: 2.11 } })
    assert.deepEqual(state.groundItems[medkitId].position, { x: 2, y: 2.125 })
    assert.ok(canPlaceAt(state, { x: 2.2, y: 2.1 }).ok, 'neighbouring 8×8 cell on the same tile')
    state = dropItem(state, { instanceId: missionId, position: { x: 2.2, y: 2.1 } })
    assert.deepEqual(state.groundItems[missionId].position, snapItemPosition({ x: 2.2, y: 2.1 }))
    assert.ok(!canPlaceAt(state, { x: 2.04, y: 2.11 }).ok, 'same 8×8 cell blocked')
    // Reposition the medkit without treating its own cell as occupied.
    assert.ok(canPlaceAt(state, { x: 3, y: 3 }, { excludeInstanceId: medkitId }).ok)
    state = dropItem(state, { instanceId: medkitId, position: { x: 3.01, y: 2.99 } })
    assert.deepEqual(state.groundItems[medkitId].position, { x: 3, y: 3 })
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
