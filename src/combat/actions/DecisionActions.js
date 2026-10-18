import { getAttributeName } from '../../character/runtimeCharacter.js'
import { chooseFatiguedAttribute, needsFatigueAttribute } from '../../rules/personalCondition.js'
import { counterattackStep } from '../combatCounterattack.js'
import { addLog, updateCombatant } from '../combatLog.js'
import { withOutcome } from '../combatTurnOrder.js'
import { CombatAction } from './CombatAction.js'

// The answers to the prompts that stop play until someone decides (state.pendingFatigue, state.pendingCounterattack):
// the player's for a party member, or Auto Combat's (action.reason). Not the acting combatant's actions, so they ignore
// whose turn it is. Avoid Injury no longer waits (combatInjuries.js settles it at once).
class DecisionAction extends CombatAction {
  unavailableReason(state) {
    return state[this.prompt] ? null : 'Nothing to decide.'
  }

  reduce(state, actor, action) {
    return this.apply(state, actor, action)
  }
}

// Book p.278: the attribute a newly Fatigued party member shuts down (action.attribute).
export class FatigueDecisionAction extends DecisionAction {
  constructor() {
    super('chooseFatigueAttribute')
    this.prompt = 'pendingFatigue'
  }

  apply(state, actor, action) {
    const pending = state.pendingFatigue
    const combatant = pending && state.combatants[pending.combatantId]
    if (!combatant || !needsFatigueAttribute(combatant.condition)) return state
    const condition = chooseFatiguedAttribute(combatant.condition, action.attribute)
    if (condition === combatant.condition) return state
    const next = updateCombatant({ ...state, pendingFatigue: null }, combatant.id, { condition })
    return addLog(next, [
      ...(action.reason ? [`AI Decision: shut down ${getAttributeName(action.attribute)}`, `Reason: ${action.reason}`] : []),
      `${combatant.character.name} is Fatigued: ${getAttributeName(action.attribute)} is shut down (its tasks automatically fail).`,
    ])
  }
}

// Book p.290 Counterattack: the decision for a party defender who won an opposed attack (action.accept,
// action.injuryMode).
export class CounterattackDecisionAction extends DecisionAction {
  constructor() {
    super('counterattackDecision')
    this.prompt = 'pendingCounterattack'
  }

  apply(state, actor, action) {
    return withOutcome(counterattackStep(state, action))
  }
}
