// Punch and Kick: contextual unarmed attacks on the combat ring, offered against an enemy in Reach whatever weapon is in
// hand. Each is the book's Unarmed Strike (weapons.json unarmedAttacks), so the roll, Difficulty, severity and the Major
// action all come from the normal attack (combat/actions/AttackAction.js); this file decides when the ring shows one and
// what a Kick adds (a knockdown, a prototype adaptation).
import { spendMomentum, spendThreat } from '../rules/missionResources.js'
import { previewAttack } from './combatAttacks.js'
import { updateCombatant } from './combatLog.js'
import { isProne } from './combatProne.js'
import { canAfford, extraActionPool, isActive } from './combatSelectors.js'
import { getRangeBand, tileDistance } from './rangeSystem.js'
import { getUnarmedAttack, UNARMED_ATTACKS } from './weaponSystem.js'

// { attack, preview, offered, available, reason } for one unarmed attack of this actor on this target.
// offered: whether the ring shows the button (target in Reach, and the weapon in hand isn't already the Unarmed Strike,
// whose Stun button does the same). available: whether pressing it can fire now.
export function previewUnarmedAttack(state, actorId, targetId, attackId, heldWeaponId = null) {
  const attack = getUnarmedAttack(attackId)
  const actor = state.combatants[actorId]
  const target = state.combatants[targetId]
  if (!attack || !actor || !target) return { attack, preview: null, offered: false, available: false, reason: 'Choose a target.' }
  const preview = previewAttack(state, actorId, targetId, attack.weaponId)
  const inReach = getRangeBand(tileDistance(actor.position, target.position)).id === 'reach'
  const offered = inReach && isActive(target) && target.side !== actor.side && heldWeaponId !== attack.weaponId
  if (!preview.available) return { attack, preview, offered, available: false, reason: preview.reason }
  if (!canAfford(state, actor, 'attack')) return { attack, preview, offered, available: false, reason: 'No Major action left.' }
  return { attack, preview, offered, available: true, reason: null }
}

// The unarmed attacks the ring offers against this target now.
export const offeredUnarmedAttacks = (state, actorId, targetId, heldWeaponId) =>
  UNARMED_ATTACKS.map((attack) => previewUnarmedAttack(state, actorId, targetId, attack.id, heldWeaponId)).filter((entry) => entry.offered)

// The unarmed attack an attack action names (action.variant), when it really is that attack: the Unarmed Strike on Stun.
// Anything else is a plain attack.
export function unarmedVariantFor(action) {
  const attack = action.variant ? getUnarmedAttack(action.variant) : null
  return attack && attack.weaponId === action.weaponId && attack.injuryMode === action.injuryMode ? attack : null
}

// After a Kick hits: if the target is still up and not prone, spend the knockdown's cost (the group's Momentum; an
// enemy's Threat, Book p.265) and knock it prone. Returns { state, lines, knocked }.
// The figure plays the existing fall, hold and get-up animation (blastReact; maps/pixi/figures.js).
export function knockdownAfterHit(state, attacker, targetId, variantId) {
  const attack = getUnarmedAttack(variantId)
  const target = state.combatants[targetId]
  const cost = attack?.knockdown?.cost
  if (!cost || !target || !isActive(target) || isProne(target)) return { state, lines: [], knocked: false }
  const pool = extraActionPool(attacker)
  const paid = pool === 'momentum' ? spendMomentum(state.resources, cost) : spendThreat(state.resources, cost)
  const name = target.character.name
  if (!paid) return { state, lines: [`${attack.name}: knocking ${name} prone costs ${cost} ${pool === 'momentum' ? 'Momentum' : 'Threat'}; the pool has ${state.resources[pool]}.`], knocked: false }
  const next = updateCombatant({ ...state, resources: paid }, targetId, { prone: true, blastReact: { key: `kick:${state.log.length}:${targetId}` } })
  return { state: next, lines: [`${name} is knocked prone (${cost} ${pool === 'momentum' ? 'Momentum' : 'Threat'} spent).`], knocked: true }
}
