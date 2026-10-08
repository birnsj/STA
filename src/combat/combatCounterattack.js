// Counterattack (Book p.290): "If the Attack was an opposed task, and the target won, then they may either move out of
// Reach (if in melee) or spend 2 Momentum to Counterattack, inflicting an Injury upon you in return." The winning
// defender generates 1 Momentum per success the attacker fell short (Book p.256). Stun or Deadly is chosen when the
// Momentum is spent (Book p.292); a player's Deadly adds 1 Threat, like an attack (enemies pay nothing, as for attacks).
// Prototype (actions.json counterattack): the defender's Momentum is saved to the group pool first (an NPC's becomes
// Threat), then the Counterattack is paid from the pool (NPCs: Threat, Book p.265). No roll and no action: the Injury
// lands, and the attacker may Avoid it as usual. The move out of Reach is not implemented.
// The player decides for a player-controlled party member (state.pendingCounterattack waits for the
// counterattackDecision action); anyone else decides through injuryPolicy.js.
import { addThreat, npcMomentumToThreat, saveMomentum, spendMomentum, spendThreat } from '../rules/missionResources.js'
import { inflictInjury, injuryFor } from './combatInjuries.js'
import { addLog, markAction, momentumLine, updateCombatant, withStats } from './combatLog.js'
import { extraActionPool, facingToward, isActive } from './combatSelectors.js'
import { chooseCounterattack } from './injuryPolicy.js'
import { getRangeBand, hasLineOfFire, tileDistance } from './rangeSystem.js'
import { COUNTERATTACK_COST } from './turnActions.js'
import { getCombatantWeapon, getInjuryMode, getRangeModifier } from './weaponSystem.js'

// The defender's weapon for a Counterattack: the highest Severity among those that could hit the attacker from where
// the defender stands (in range, line of fire). Implementation pick: the book names no weapon.
function counterWeapon(state, defender, attacker) {
  const band = getRangeBand(tileDistance(defender.position, attacker.position))
  if (!hasLineOfFire(state.map, defender.position, attacker.position)) return null
  return defender.weaponIds
    .map((weaponId) => getCombatantWeapon(defender, weaponId))
    .filter((weapon) => weapon && getRangeModifier(weapon, band).available)
    .reduce((best, weapon) => (!best || weapon.severity > best.severity ? weapon : best), null)
}

// Whether this defender may Counterattack this attacker now: { possible, reason, weaponId, injuryModes, cost, pool }.
export function counterattackOption(state, defender, attacker) {
  const pool = extraActionPool(defender)
  const base = { possible: false, reason: null, weaponId: null, injuryModes: [], cost: COUNTERATTACK_COST, pool }
  if (!isActive(defender) || !isActive(attacker)) return { ...base, reason: 'Not able to act.' }
  const weapon = counterWeapon(state, defender, attacker)
  if (!weapon) return { ...base, reason: `no weapon can reach ${attacker.character.name}.` }
  if (state.resources[pool] < COUNTERATTACK_COST) {
    const has = pool === 'momentum' ? `the group pool has ${state.resources.momentum} Momentum` : `there is ${state.resources.threat} Threat`
    return { ...base, weaponId: weapon.id, reason: `costs ${COUNTERATTACK_COST} ${pool === 'momentum' ? 'Momentum' : 'Threat'}; ${has}.` }
  }
  return { ...base, possible: true, weaponId: weapon.id, injuryModes: weapon.injuryModes }
}

// The attack failed and was opposed: the defender won. Saves the defender's Momentum, then offers the Counterattack (a
// party member the player controls), or decides it now. Returns { state, lines, counterattack } where counterattack is
// what the roll result shows: { defenderId, momentum, decided: 'pending' | 'taken' | 'declined' | 'unavailable', injury? }.
export function defenderWins(state, pending, evaluation) {
  const defender = state.combatants[pending.targetId]
  const attacker = state.combatants[pending.attackerId]
  const momentum = Math.max(0, pending.task.difficulty - evaluation.successes)
  const name = defender.character.name
  let next = state
  const lines = []
  if (defender.side === 'player') {
    const saving = saveMomentum(state.resources, momentum)
    next = withStats({ ...state, resources: saving.resources }, (stats) => {
      stats.momentum.generated += momentum
      stats.momentum.saved += saving.saved
      stats.momentum.lost += saving.lost
    })
    lines.push(`${name} wins the opposed roll (Book p.256): ${momentumLine(momentum, saving, saving.resources)}`)
  } else {
    next = withStats({ ...state, resources: npcMomentumToThreat(state.resources, momentum) }, (stats) => (stats.threat.fromNpcMomentum += momentum))
    lines.push(`${name} wins the opposed roll (Book p.256): Momentum generated: ${momentum}${momentum ? ` (NPC: added to Threat, now ${next.resources.threat})` : ''}`)
  }
  const option = counterattackOption(next, defender, attacker)
  const counterattack = { defenderId: defender.id, momentum, decided: 'unavailable', injury: null }
  if (!option.possible) {
    lines.push(`No Counterattack: ${option.reason}`)
    return { state: next, lines, counterattack }
  }
  const offer = { defenderId: defender.id, attackerId: attacker.id, weaponId: option.weaponId, injuryModes: option.injuryModes, cost: option.cost }
  if (defender.controller === 'player') {
    lines.push(`${name} may Counterattack ${attacker.character.name}: ${option.cost} Momentum, an Injury from ${getCombatantWeapon(defender, option.weaponId).name}.`)
    return { state: { ...next, pendingCounterattack: offer }, lines, counterattack: { ...counterattack, decided: 'pending' } }
  }
  const taken = takeCounterattack(next, offer, chooseCounterattack({ state: next, defender, attacker, offer }))
  return { state: taken.state, lines: [...lines, ...taken.lines], counterattack: { ...counterattack, decided: taken.injury ? 'taken' : 'declined', injury: taken.injury } }
}

