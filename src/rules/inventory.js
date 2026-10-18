// Play inventory for exploration: item instances, equipment slots, bag, and ground drops.
// Videogame adaptation — STA 2e has no slot/bag UI (Core p.141 lists issue gear without inventory rules).
import { blocksMovement } from '../combat/battleMap.js'
import { tileOf } from '../exploration/navigation.js'
import { getItemById } from './equipment.js'

export const EQUIP_SLOTS = ['body', 'sidearm', 'scanner', 'communicator']
export const BAG_CAPACITY = 24
export const BAG_COLS = 6
export const BAG_ROWS = 4
// Subdivisions of one map tile for dropped-item placement (designer request: 8×8 logical grid).
export const ITEM_GRID = 8
export const ITEM_GRID_STEP = 1 / ITEM_GRID

export function snapItemPosition(point) {
  return {
    x: Math.round(point.x * ITEM_GRID) / ITEM_GRID,
    y: Math.round(point.y * ITEM_GRID) / ITEM_GRID,
  }
}

function itemGridKey(position) {
  const snapped = snapItemPosition(position)
  return `${snapped.x},${snapped.y}`
}

let nextInstanceSeq = 1
export const freshInstanceId = () => `item-${nextInstanceSeq++}`

// Reset only for tests so ids stay predictable.
export function resetInstanceIds(start = 1) {
  nextInstanceSeq = start
}

export const emptySlots = () => Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, null]))

export function emptyInventory() {
  return { slots: emptySlots(), bag: [] }
}

export const getInstance = (state, instanceId) => state.itemInstances?.[instanceId] ?? null

export function resolveItem(state, instanceId) {
  const instance = getInstance(state, instanceId)
  if (!instance) return null
  const def = getItemById(instance.itemId)
  if (!def) return null
  return { instance, def }
}

function namedRefs(instanceIds, itemInstances) {
  return instanceIds
    .map((instanceId) => {
      const record = itemInstances[instanceId]
      const def = record ? getItemById(record.itemId) : null
      return record ? { itemId: record.itemId, name: def?.name ?? record.itemId } : null
    })
    .filter(Boolean)
}

// Sync character.equipment to equipped slots only (bag is not equipment). carried lists bag names for the sheet.
export function syncEquippedEquipment(character, itemInstances) {
  const inventory = character.inventory ?? emptyInventory()
  const equipment = namedRefs(
    EQUIP_SLOTS.map((slot) => inventory.slots[slot]).filter(Boolean),
    itemInstances,
  )
  const carried = namedRefs(inventory.bag, itemInstances)
  return { ...character, inventory, equipment, carried }
}

function withMemberCharacter(state, memberId, character) {
  const member = state.party.members[memberId]
  if (!member) return state
  return {
    ...state,
    party: {
      ...state.party,
      members: { ...state.party.members, [memberId]: { ...member, character } },
    },
  }
}

function findOwner(state, instanceId) {
  if (state.groundItems?.[instanceId]) return { kind: 'ground', instanceId }
  for (const memberId of state.party.memberIds) {
    const inventory = state.party.members[memberId].character.inventory
    if (!inventory) continue
    for (const slot of EQUIP_SLOTS) {
      if (inventory.slots[slot] === instanceId) return { kind: 'slot', memberId, slot, instanceId }
    }
    const bagIndex = inventory.bag.indexOf(instanceId)
    if (bagIndex >= 0) return { kind: 'bag', memberId, bagIndex, instanceId }
  }
  return null
}

function takeInstance(state, instanceId) {
  const owner = findOwner(state, instanceId)
  if (!owner) return null
  if (owner.kind === 'ground') {
    const groundItems = { ...state.groundItems }
    delete groundItems[instanceId]
    return { state: { ...state, groundItems }, owner: { ...owner, instanceId } }
  }
  const member = state.party.members[owner.memberId]
  const inventory = { ...member.character.inventory, slots: { ...member.character.inventory.slots }, bag: [...member.character.inventory.bag] }
  if (owner.kind === 'slot') inventory.slots[owner.slot] = null
  else inventory.bag = inventory.bag.filter((id) => id !== instanceId)
  const character = syncEquippedEquipment({ ...member.character, inventory }, state.itemInstances)
  return { state: withMemberCharacter(state, owner.memberId, character), owner: { ...owner, instanceId } }
}

export function bagFreeSlots(character) {
  const bag = character.inventory?.bag ?? []
  return Math.max(0, BAG_CAPACITY - bag.length)
}

