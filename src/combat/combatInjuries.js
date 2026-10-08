// Injuries in combat (Book p.290-292; rules/personalCondition.js): a successful attack inflicts an Injury of the
// weapon's severity (less Protection); the target may Avoid it by taking that much Stress (notable NPCs: Threat), else
// suffers it and is Defeated. The player decides for party members (state.incomingInjury waits for the injuryDecision
// action) and which attribute a newly Fatigued member shuts down (state.pendingFatigue); AI-controlled combatants decide
// through injuryPolicy.js.
import { getAttributeName } from '../character/runtimeCharacter.js'
import {
  addedSeverityCost,
  avoidInjury,
  buildInjury,
  chooseFatiguedAttribute,
  getAvoidOption,
  getProtection,
  injuryText,
  injuryTypeName,
  MAX_ADDED_SEVERITY,
  npcCategoryName,
  takeHit,
} from '../rules/personalCondition.js'
import { updateCombatant, withStats } from './combatLog.js'
import { getTurnOf, knowsAbout, statusText } from './combatSelectors.js'
import { talentSeverityLines } from './combatTalents.js'
import { chooseAvoidInjury, chooseFatigueAttribute } from './injuryPolicy.js'
import { getCombatantWeapon } from './weaponSystem.js'

// The Injury a successful hit with this weapon would inflict on this target: the weapon's severity, plus the attacker's
// talents (combatTalents.js) and severity bought with Momentum (hook), less the target's Protection (minimum 1).
// situation: { aimed, targetUnaware } as the attack was made; by default, as things stand now (previews, the AI).
export function injuryFor(state, attacker, target, weapon, injuryModeId, addedSeverity = 0, situation = {}) {
  const { aimed = getTurnOf(state, attacker.id).aimReroll, targetUnaware = !knowsAbout(state, target, attacker) } = situation
  const protection = getProtection(target.character, { injuryType: injuryModeId, inCover: target.inCover })
  const talentSeverity = talentSeverityLines(attacker.character, weapon, { aimed, targetUnaware })
  return buildInjury({ id: `${state.seed}-${state.log.length}-${target.id}`, type: injuryModeId, weapon, attacker, addedSeverity, protection, talentSeverity })
}

// The Injury a hit would inflict with each of the weapon's settings (for the Task panel).
export function previewInjuries(state, attackerId, targetId, weaponId) {
  const attacker = state.combatants[attackerId]
  const target = state.combatants[targetId]
  const weapon = attacker && getCombatantWeapon(attacker, weaponId)
  if (!attacker || !target || !weapon) return []
  return weapon.injuryModes.map((mode) => injuryFor(state, attacker, target, weapon, mode))
}

const severityText = (injury) => {
  const parts = [`${injury.source.weaponName ?? 'weapon'} ${injury.baseSeverity}`]
  ;(injury.talentSeverity ?? []).forEach((line) => parts.push(`+${line.change} ${line.label}`))
  if (injury.addedSeverity) parts.push(`+${injury.addedSeverity} Momentum`)
  if (injury.protection) parts.push(`-${injury.protection} Protection`)
  return parts.length > 1 ? ` (${parts.join(' ')}, minimum 1)` : ''
}

