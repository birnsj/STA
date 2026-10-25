// Play inventory for exploration: item instances, equipment slots, bag, and ground drops.
// Videogame adaptation — STA 2e has no slot/bag UI (Core p.141 lists issue gear without inventory rules).
import { getItemById } from './equipment.js'
import { snapItemPosition } from './itemGrid.js'
import {
  canPlaceOn,
  groundItemDepth,
  itemSupportChain,
  propSpriteSize,
  surfaceOfItem,
  tileSurfaceAt,
  zOf,
} from './placement.js'

export const EQUIP_SLOTS = ['body', 'sidearm', 'scanner', 'communicator']
export const BAG_COLS = 6
export const BAG_ROWS = 8
export const BAG_CAPACITY = BAG_COLS * BAG_ROWS
// How many bag rows stay visible in the inventory window; the rest scroll.
export const BAG_VISIBLE_ROWS = 4
export { ITEM_CELL_PX, ITEM_GRID, snapItemPosition } from './itemGrid.js'

let nextInstanceSeq = 1
export function freshInstanceId(used = null) {
  let id
  do {
    id = `item-${nextInstanceSeq++}`
  } while (used instanceof Set ? used.has(id) : used?.[id])
  return id
}

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
    return { state: resolveGroundSupports({ ...state, groundItems }), owner: { ...owner, instanceId } }
  }
  const member = state.party.members[owner.memberId]
  const inventory = { ...member.character.inventory, slots: { ...member.character.inventory.slots }, bag: [...member.character.inventory.bag] }
  if (owner.kind === 'slot') inventory.slots[owner.slot] = null
  else inventory.bag = inventory.bag.map((id, index) => (index === owner.bagIndex ? null : id))
  const character = syncEquippedEquipment({ ...member.character, inventory }, state.itemInstances)
  return { state: withMemberCharacter(state, owner.memberId, character), owner: { ...owner, instanceId } }
}

export function bagUsedCount(bag = []) {
  return bag.filter(Boolean).length
}

export function bagFreeSlots(character) {
  return Math.max(0, BAG_CAPACITY - bagUsedCount(character.inventory?.bag))
}

function firstFreeBagIndex(bag) {
  for (let index = 0; index < BAG_CAPACITY; index += 1) {
    if (!bag[index]) return index
  }
  return -1
}

// Bag cells keep their index, including holes, so a drop lands on the cell under the pointer.
function assignBagIndex(bag, index, instanceId) {
  const next = [...bag]
  while (next.length <= index) next.push(null)
  next[index] = instanceId
  return next
}

export function canEquipToSlot(state, instanceId, slot) {
  if (!EQUIP_SLOTS.includes(slot)) return { ok: false, reason: 'Unknown slot.' }
  const resolved = resolveItem(state, instanceId)
  if (!resolved) return { ok: false, reason: 'Unknown item.' }
  if (resolved.def.equipSlot !== slot) return { ok: false, reason: `Does not fit the ${slot} slot.` }
  return { ok: true }
}

// Walkable floor or an accepting support surface under a point, snapped to the 32×32 item grid.
// Small floor drops never block movement/pathfinding. Elevated drops sit on tile/item surfaces (placement.js).
// excludeInstanceId: when repositioning a ground item, ignore its current cell.
// Optional category: when set, surface.accepts is checked (drag path passes the dragged item's category).
export function canPlaceAt(state, position, { excludeInstanceId = null, category = null, boardPoint = null, itemId = null } = {}) {
  return canPlaceOn(state, position, { excludeInstanceId, category, boardPoint, itemId })
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
    const id = freshInstanceId(itemInstances)
    itemInstances[id] = { id, itemId: def.id, quantity: 1 }
    const slot = def.equipSlot
    if (slot && EQUIP_SLOTS.includes(slot) && !inventory.slots[slot]) inventory.slots[slot] = id
    else if (inventory.bag.length < BAG_CAPACITY) inventory.bag.push(id)
  }
  if (grantMissionObject && getItemById('missionObject') && inventory.bag.length < BAG_CAPACITY) {
    const id = freshInstanceId(itemInstances)
    itemInstances[id] = { id, itemId: 'missionObject', quantity: 1 }
    inventory.bag.push(id)
  }
  const character = syncEquippedEquipment({ ...member.character, inventory }, itemInstances)
  return withMemberCharacter({ ...state, itemInstances }, memberId, character)
}