export function canEquipToSlot(state, instanceId, slot) {
  if (!EQUIP_SLOTS.includes(slot)) return { ok: false, reason: 'Unknown slot.' }
  const resolved = resolveItem(state, instanceId)
  if (!resolved) return { ok: false, reason: 'Unknown item.' }
  if (resolved.def.equipSlot !== slot) return { ok: false, reason: `Does not fit the ${slot} slot.` }
  return { ok: true }
}

// Walkable floor under a point, snapped to the 8×8 item grid. Small drops never block movement/pathfinding.
// excludeInstanceId: when repositioning a ground item, ignore its current cell.
export function canPlaceAt(state, position, { excludeInstanceId = null } = {}) {
  const map = state.party.map
  const snapped = snapItemPosition(position)
  const tile = tileOf(snapped)
  if (tile.x < 0 || tile.y < 0 || tile.y >= map.height || tile.x >= map.width) {
    return { ok: false, reason: 'Off the map.', position: snapped, tile }
  }
  if (blocksMovement(map, tile)) return { ok: false, reason: 'Blocked.', position: snapped, tile }
  const key = itemGridKey(snapped)
  const occupied = Object.values(state.groundItems ?? {}).some((entry) => {
    if (excludeInstanceId && entry.instanceId === excludeInstanceId) return false
    return itemGridKey(entry.position) === key
  })
  if (occupied) return { ok: false, reason: 'Already an item here.', position: snapped, tile }
  return { ok: true, position: snapped, tile }
}

// Expand one member's flat equipment list into instances/slots/bag (used for transporter beam-in mid-mission).
export function seedMemberInventory(state, memberId, { grantMissionObject = false } = {}) {
  const member = state.party.members[memberId]
  if (!member || member.character.inventory) return state
  let itemInstances = { ...state.itemInstances }
  const inventory = emptyInventory()
  for (const entry of member.character.equipment ?? []) {
    const def = getItemById(entry.itemId)
    if (!def) continue
    const id = freshInstanceId()
    itemInstances[id] = { id, itemId: def.id, quantity: 1 }
    const slot = def.equipSlot
    if (slot && EQUIP_SLOTS.includes(slot) && !inventory.slots[slot]) inventory.slots[slot] = id
    else if (inventory.bag.length < BAG_CAPACITY) inventory.bag.push(id)
  }
  if (grantMissionObject && getItemById('missionObject') && inventory.bag.length < BAG_CAPACITY) {
    const id = freshInstanceId()
    itemInstances[id] = { id, itemId: 'missionObject', quantity: 1 }
    inventory.bag.push(id)
  }
  const character = syncEquippedEquipment({ ...member.character, inventory }, itemInstances)
  return withMemberCharacter({ ...state, itemInstances }, memberId, character)
}

// Expand each party member's flat equipment into instances, slots, and bag. Adds one missionObject to the lead bag.
export function seedPartyInventory(state) {
  let itemInstances = { ...(state.itemInstances ?? {}) }
  let next = { ...state, itemInstances, groundItems: { ...(state.groundItems ?? {}) } }
  const members = { ...next.party.members }

  for (const memberId of next.party.memberIds) {
    const member = members[memberId]
    const inventory = emptyInventory()
    for (const entry of member.character.equipment ?? []) {
      const def = getItemById(entry.itemId)
      if (!def) continue
      const id = freshInstanceId()
      itemInstances[id] = { id, itemId: def.id, quantity: 1 }
      const slot = def.equipSlot
      if (slot && EQUIP_SLOTS.includes(slot) && !inventory.slots[slot]) inventory.slots[slot] = id
      else if (inventory.bag.length < BAG_CAPACITY) inventory.bag.push(id)
    }
    const character = syncEquippedEquipment({ ...member.character, inventory }, itemInstances)
    members[memberId] = { ...member, character }
  }

  // Playtest seed: one mission object on the lead character's bag when space allows.
  const leaderId = next.party.leaderId
  if (leaderId && getItemById('missionObject')) {
    const leader = members[leaderId]
    if (leader.character.inventory.bag.length < BAG_CAPACITY) {
      const id = freshInstanceId()
      itemInstances[id] = { id, itemId: 'missionObject', quantity: 1 }
      leader.character = {
        ...leader.character,
        inventory: { ...leader.character.inventory, bag: [...leader.character.inventory.bag, id] },
      }
      members[leaderId] = { ...leader, character: leader.character }
    }
  }

  return {
    ...next,
    itemInstances,
    groundItems: {},
    party: { ...next.party, members },
  }
}

