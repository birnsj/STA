import { updateCombatant } from '../combatLog.js'
import { advanceTurn, withOutcome } from '../combatTurnOrder.js'
import { CombatAction } from './CombatAction.js'

// Designer decision (Oct 2026): an enemy that retreated (no Stress left, combatRetreat.js) spends its next turn fleeing
// and leaves the battle. Once every enemy still up has fled, the fight is won.
export class FleeAction extends CombatAction {
  constructor() {
    super('flee')
  }

  get cost() {
    return 'endTurn'
  }

  unavailableReason(state, actor) {
    if (state.pending || state.directed) return 'Not now.'
    return actor.retreating && !actor.fled ? null : 'Only a retreating enemy flees.'
  }

  apply(state, actor, params) {
    const decided = this.decide(state, actor, params)
    const fled = updateCombatant({ ...decided.state, turn: { ...state.turn, done: true } }, actor.id, { fled: true, inCover: false, guard: null })
    const next = withOutcome(this.record(fled, actor, {}, [...decided.lines, `${actor.character.name} beams out of the battle.`]))
    return next.outcome ? next : advanceTurn(next)
  }
}
