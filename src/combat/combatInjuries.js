// Injuries in combat (Book p.290-292; rules/personalCondition.js): a successful attack inflicts an Injury of the
// weapon's severity (less Protection); the target may Avoid it by taking that much Stress (notable NPCs: Threat), else
// suffers it and is Defeated. Prototype (designer 2026-10-15 blasts/hazards; 2026-10-18 weapon attacks): Always spend
// Stress or Threat when Avoid Injury is possible — no player prompt. Which attribute a newly Fatigued member shuts down
// still waits for the player (state.pendingFatigue) or injuryPolicy.js for AI.
import { controllerFor } from '../actors/controllers.js'
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
  payAvoidThreat,
  personalThreatLeft,
  takeHit,
} from '../rules/personalCondition.js'
import { tileKey } from './battleMap.js'
import { blastFaceOrigin, blastThrow, isExplosionInjury } from '../rules/appearance.js'
import { updateCombatant, withStats } from './combatLog.js'
import { proneCoverProtection } from './combatProne.js'
import { getTurnOf, knowsAbout, statusText } from './combatSelectors.js'
import { talentSeverityLines } from './combatTalents.js'
import { chooseFatigueAttribute } from './injuryPolicy.js'
import { getCombatantWeapon } from './weaponSystem.js'

// After the fall / getUp stagger has finished (presentation). Walk interpolation keys off blastReact, so it must go.
// Face the explosive that threw them.
export function clearBlastReact(state, id) {
  const combatant = state.combatants[id]
  if (!combatant?.blastReact) return state
  const { injury, land, from } = combatant.blastReact
  return updateCombatant(state, id, {
    blastReact: null,
    ...(injury ? { facing: blastFaceOrigin(injury, id, land ?? from ?? combatant.position) } : {}),
  })
}

// The Injury a successful hit with this weapon would inflict on this target: the weapon's severity, plus the attacker's
// talents (combatTalents.js) and severity bought with Momentum (hook), less the target's Protection (minimum 1).
// situation: { aimed, targetUnaware } as the attack was made; by default, as things stand now (previews, the AI).
export function injuryFor(state, attacker, target, weapon, injuryModeId, addedSeverity = 0, situation = {}) {
  const { aimed = getTurnOf(state, attacker.id).aimReroll, targetUnaware = !knowsAbout(state, target, attacker) } = situation
  const worn = getProtection(target.character, { injuryType: injuryModeId, inCover: target.inCover })
  // Book p.288: a prone target in Cover has +1 Protection.
  const proneCover = proneCoverProtection(target)
  const protection = proneCover ? { value: worn.value + proneCover, lines: [...worn.lines, { label: 'Prone in cover', change: proneCover }] } : worn
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

// The avoid-or-suffer outcome for an Injury: { targetId, attackerId, injury, option }. avoid: spend Stress/Threat when
// the rules allow it (ignored when they don't). Returns { state, lines, avoided }.
export function resolveInjury(state, incoming, avoid) {
  return resolveOneInjury(state, incoming, avoid)
}

// Tiles other standing combatants occupy (blast landing must not stack onto them).
function occupiedCombatKeys(state, exceptId) {
  return new Set(
    Object.values(state.combatants)
      .filter((other) => other.id !== exceptId && !other.fled && !other.condition?.defeated)
      .map((other) => tileKey(other.position)),
  )
}

// Move a combatant to the tile a blast throws them to (get up / lie where they land). Facing looks at the explosive.
function thrownCombatant(state, combatant, injury) {
  const throw_ = blastThrow(state.map, injury, combatant.id, occupiedCombatKeys(state, combatant.id))
  if (!throw_) return { blastReact: { injury }, facing: blastFaceOrigin(injury, combatant.id, combatant.position) }
  const react = { injury, from: throw_.from, land: throw_.land, facing: throw_.facing }
  // Face the explosive from the landing tile (throw_.look); flight uses blastReact.facing in the renderer.
  const facing = { ...throw_.look }
  if (throw_.land.x === throw_.from.x && throw_.land.y === throw_.from.y) return { blastReact: react, facing }
  return { position: { ...throw_.land }, facing, blastReact: react }
}

// Where a Threat avoid was paid from, for the log: "pool now 3" or "2 Personal Threat and 1 from the pool, now 3; 1 Personal left".
function threatSpendText(option, character, after) {
  if (!option.personal) return `pool now ${after.resources.threat}`
  const shared = option.shared ? ` and ${option.shared} from the pool, now ${after.resources.threat}` : ''
  return `${option.personal} Personal Threat${shared}; ${personalThreatLeft(character, after.personalThreatSpent)} Personal left`
}

function resolveOneInjury(state, incoming, avoid) {
  const { targetId, injury, option } = incoming
  const target = state.combatants[targetId]
  const name = target.character.name
  let next = { ...state }
  if (avoid && option.possible) {
    const avoided = avoidInjury(target.character, target.condition, injury, option.kind)
    // Blast Stress Avoid: stagger fall + get-up on the landing tile (unitPose / FigureView).
    next = updateCombatant(next, targetId, {
      condition: avoided.condition,
      ...(isExplosionInjury(injury) ? thrownCombatant(next, target, injury) : {}),
    })
    if (option.kind === 'threat') next = payAvoidThreat(next, target.character, option)
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
        stats.threat.spentByNpcs += option.shared
      }
    })
    const paid =
      option.kind === 'stress'
        ? `takes ${avoided.taken} Stress${avoided.overflow ? ` (needed ${option.cost}; the track is full)` : ''} (${statusText(next.combatants[targetId])})`
        : `spends ${option.cost} Threat (${threatSpendText(option, target.character, next)})`
    const lines = [`${name} avoids the Injury: ${paid}. Not Defeated.`]
    if (avoided.complication) lines.push(`${name} suffers a complication: ${avoided.complication.name} (${avoided.overflow} Stress over the maximum, Book p.277).`)
    if (avoided.becameFatigued) {
      lines.push(`${name} is Fatigued: +1 Difficulty on all tasks, no more Stress, and one attribute shut down (Book p.278).`)
      next = startFatigueChoice(next, targetId, lines)
    }
    return { state: next, lines, avoided: true }
  }
  const condition = takeHit(target.character, target.condition, injury)
  const thrown = isExplosionInjury(injury) ? thrownCombatant(next, target, injury) : { blastReact: null }
  next = updateCombatant(next, targetId, { condition, inCover: false, guard: null, ...thrown })
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
export function startFatigueChoice(state, combatantId, lines) {
  const combatant = state.combatants[combatantId]
  if (controllerFor(combatant).answersPrompts(combatant)) return { ...state, pendingFatigue: { combatantId } }
  const { attributeId, reason } = chooseFatigueAttribute({ combatant })
  lines.push(`AI Decision: shut down ${getAttributeName(attributeId)}`, `Reason: ${reason}`)
  return updateCombatant(state, combatantId, { condition: chooseFatiguedAttribute(combatant.condition, attributeId) })
}

