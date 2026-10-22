// A dropped inventory item on the exploration map. Runtime only — never written into map files.
// Behaviour class matching docs/world-objects.md: methods take state and return values / new state.
import { INTERACT_RANGE } from '../exploration/challengeObjects.js'
import { canAct, getMembers } from '../exploration/partyControl.js'
import { pickupItem as pickupIntoBag, resolveItem } from '../rules/inventory.js'
import { approachPoint, zOf } from '../rules/placement.js'

// How close (tiles) a character must stand before the item leaves the ground.
// Tighter than INTERACT_RANGE (ring / walk order) so props stay visible until the character is on top of them.
// Keep >= party arriveDistance (0.6) so a moveTo the item position still completes the pickup.
export const GROUND_PICKUP_RANGE = 0.75

export class GroundItem {
  constructor(instanceId) {
    this.instanceId = instanceId
  }

  get id() {
    return this.instanceId
  }

  record(state) {
    return state.groundItems?.[this.instanceId] ?? null
  }

  position(state) {
    const entry = this.record(state)
    return entry ? { ...entry.position } : null
  }

  // Where a character should walk to pick this up (nearest walkable neighbour when the item sits on a solid tile).
  approachPosition(state) {
    const position = this.position(state)
    if (!position) return null
    const map = state.party?.map
    return map ? approachPoint(map, position) : position
  }

  distanceTo(state, point) {
    const position = this.position(state)
    if (!position || !point) return Infinity
    return Math.hypot(point.x - position.x, point.y - position.y)
  }

  // Ring / approach range (same as challenge objects).
  inReach(state, point) {
    return this.distanceTo(state, point) <= INTERACT_RANGE
  }

  // Actual grab — item stays on the ground until this close.
  inPickupRange(state, point) {
    return this.distanceTo(state, point) <= GROUND_PICKUP_RANGE
  }

  membersInRange(state) {
    return getMembers(state.party).filter((member) => canAct(member) && this.inReach(state, member.position))
  }

  membersInPickupRange(state) {
    return getMembers(state.party).filter((member) => canAct(member) && this.inPickupRange(state, member.position))
  }

  view(state) {
    const entry = this.record(state)
    if (!entry || entry.visible === false) return null
    const resolved = resolveItem(state, this.instanceId)
    const z = zOf(state, entry)
    return {
      id: this.instanceId,
      instanceId: this.instanceId,
      position: entry.position,
      support: entry.support ?? null,
      z,
      name: entry.name || resolved?.def.name || 'Item',
      icon: resolved?.def.icon ?? null,
      itemId: resolved?.instance.itemId ?? null,
      stateLabel: z > 0 ? 'Placed' : 'On ground',
      description: resolved?.def.description ?? '',
      pickable: entry.pickable !== false,
    }
  }

  pickup(state, memberId) {
    const entry = this.record(state)
    if (!entry || entry.pickable === false) return state
    return pickupIntoBag(state, { instanceId: this.instanceId, memberId })
  }
}

export const groundItemFor = (instanceId) => new GroundItem(instanceId)
