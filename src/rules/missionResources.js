// The mission's two shared pools: the party's group Momentum and the scenario's Threat. One object
// ({ momentum, threat }) owned by the running mission: the exploration state holds it, and a Combat Type 1 fight holds
// the same object while it runs (combatLink.js hands it over and back). Challenge objects and combat change it only
// through these functions. Pure.
//
// Book (STA 2e Core):
// - p.259-260: unspent Momentum is saved to the group pool; any player character may use it; the pool holds at most 6;
//   Momentum that can't be saved is lost unless spent immediately. Bonus Momentum (from talents etc.) is never saved
//   (PROTOTYPE RULE below: the prototype saves it).
// - pp.255, 260 Create Opportunity (buy d20s, Immediate, Repeatable): before the roll, the first bonus d20 costs 1, the second
//   2 more, the third 3 more; no task rolls more than 5d20.
// - p.260, p.263: any Immediate Momentum spend can be paid in part or in full by adding Threat instead, one for one.
// - p.265, p.324: NPCs have no group Momentum pool; an NPC may spend its unspent Momentum to add 1 Threat each. Threat
//   mirrors group Momentum for NPCs: they pay for the same spends (bonus d20s included) by spending Threat.
// Not in yet (hooks only): the scene-end loss of 1 Momentum (p.261), buying off a complication with 2 Threat (p.258).
import { TASK_DICE } from './taskResolver.js'

export const MAX_MOMENTUM = 6
export const MAX_DICE_POOL = 5
export const BONUS_DIE_COSTS = [1, 2, 3]
export const MAX_BONUS_DICE = MAX_DICE_POOL - TASK_DICE

// Starting values are a designer decision (Oct 2026: both 0). Book p.264 starts Threat at 2 per player character.
export const createMissionResources = ({ momentum = 0, threat = 0 } = {}) => ({ momentum, threat })

// Total cost of buying `count` bonus d20s: 1, 3, 6.
export const bonusDiceCost = (count) => BONUS_DIE_COSTS.slice(0, count).reduce((total, cost) => total + cost, 0)

// PROTOTYPE RULE (designer, Oct 2026), not the book: bonus Momentum is saved to the group pool like any other.
// Book p.260: bonus Momentum can't be saved and must be spent at once, but nothing in the prototype spends Momentum
// at the moment of a roll yet, so under the book rule it would always be lost (and talents such as Call Out Targets
// and Pack Tactics would do nothing). Set to false to restore the book rule once immediate spends exist.
export const PROTOTYPE_SAVE_BONUS_MOMENTUM = true

// The part of a successful player task's Momentum (a taskResolver.js result) that goes to the group pool.
export const savableMomentum = (result) => result.momentumGenerated - (PROTOTYPE_SAVE_BONUS_MOMENTUM ? 0 : result.bonusMomentum)

// Saving a player task's unspent Momentum: { resources, saved, lost } (lost: what didn't fit under the maximum).
export function saveMomentum(resources, amount) {
  const saved = Math.max(0, Math.min(amount, MAX_MOMENTUM - resources.momentum))
  return { resources: { ...resources, momentum: resources.momentum + saved }, saved, lost: Math.max(0, amount - saved) }
}

// null when the pool doesn't hold enough.
export function spendMomentum(resources, amount) {
  if (amount < 0 || resources.momentum < amount) return null
  return { ...resources, momentum: resources.momentum - amount }
}

export const addThreat = (resources, amount) => ({ ...resources, threat: resources.threat + Math.max(0, amount) })

// null when the pool doesn't hold enough.
export function spendThreat(resources, amount) {
  if (amount < 0 || resources.threat < amount) return null
  return { ...resources, threat: resources.threat - amount }
}

// An NPC's unspent Momentum, all turned into Threat (NPCs have nothing else to spend it on yet).
export const npcMomentumToThreat = (resources, momentumGenerated) => addThreat(resources, momentumGenerated)

// Buying bonus d20s before a roll. purchase: { bonusDice, momentum } where momentum is how much of the cost comes from
// the group pool; a player adds the rest as Threat. side 'enemy': an NPC pays the whole cost by spending Threat.
// Returns { valid, reason, bonusDice, dice, cost, momentum, threatAdded, threatSpent }.
export function checkDicePurchase(resources, purchase = {}, side = 'player') {
  const bonusDice = purchase.bonusDice ?? 0
  const cost = bonusDiceCost(bonusDice)
  const base = { bonusDice, dice: TASK_DICE + bonusDice, cost, momentum: 0, threatAdded: 0, threatSpent: 0 }
  if (!Number.isInteger(bonusDice) || bonusDice < 0 || bonusDice > MAX_BONUS_DICE) return { ...base, valid: false, reason: `At most ${MAX_DICE_POOL}d20.` }
  if (side !== 'player') {
    if (resources.threat < cost) return { ...base, valid: false, reason: `Needs ${cost} Threat.` }
    return { ...base, valid: true, reason: null, threatSpent: cost }
  }
  const momentum = purchase.momentum ?? 0
  if (!Number.isInteger(momentum) || momentum < 0 || momentum > cost) return { ...base, valid: false, reason: 'Invalid Momentum payment.' }
  if (momentum > resources.momentum) return { ...base, valid: false, reason: `Only ${resources.momentum} Momentum in the pool.` }
  return { ...base, valid: true, reason: null, momentum, threatAdded: cost - momentum }
}

// Applies a checked purchase to the pools.
export function payForDice(resources, check) {
  return { ...resources, momentum: resources.momentum - check.momentum, threat: resources.threat + check.threatAdded - check.threatSpent }
}

// The default split for a player: as much from the pool as it holds, the rest as Threat.
export const defaultMomentumPayment = (resources, bonusDice) => Math.min(resources.momentum, bonusDiceCost(bonusDice))