// Book p.291-292 Avoid Injury: whether (and at what cost) this target could avoid this Injury now: Stress for a main or
// supporting character, Threat for a notable NPC (once a scene), never for a minor NPC.
export const avoidOptionFor = (state, target, injury) =>
  getAvoidOption(target.character, target.condition, injury, { threat: state.resources.threat, avoidedThisScene: state.avoidedThisScene, personalThreatSpent: state.personalThreatSpent })

// The Injury would Defeat this target: they couldn't avoid it. What the AI weighs a shot by.
export const injuryDefeats = (state, target, injury) => !avoidOptionFor(state, target, injury).possible

// A hit lands. Prototype: always Avoid Injury when the rules allow it (Stress or Threat), else suffer Defeat — same for
// weapon attacks, blasts and hazards (designer 2026-10-15 / 2026-10-18). Returns { state, lines, avoided }.
export function inflictInjury(state, attackerId, targetId, injury) {
  const target = state.combatants[targetId]
  const option = avoidOptionFor(state, target, injury)
  const incoming = { targetId, attackerId, injury, option }
  const lines = [`Injury: ${injuryTypeName(injury.type)}, Severity ${injury.severity}${severityText(injury)}`]
  if (!option.possible) {
    if (option.reason) lines.push(`Cannot Avoid Injury: ${option.reason}`)
    const resolved = resolveInjury(state, incoming, false)
    return { state: resolved.state, lines: [...lines, ...resolved.lines], avoided: false }
  }
  const resolved = resolveInjury(state, incoming, true)
  return { state: resolved.state, lines: [...lines, ...resolved.lines], avoided: true }
}

// Hook (Book p.292): Momentum spent on a successful attack adds severity, 2 per point (1 with Intense), at most +2.
// requested: points asked for. Returns { added, cost } within what the pool can pay (party only; nobody asks yet).
export function affordAddedSeverity(resources, weapon, requested = 0, playerSide) {
  if (!playerSide || !requested) return { added: 0, cost: 0 }
  const each = addedSeverityCost(weapon)
  const added = Math.min(MAX_ADDED_SEVERITY, requested, Math.floor(resources.momentum / each))
  return { added, cost: added * each }
}