export function equipItem(state, { memberId, instanceId, slot }) {
  const check = canEquipToSlot(state, instanceId, slot)
  if (!check.ok) return state
  const member = state.party.members[memberId]
  if (!member?.character.inventory) return state
  const taken = takeInstance(state, instanceId)
  if (!taken) return state
  let next = taken.state
  const target = next.party.members[memberId]
  const inventory = { ...target.character.inventory, slots: { ...target.character.inventory.slots }, bag: [...target.character.inventory.bag] }
  const displaced = inventory.slots[slot]
  inventory.slots[slot] = instanceId
  if (displaced && displaced !== instanceId) {
    if (inventory.bag.length >= BAG_CAPACITY) return state
    inventory.bag.push(displaced)
  }
  const character = syncEquippedEquipment({ ...target.character, inventory }, next.itemInstances)
  return withMemberCharacter(next, memberId, character)
}

export function unequipItem(state, { memberId, slot }) {
  const member = state.party.members[memberId]
  const instanceId = member?.character.inventory?.slots?.[slot]
  if (!instanceId) return state
  if (bagFreeSlots(member.character) < 1) return state
  const inventory = { ...member.character.inventory, slots: { ...member.character.inventory.slots }, bag: [...member.character.inventory.bag] }
  inventory.slots[slot] = null
  inventory.bag.push(instanceId)
  const character = syncEquippedEquipment({ ...member.character, inventory }, state.itemInstances)
  return withMemberCharacter(state, memberId, character)
}

export function moveToBag(state, { memberId, instanceId }) {
  const member = state.party.members[memberId]
  if (!member?.character.inventory) return state
  const owner = findOwner(state, instanceId)
  if (!owner) return state
  if (owner.kind === 'bag' && owner.memberId === memberId) return state
  if (owner.kind === 'slot' && owner.memberId === memberId) {
    return unequipItem(state, { memberId, slot: owner.slot })
  }
  if (bagFreeSlots(member.character) < 1) return state
  const taken = takeInstance(state, instanceId)
  if (!taken) return state
  let next = taken.state
  const target = next.party.members[memberId]
  const inventory = { ...target.character.inventory, slots: { ...target.character.inventory.slots }, bag: [...target.character.inventory.bag, instanceId] }
  const character = syncEquippedEquipment({ ...target.character, inventory }, next.itemInstances)
  return withMemberCharacter(next, memberId, character)
}

export function transferItem(state, { instanceId, toMemberId, toSlot = null }) {
  const target = state.party.members[toMemberId]
  if (!target?.character.inventory) return state
  if (toSlot) {
    const check = canEquipToSlot(state, instanceId, toSlot)
    if (!check.ok) return moveToBag(state, { memberId: toMemberId, instanceId })
    return equipItem(state, { memberId: toMemberId, instanceId, slot: toSlot })
  }
  return moveToBag(state, { memberId: toMemberId, instanceId })
}

export function dropItem(state, { instanceId, position }) {
  const place = canPlaceAt(state, position, { excludeInstanceId: instanceId })
  if (!place.ok) return state
  const taken = takeInstance(state, instanceId)
  if (!taken) return state
  return {
    ...taken.state,
    groundItems: {
      ...taken.state.groundItems,
      [instanceId]: { instanceId, position: { x: place.position.x, y: place.position.y } },
    },
  }
}

export function pickupItem(state, { instanceId, memberId }) {
  const ground = state.groundItems?.[instanceId]
  if (!ground) return state
  const member = state.party.members[memberId]
  if (!member?.character.inventory || bagFreeSlots(member.character) < 1) return state
  const groundItems = { ...state.groundItems }
  delete groundItems[instanceId]
  const inventory = {
    ...member.character.inventory,
    slots: { ...member.character.inventory.slots },
    bag: [...member.character.inventory.bag, instanceId],
  }
  const next = { ...state, groundItems }
  const character = syncEquippedEquipment({ ...member.character, inventory }, next.itemInstances)
  return withMemberCharacter(next, memberId, character)
}

export function groundItemViews(state, { hideInstanceId = null } = {}) {
  return Object.values(state.groundItems ?? {})
    .filter((entry) => entry.instanceId !== hideInstanceId)
    .map((entry) => {
      const resolved = resolveItem(state, entry.instanceId)
      return {
        id: entry.instanceId,
        instanceId: entry.instanceId,
        position: entry.position,
        name: resolved?.def.name ?? 'Item',
        itemId: resolved?.instance.itemId ?? null,
        category: resolved?.def.category ?? null,
        // Isometric world prop PNG; never the inventory icon. Falls back to crate tile art.
        worldImage: resolved?.def.worldImage ?? null,
        worldTile: resolved?.def.worldTile ?? 'crate',
        // Fraction of a 64×96 tile image; handheld gear is much smaller than a character (40×64 frames).
        worldScale: resolved?.def.worldScale ?? 0.4,
        icon: resolved?.def.icon ?? null,
      }
    })
}