// The avoid-or-suffer outcome for an incoming Injury: { targetId, attackerId, injury, option }. avoid: the decision
// (ignored when the rules don't allow avoiding). Returns { state, lines, avoided }.
export function resolveInjury(state, incoming, avoid) {
  const { targetId, injury, option } = incoming
  const target = state.combatants[targetId]
  const name = target.character.name
  let next = { ...state, incomingInjury: null }
  if (avoid && option.possible) {
    const avoided = avoidInjury(target.character, target.condition, injury, option.kind)
    next = updateCombatant(next, targetId, { condition: avoided.condition })
    if (option.kind === 'threat') {
      next = {
        ...next,
        resources: { ...next.resources, threat: next.resources.threat - option.cost },
        avoidedThisScene: [...next.avoidedThisScene, target.character.id],
      }
    }
    next = withStats(next, (stats) => {
      stats.injuries.avoided += 1
      stats.byCombatant[targetId].injuriesAvoided += 1
      if (option.kind === 'stress') {
        stats.injuries.stressTaken += avoided.taken
        stats.byCombatant[targetId].stressTaken += avoided.taken
        if (avoided.complication) stats.injuries.stressComplications += 1
        if (avoided.becameFatigued) stats.injuries.fatigued += 1
      } else {
        stats.injuries.threatSpent += option.cost
        stats.threat.spentByNpcs += option.cost
      }
    })
    const paid =
      option.kind === 'stress'
        ? `takes ${avoided.taken} Stress${avoided.overflow ? ` (needed ${option.cost}; the track is full)` : ''} (${statusText(next.combatants[targetId])})`
        : `spends ${option.cost} Threat (pool now ${next.resources.threat})`
    const lines = [`${name} avoids the Injury: ${paid}. Not Defeated.`]
    if (avoided.complication) lines.push(`${name} suffers a complication: ${avoided.complication.name} (${avoided.overflow} Stress over the maximum, Book p.277).`)
    if (avoided.becameFatigued) {
      lines.push(`${name} is Fatigued: +1 Difficulty on all tasks, no more Stress, and one attribute shut down (Book p.278).`)
      next = startFatigueChoice(next, targetId, lines)
    }
    return { state: next, lines, avoided: true }
  }
  const condition = takeHit(target.character, target.condition, injury)
  next = updateCombatant(next, targetId, { condition, inCover: false, guard: null })
  const minor = !condition.injuries.includes(injury)
  next = withStats(next, (stats) => {
    stats.byCombatant[targetId].injuriesSuffered += 1
    if (incoming.attackerId && stats.byCombatant[incoming.attackerId]) stats.byCombatant[incoming.attackerId].injuriesInflicted += 1
    if (!minor) {
      stats.injuries.suffered += 1
      stats.injuries[injury.type] += 1
    }
  })
  const lines = minor
    ? [`${name} ${condition.dead ? 'is killed' : 'is knocked unconscious'} and Defeated (${npcCategoryName(target.character)}: no Injury; ${injuryTypeName(injury.type)} hit).`]
    : [`${name} suffers a ${injuryText(injury)} and is Defeated${condition.dying ? ' (Dying: Deadly Injury)' : ''}.`]
  return { state: next, lines, avoided: false }
}

// Book p.278: a character who becomes Fatigued selects an attribute to shut down. The player chooses for a
// player-controlled party member (state.pendingFatigue waits for the chooseFatigueAttribute action, like an incoming
// Injury); anyone else gets combat/injuryPolicy.js's choice now. lines: the log lines being built (appended to).
function startFatigueChoice(state, combatantId, lines) {
  const combatant = state.combatants[combatantId]
  if (combatant.controller === 'player') return { ...state, pendingFatigue: { combatantId } }
  const { attributeId, reason } = chooseFatigueAttribute({ combatant })
  lines.push(`AI Decision: shut down ${getAttributeName(attributeId)}`, `Reason: ${reason}`)
  return updateCombatant(state, combatantId, { condition: chooseFatiguedAttribute(combatant.condition, attributeId) })
}

// A hit lands: the target either decides (party members: the player, through state.incomingInjury and the
// injuryDecision action) or the decision is made now (no choice possible, or an AI-controlled character through
// combat/injuryPolicy.js). Returns { state, lines }.
export function inflictInjury(state, attackerId, targetId, injury) {
  const target = state.combatants[targetId]
  const option = getAvoidOption(target.character, target.condition, injury, { threat: state.resources.threat, avoidedThisScene: state.avoidedThisScene })
  const incoming = { targetId, attackerId, injury, option }
  const lines = [`Injury: ${injuryTypeName(injury.type)}, Severity ${injury.severity}${severityText(injury)}`]
  if (!option.possible) {
    if (option.reason) lines.push(`Cannot Avoid Injury: ${option.reason}`)
    const resolved = resolveInjury(state, incoming, false)
    return { state: resolved.state, lines: [...lines, ...resolved.lines] }
  }
  if (target.controller === 'player') {
    const offer = option.overflow ? `take ${option.taken} Stress, filling the track, plus a complication` : `take ${option.cost} Stress`
    return { state: { ...state, incomingInjury: incoming }, lines: [...lines, `${target.character.name} may Avoid Injury: ${offer} (${statusText(target)}).`] }
  }
  const avoid = chooseAvoidInjury({ state, target, injury, option })
  const resolved = resolveInjury(state, incoming, avoid)
  return { state: resolved.state, lines: [...lines, ...resolved.lines] }
}

// Hook (Book p.292): Momentum spent on a successful attack adds severity, 2 per point (1 with Intense), at most +2.
// requested: points asked for. Returns { added, cost } within what the pool can pay (party only; nobody asks yet).
export function affordAddedSeverity(resources, weapon, requested = 0, playerSide) {
  if (!playerSide || !requested) return { added: 0, cost: 0 }
  const each = addedSeverityCost(weapon)
  const added = Math.min(MAX_ADDED_SEVERITY, requested, Math.floor(resources.momentum / each))
  return { added, cost: added * each }
}