// Place authored map groundItemPlacements into session groundItems (mapFormat.js). Skips unknown itemIds and blocked cells.
// Uses the placement's authored id as the instance id when free; otherwise allocates a fresh one. Optional name /
// pickable / visible ride on the ground entry for views and pickup gating.
function supportFromPlacementOn(on) {
  if (!on) return null
  if (on.tile) {
    const tile = Array.isArray(on.tile) ? { x: on.tile[0], y: on.tile[1] } : on.tile
    return { kind: 'tile', tile }
  }
  if (on.placement) return { kind: 'item', instanceId: on.placement }
  return null
}

function authoredSupportIsValid(state, support, category) {
  if (!support) return true
  const acceptsCategory = (surface) => Boolean(surface) && (!surface.accepts?.length || (category && surface.accepts.includes(category)))
  if (support.kind === 'tile') {
    const map = state.party?.map ?? state.map
    return Boolean(map && acceptsCategory(tileSurfaceAt(map, support.tile)))
  }
  if (support.kind === 'item') {
    const parent = state.groundItems?.[support.instanceId]
    const itemId = state.itemInstances?.[support.instanceId]?.itemId
    return Boolean(parent && itemSupportChain(state, support.instanceId) && acceptsCategory(surfaceOfItem(itemId)))
  }
  return false
}

