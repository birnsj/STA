import { injuryText, reviveCondition, treatInjury } from '../../rules/personalCondition.js'
import { updateCombatant } from '../combatLog.js'
import { SCAN_TRAIT } from '../combatScan.js'
import { previewFirstAid, previewGuard, previewScan, rollCombatTask } from '../combatTasks.js'
import { canTakeCover } from '../coverSystem.js'
import { CombatAction } from './CombatAction.js'

// A predefined combat task (combatTasks.js): the preview the Task panel shows, then the one shared roll
// (rollCombatTask: the STA 2E task, bought dice, the assist die, Momentum or Threat), then what success or failure means.
// Subclasses supply preview() and outcome().
export class TaskAction extends CombatAction {
  preview() {
    throw new Error(`${this.type}: preview() not implemented`)
  }

  unavailableReason(state, actor, params) {
    const preview = this.preview(state, actor, params)
    return preview.available ? null : preview.reason ?? 'Not available.'
  }

  reduce(state, actor, params) {
    if (!actor) return state
    const preview = this.preview(state, actor, params)
    if (!preview.available) return state
    const decided = this.decide(state, actor, params)
    const rolled = rollCombatTask(decided.state, actor, preview, params.purchase, this.type)
    if (!rolled) return state
    const { state: next, details, lines } = this.outcome(rolled.state, actor, params, preview, rolled.passed, state)
    return this.record(next, actor, { ...details, passed: rolled.passed }, [...decided.lines, ...rolled.lines, ...lines])
  }

  // { state, details (for the action marker), lines (the result's wording) } after the roll.
  outcome(state) {
    return { state, details: {}, lines: [] }
  }
}

// Book p.289 Guard (major): Insight + Security, Difficulty 0 (+1 for an ally within Reach; +1 with an enemy within
// Reach, p.286). Success: attacks against the guarded character are +1 Difficulty until the start of their next turn.
// Prototype: always rolled (Book p.254 lets a Difficulty 0 task skip the roll; rolling still generates Momentum, and keeps
// one flow for every task).
export class GuardAction extends TaskAction {
  constructor() {
    super('guard')
  }

  preview(state, actor, { targetId }) {
    return previewGuard(state, actor.id, targetId)
  }

  outcome(state, actor, params, preview, passed, before) {
    const target = state.combatants[preview.targetId]
    const next = passed ? updateCombatant(state, target.id, { guard: { byId: actor.id, round: before.round } }) : state
    const line = passed ? `${target.character.name} is guarded: attacks against them are +1 Difficulty until the start of their next turn.` : 'The Guard fails.'
    return { state: next, details: { targetId: target.id }, lines: [line] }
  }

  hypothetical(state, actor, { targetId }) {
    return updateCombatant(state, targetId ?? actor.id, { guard: { byId: actor.id, round: state.round } })
  }
}

// Book p.289 First Aid (major): Daring + Medicine on an adjacent ally. Difficulty 2 revives a Defeated character (the
// Injury stays; a Stun Injury then wears off at the end of their next turn, Book p.292); Difficulty = an Injury's
// severity treats that Injury (no penalty from it, but it is still an Injury). Revive and treat are separate actions.
export class FirstAidAction extends TaskAction {
  constructor() {
    super('firstAid')
  }

  preview(state, actor, { targetId, mode }) {
    return previewFirstAid(state, actor.id, targetId, mode)
  }

  outcome(state, actor, { mode }, preview, passed) {
    const target = state.combatants[preview.targetId]
    const name = target.character.name
    const injuryId = mode.startsWith('treat:') ? mode.slice('treat:'.length) : null
    let next = state
    let line = injuryId ? `${name}'s Injury is not treated.` : `${name} stays down.`
    if (passed && !injuryId) {
      const condition = reviveCondition(target.condition)
      next = updateCombatant(next, target.id, { condition, inCover: canTakeCover(next.map, target.position) })
      const still = condition.injuries.length ? ` Still injured: ${condition.injuries.map(injuryText).join('; ')}.` : ''
      line = `${name} is no longer Defeated.${still}`
    }
    if (passed && injuryId) {
      const condition = treatInjury(target.condition, injuryId)
      next = updateCombatant(next, target.id, { condition })
      line = `${name}'s ${injuryText(condition.injuries.find((injury) => injury.id === injuryId))}: no penalty from it now; it is still an Injury.`
    }
    return { state: next, details: { targetId: target.id, mode }, lines: [line] }
  }
}

// Scan an enemy (PROTOTYPE, major, combatScan.js): success makes its Protection, weapons and tactics known to the party
// for the rest of the fight.
export class ScanAction extends TaskAction {
  constructor() {
    super('scan')
  }

  preview(state, actor, { targetId }) {
    return previewScan(state, actor.id, targetId)
  }

  outcome(state, actor, params, preview, passed) {
    const name = state.combatants[preview.targetId].character.name
    const next = passed ? { ...state, scanned: { ...state.scanned, [preview.targetId]: true } } : state
    const line = passed
      ? `${name} is scanned: Protection, weapons and tactics are known, and it has the trait ${SCAN_TRAIT.name} (attacks on it ${SCAN_TRAIT.attackDifficulty * SCAN_TRAIT.potency} Difficulty) for the rest of the fight.`
      : `The scan of ${name} reveals nothing useful.`
    return { state: next, details: { targetId: preview.targetId }, lines: [line] }
  }

  hypothetical(state, actor, { targetId }) {
    return { ...state, scanned: { ...state.scanned, [targetId]: true } }
  }
}
