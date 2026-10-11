import { canAssist } from '../combatAttacks.js'
import { canAfford } from '../combatSelectors.js'
import { actionsLeftText, spendTurnAction } from '../turnActions.js'
import { CombatAction } from './CombatAction.js'

// Assist (major, Book p.288): the ally's next task this round adds the helper's d20.
export class AssistAction extends CombatAction {
  constructor() {
    super('assist')
  }

  unavailableReason(state, actor, { allyId }) {
    if (!canAfford(state, actor, 'assist')) return 'No Major action left.'
    return canAssist(state, actor, state.combatants[allyId]) ? null : 'Assist an ally in the acting group who has yet to finish.'
  }

  apply(state, actor, params) {
    const ally = state.combatants[params.allyId]
    const decided = this.decide(state, actor, params)
    const used = spendTurnAction(decided.state, actor.id, 'assist')
    const next = { ...used, assists: { ...state.assists, [ally.id]: actor.id } }
    return this.record(next, actor, { allyId: ally.id }, [
      ...decided.lines,
      `Assist: ${ally.character.name}'s next task this round adds ${actor.character.name}'s 1d20 (${actionsLeftText(used.turn)})`,
    ])
  }

  hypothetical(state, actor, { allyId }) {
    return { ...state, assists: { ...state.assists, [allyId]: actor.id } }
  }
}
