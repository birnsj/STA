import { getAttributeName } from '../../character/runtimeCharacter.js'
import { chooseFatiguedAttribute, needsFatigueAttribute } from '../../rules/personalCondition.js'
import { counterattackStep } from '../combatCounterattack.js'
import { resolveInjury } from '../combatInjuries.js'
import { addLog, markAction, updateCombatant } from '../combatLog.js'
import { isActive } from '../combatSelectors.js'
import { withOutcome } from '../combatTurnOrder.js'
import { CombatAction } from './CombatAction.js'

// The answers to the prompts that stop play until someone decides (state.incomingInjury, state.pendingFatigue,
// state.pendingCounterattack): the player's for a party member, or Auto Combat's (action.reason). Not the acting
// combatant's actions, so they ignore whose turn it is. AI-controlled combatants answer inside the reducer
// (injuryPolicy.js) and never wait.
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

// Book p.292 Avoid Injury: the decision for a party member (action.avoid).
export class InjuryDecisionAction extends DecisionAction {
  constructor() {
    super('injuryDecision')
    this.prompt = 'incomingInjury'
  }

  apply(state, actor, action) {
    const incoming = state.incomingInjury
    if (!incoming) return state
    const target = state.combatants[incoming.targetId]
    const resolved = resolveInjury(state, incoming, Boolean(action.avoid))
    let next = markAction(resolved.state, 'injury', incoming.attackerId, { targetId: target.id, avoided: resolved.avoided, removed: !isActive(resolved.state.combatants[target.id]) })
    if (next.result?.injury && next.result.targetId === target.id) next = { ...next, result: { ...next.result, injury: { ...next.result.injury, decided: resolved.avoided ? 'avoided' : 'suffered' } } }
    next = addLog(next, [
      ...(action.reason ? [`AI Decision: ${resolved.avoided ? 'Avoid Injury' : 'Accept Injury'}`, `Reason: ${action.reason}`] : []),
      `${target.character.name} ${resolved.avoided ? 'chooses to Avoid Injury' : 'accepts the Injury'}.`,
      ...resolved.lines,
    ])
    return withOutcome(next)
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