export function seedGroundItemPlacements(state, placements = []) {
  if (!placements?.length) return state
  let itemInstances = { ...(state.itemInstances ?? {}) }
  let groundItems = { ...(state.groundItems ?? {}) }
  let next = { ...state, itemInstances, groundItems }
  const runtimeIds = new Map()
  let pending = placements.filter((placement) => getItemById(placement.itemId))
  while (pending.length) {
    let progressed = false
    const deferred = []
    for (const placement of pending) {
      const authoredParent = placement.on?.placement
      if (authoredParent && !runtimeIds.has(authoredParent)) {
        deferred.push(placement)
        continue
      }
      const def = getItemById(placement.itemId)
      const authoredSupport = supportFromPlacementOn(
        authoredParent ? { placement: runtimeIds.get(authoredParent) } : placement.on,
      )
      const place = canPlaceAt(next, placement.position, { category: def.category, itemId: def.id })
      // Authored positions predate current packing sizes, so validate their declared support without reflowing valid files.
      if (!place.ok || !authoredSupportIsValid(next, authoredSupport, def.category)) continue
      const authored = typeof placement.id === 'string' && placement.id && !itemInstances[placement.id] && !groundItems[placement.id]
      const id = authored ? placement.id : freshInstanceId(itemInstances)
      if (placement.id) runtimeIds.set(placement.id, id)
      itemInstances = { ...itemInstances, [id]: { id, itemId: def.id, quantity: 1 } }
      const ground = { instanceId: id, position: { x: place.position.x, y: place.position.y } }
      const support = authoredSupport ?? place.support
      if (support) ground.support = support
      if (placement.name) ground.name = placement.name
      if (placement.pickable === false) ground.pickable = false
      if (placement.visible === false) ground.visible = false
      groundItems = { ...groundItems, [id]: ground }
      next = { ...next, itemInstances, groundItems }
      progressed = true
    }
    if (!progressed) break
    pending = deferred
  }
  return { ...next, itemInstances, groundItems }
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
      const id = freshInstanceId(itemInstances)
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
      const id = freshInstanceId(itemInstances)
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

function copyInventory(character) {
  return { ...character.inventory, slots: { ...character.inventory.slots }, bag: [...character.inventory.bag] }
}

function writeInventory(state, memberId, inventory) {
  const member = state.party.members[memberId]
  const character = syncEquippedEquipment({ ...member.character, inventory }, state.itemInstances)
  return withMemberCharacter(state, memberId, character)
}

// Exchange two slotted items. Caller has already checked that each fits the slot it lands in.
function swapSlotted(state, from, to) {
  const occupant = state.party.members[to.memberId].character.inventory.slots[to.slot]
  if (from.memberId === to.memberId) {
    const inventory = copyInventory(state.party.members[from.memberId].character)
    inventory.slots[from.slot] = occupant
    inventory.slots[to.slot] = from.instanceId
    return writeInventory(state, from.memberId, inventory)
  }
  const sourceInventory = copyInventory(state.party.members[from.memberId].character)
  sourceInventory.slots[from.slot] = occupant
  let next = writeInventory(state, from.memberId, sourceInventory)
  const destInventory = copyInventory(next.party.members[to.memberId].character)
  destInventory.slots[to.slot] = from.instanceId
  return writeInventory(next, to.memberId, destInventory)
}

export function equipItem(state, { memberId, instanceId, slot }) {
  const check = canEquipToSlot(state, instanceId, slot)
  if (!check.ok) return state
  const member = state.party.members[memberId]
  if (!member?.character.inventory) return state
  const owner = findOwner(state, instanceId)
  if (!owner) return state
  if (owner.kind === 'slot' && owner.memberId === memberId && owner.slot === slot) return state
  const displaced = member.character.inventory.slots[slot]
  // Slot onto an occupied slot swaps only when the occupant fits the slot being vacated.
  if (displaced && displaced !== instanceId && owner.kind === 'slot') {
    if (!canEquipToSlot(state, displaced, owner.slot).ok) return state
    return swapSlotted(state, { memberId: owner.memberId, slot: owner.slot, instanceId }, { memberId, slot })
  }
  const taken = takeInstance(state, instanceId)
  if (!taken) return state
  let next = taken.state
  const target = next.party.members[memberId]
  const inventory = copyInventory(target.character)
  const occupant = inventory.slots[slot]
  inventory.slots[slot] = instanceId
  if (occupant && occupant !== instanceId) {
    const free = firstFreeBagIndex(inventory.bag)
    if (free < 0) return state
    inventory.bag = assignBagIndex(inventory.bag, free, occupant)
  }
  return writeInventory(next, memberId, inventory)
}

export function unequipItem(state, { memberId, slot }) {
  const member = state.party.members[memberId]
  const instanceId = member?.character.inventory?.slots?.[slot]
  if (!instanceId) return state
  if (bagFreeSlots(member.character) < 1) return state
  const inventory = { ...member.character.inventory, slots: { ...member.character.inventory.slots }, bag: [...member.character.inventory.bag] }
  const free = firstFreeBagIndex(inventory.bag)
  if (free < 0) return state
  inventory.slots[slot] = null
  inventory.bag = assignBagIndex(inventory.bag, free, instanceId)
  const character = syncEquippedEquipment({ ...member.character, inventory }, state.itemInstances)
  return withMemberCharacter(state, memberId, character)
}

// Exchange a bag cell with another bag cell. The occupant may be null (a hole).
function swapBagCells(state, from, to) {
  const occupant = state.party.members[to.memberId].character.inventory.bag[to.bagIndex] ?? null
  if (from.memberId === to.memberId) {
    const inventory = copyInventory(state.party.members[from.memberId].character)
    inventory.bag = assignBagIndex(inventory.bag, from.bagIndex, occupant)
    inventory.bag = assignBagIndex(inventory.bag, to.bagIndex, from.instanceId)
    return writeInventory(state, from.memberId, inventory)
  }
  const sourceInventory = copyInventory(state.party.members[from.memberId].character)
  sourceInventory.bag = assignBagIndex(sourceInventory.bag, from.bagIndex, occupant)
  let next = writeInventory(state, from.memberId, sourceInventory)
  const destInventory = copyInventory(next.party.members[to.memberId].character)
  destInventory.bag = assignBagIndex(destInventory.bag, to.bagIndex, from.instanceId)
  return writeInventory(next, to.memberId, destInventory)
}

function swapSlotAndBag(state, from, to) {
  const occupant = state.party.members[to.memberId].character.inventory.bag[to.bagIndex] ?? null
  if (from.memberId === to.memberId) {
    const inventory = copyInventory(state.party.members[from.memberId].character)
    inventory.slots[from.slot] = occupant
    inventory.bag = assignBagIndex(inventory.bag, to.bagIndex, from.instanceId)
    return writeInventory(state, from.memberId, inventory)
  }
  const sourceInventory = copyInventory(state.party.members[from.memberId].character)
  sourceInventory.slots[from.slot] = occupant
  let next = writeInventory(state, from.memberId, sourceInventory)
  const destInventory = copyInventory(next.party.members[to.memberId].character)
  destInventory.bag = assignBagIndex(destInventory.bag, to.bagIndex, from.instanceId)
  return writeInventory(next, to.memberId, destInventory)
}

function swapGroundAndBag(state, owner, to) {
  const ground = state.groundItems[owner.instanceId]
  const occupant = state.party.members[to.memberId].character.inventory.bag[to.bagIndex] ?? null
  const taken = takeInstance(state, owner.instanceId)
  if (!taken) return state
  let next = taken.state
  if (occupant) {
    const dropped = dropItem(next, {
      instanceId: occupant,
      position: ground.position,
      support: ground.support,
    })
    if (dropped === next) return state
    next = dropped
  }
  const inventory = copyInventory(next.party.members[to.memberId].character)
  inventory.bag = assignBagIndex(inventory.bag, to.bagIndex, owner.instanceId)
  return writeInventory(next, to.memberId, inventory)
}

export function moveToBag(state, { memberId, instanceId, toIndex = null }) {
  const member = state.party.members[memberId]
  if (!member?.character.inventory) return state
  const owner = findOwner(state, instanceId)
  if (!owner) return state
  const index = toIndex == null ? null : Number(toIndex)
  if (index != null && (!Number.isInteger(index) || index < 0 || index >= BAG_CAPACITY)) return state
  if (index == null && owner.kind === 'bag' && owner.memberId === memberId) return state
  if (index != null && owner.kind === 'bag' && owner.memberId === memberId && owner.bagIndex === index) return state

  const destBag = member.character.inventory.bag
  const occupant = index == null ? null : destBag[index] ?? null
  if (occupant && occupant === instanceId) return state
  if (occupant) {
    if (owner.kind === 'bag') return swapBagCells(state, owner, { memberId, bagIndex: index })
    if (owner.kind === 'slot' && canEquipToSlot(state, occupant, owner.slot).ok) {
      return swapSlotAndBag(state, owner, { memberId, bagIndex: index })
    }
    if (owner.kind === 'ground') return swapGroundAndBag(state, owner, { memberId, bagIndex: index })
    const free = firstFreeBagIndex(destBag)
    if (free < 0) return state
  } else if (index == null && bagFreeSlots(member.character) < 1) {
    return state
  }

  if (index == null && owner.kind === 'slot' && owner.memberId === memberId) {
    return unequipItem(state, { memberId, slot: owner.slot })
  }

  const placeIndex = index == null ? firstFreeBagIndex(destBag) : index
  if (placeIndex < 0) return state
  const taken = takeInstance(state, instanceId)
  if (!taken) return state
  let next = taken.state
  const target = next.party.members[memberId]
  const inventory = copyInventory(target.character)
  if (occupant) {
    const free = firstFreeBagIndex(inventory.bag)
    if (free < 0) return state
    inventory.bag = assignBagIndex(inventory.bag, free, occupant)
  }
  inventory.bag = assignBagIndex(inventory.bag, placeIndex, instanceId)
  return writeInventory(next, memberId, inventory)
}

export function transferItem(state, { instanceId, toMemberId, toSlot = null, toBagIndex = null }) {
  const target = state.party.members[toMemberId]
  if (!target?.character.inventory) return state
  if (toSlot) {
    // A slot drop that does not fit stays where it was. It does not fall through into the bag.
    if (!canEquipToSlot(state, instanceId, toSlot).ok) return state
    return equipItem(state, { memberId: toMemberId, instanceId, slot: toSlot })
  }
  return moveToBag(state, { memberId: toMemberId, instanceId, toIndex: toBagIndex })
}

// After map tiles change (destructibles, environment), re-derive support for every ground item at its X/Y.
// Orphaned supports fall to the next surface or the floor; occupancy conflicts leave the item where it was without support.
export function resolveGroundSupports(state) {
  let groundItems = state.groundItems ?? {}
  let changed = false
  for (const entry of Object.values(groundItems)) {
    const resolved = resolveItem(state, entry.instanceId)
    const place = canPlaceAt(
      { ...state, groundItems },
      entry.position,
      { excludeInstanceId: entry.instanceId, category: resolved?.def.category ?? null, itemId: resolved?.def.id ?? null },
    )
    if (!place.ok) {
      if (!entry.support) continue
      changed = true
      const { support: _s, ...rest } = entry
      groundItems = { ...groundItems, [entry.instanceId]: rest }
      continue
    }
    const nextSupport = place.support ?? null
    const same =
      (!entry.support && !nextSupport) ||
      (entry.support?.kind === 'tile' &&
        nextSupport?.kind === 'tile' &&
        entry.support.tile.x === nextSupport.tile.x &&
        entry.support.tile.y === nextSupport.tile.y) ||
      (entry.support?.kind === 'item' && nextSupport?.kind === 'item' && entry.support.instanceId === nextSupport.instanceId)
    if (same && place.position.x === entry.position.x && place.position.y === entry.position.y) continue
    changed = true
    const next = { ...entry, position: { x: place.position.x, y: place.position.y } }
    if (nextSupport) next.support = nextSupport
    else delete next.support
    groundItems = { ...groundItems, [entry.instanceId]: next }
  }
  return changed ? { ...state, groundItems } : state
}

export function dropItem(state, { instanceId, position, support = undefined, boardPoint = null }) {
  const resolved = resolveItem(state, instanceId)
  const place = canPlaceAt(state, position, {
    excludeInstanceId: instanceId,
    category: resolved?.def.category ?? null,
    boardPoint,
    itemId: resolved?.def.id ?? null,
  })
  // Drag hover may pass support explicitly; otherwise use what canPlaceAt found (floor → omitted).
  const nextSupport = support !== undefined ? support : place.support
  if (!place.ok) {
    // A full surface stays full. The fallback is only the solid-tile case: hover already found a support,
    // but a floor-only re-check reports Blocked.
    if (!nextSupport || place.reason !== 'Blocked.') return state
    const snapped = snapItemPosition(position)
    const occupied = Object.values(state.groundItems ?? {}).some((entry) => {
      if (entry.instanceId === instanceId) return false
      if (snapItemPosition(entry.position).x !== snapped.x || snapItemPosition(entry.position).y !== snapped.y) return false
      const a = entry.support
      const b = nextSupport
      if (!a || !b || a.kind !== b.kind) return false
      if (a.kind === 'tile') return a.tile.x === b.tile.x && a.tile.y === b.tile.y
      return a.instanceId === b.instanceId
    })
    if (occupied) return state
    const taken = takeInstance(state, instanceId)
    if (!taken) return state
    return {
      ...taken.state,
      groundItems: {
        ...taken.state.groundItems,
        [instanceId]: { instanceId, position: { x: snapped.x, y: snapped.y }, support: nextSupport },
      },
    }
  }
  const taken = takeInstance(state, instanceId)
  if (!taken) return state
  const entry = { instanceId, position: { x: place.position.x, y: place.position.y } }
  if (nextSupport) entry.support = nextSupport
  return {
    ...taken.state,
    groundItems: {
      ...taken.state.groundItems,
      [instanceId]: entry,
    },
  }
}

export function pickupItem(state, { instanceId, memberId }) {
  const ground = state.groundItems?.[instanceId]
  if (!ground || ground.pickable === false) return state
  const member = state.party.members[memberId]
  if (!member?.character.inventory || bagFreeSlots(member.character) < 1) return state
  const free = firstFreeBagIndex(member.character.inventory.bag)
  if (free < 0) return state
  const taken = takeInstance(state, instanceId)
  if (!taken) return state
  const inventory = {
    ...member.character.inventory,
    slots: { ...member.character.inventory.slots },
    bag: assignBagIndex(member.character.inventory.bag, free, instanceId),
  }
  const next = taken.state
  const character = syncEquippedEquipment({ ...member.character, inventory }, next.itemInstances)
  return withMemberCharacter(next, memberId, character)
}

export function groundItemViews(state, { hideInstanceId = null } = {}) {
  return Object.values(state.groundItems ?? {})
    .filter((entry) => entry.instanceId !== hideInstanceId && entry.visible !== false)
    .map((entry) => {
      const resolved = resolveItem(state, entry.instanceId)
      return {
        id: entry.instanceId,
        instanceId: entry.instanceId,
        position: entry.position,
        support: entry.support ?? null,
        z: zOf(state, entry),
        depth: groundItemDepth(state, entry),
        name: entry.name || resolved?.def.name || 'Item',
        itemId: resolved?.instance.itemId ?? null,
        category: resolved?.def.category ?? null,
        description: resolved?.def.description ?? '',
        // Isometric world prop PNG; never the inventory icon. Falls back to crate tile art.
        worldImage: resolved?.def.worldImage ?? null,
        worldTile: resolved?.def.worldTile ?? 'crate',
        spriteSize: propSpriteSize(resolved?.def),
        icon: resolved?.def.icon ?? null,
        pickable: entry.pickable !== false,
      }
    })
}