// Applies a Counterattack decision ({ accept, injuryMode, reason }) to an offer. Returns { state, lines, injury }.
export function takeCounterattack(state, offer, decision) {
  const defender = state.combatants[offer.defenderId]
  const attacker = state.combatants[offer.attackerId]
  const cleared = { ...state, pendingCounterattack: null }
  const reasonLines = decision.reason ? [`AI Decision: ${decision.accept ? `Counterattack (${getInjuryMode(decision.injuryMode).name})` : 'No Counterattack'}`, `Reason: ${decision.reason}`] : []
  if (!decision.accept || !offer.injuryModes.includes(decision.injuryMode)) {
    return { state: cleared, lines: [...reasonLines, `${defender.character.name} does not Counterattack.`], injury: null }
  }
  const party = extraActionPool(defender) === 'momentum'
  const paid = party ? spendMomentum(state.resources, offer.cost) : spendThreat(state.resources, offer.cost)
  if (!paid) return { state: cleared, lines: [...reasonLines, `${defender.character.name} cannot pay for the Counterattack.`], injury: null }
  const deadlyThreat = party && getInjuryMode(decision.injuryMode).generatesThreat ? 1 : 0
  const resources = addThreat(paid, deadlyThreat)
  const weapon = getCombatantWeapon(defender, offer.weaponId)
  let next = withStats({ ...cleared, resources }, (stats) => {
    stats.tasks.counterattack += 1
    if (party) stats.momentum.spentCounterattack += offer.cost
    else stats.threat.spentByNpcs += offer.cost
    stats.threat.fromDeadly += deadlyThreat
  })
  next = updateCombatant(next, defender.id, { facing: facingToward(defender.position, attacker.position) })
  const injury = injuryFor(next, defender, attacker, weapon, decision.injuryMode, 0, { aimed: false, targetUnaware: false })
  const hit = inflictInjury(next, defender.id, attacker.id, injury)
  next = markAction(hit.state, 'counterattack', defender.id, {
    targetId: attacker.id,
    weaponId: weapon.id,
    injuryMode: decision.injuryMode,
    injury,
    awaiting: Boolean(hit.state.incomingInjury),
    removed: !isActive(hit.state.combatants[attacker.id]),
  })
  const paidText = party ? `${offer.cost} Momentum (group pool now ${paid.momentum})` : `${offer.cost} Threat (Threat now ${paid.threat})`
  return {
    state: next,
    lines: [
      ...reasonLines,
      `COUNTERATTACK: ${defender.character.name} strikes back at ${attacker.character.name} with ${weapon.name} (${getInjuryMode(decision.injuryMode).name}); spent ${paidText}`,
      ...hit.lines,
      ...(deadlyThreat ? [`Threat +1 (Deadly Counterattack), now ${resources.threat}`] : []),
    ],
    injury,
  }
}

// The reducer's 'counterattackDecision' action (the player's choice for a party defender, or autocombat's): accept,
// injuryMode, reason.
export function counterattackStep(state, action) {
  const offer = state.pendingCounterattack
  if (!offer) return state
  const taken = takeCounterattack(state, offer, action)
  let next = addLog(taken.state, taken.lines)
  if (next.result?.counterattack?.defenderId === offer.defenderId && next.result.counterattack.decided === 'pending') {
    next = { ...next, result: { ...next.result, counterattack: { ...next.result.counterattack, decided: taken.injury ? 'taken' : 'declined', injury: taken.injury } } }
  }
  return next
}
