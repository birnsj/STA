import { ACTION_TYPE_NAMES, actionTypeOf } from '../turnActions.js'
import { canAfford } from '../combatSelectors.js'
import { addLog, markAction, recordDecision } from '../combatLog.js'

// One kind of combat action (a reducer action type). An instance holds nothing but its type; every method takes the combat
// state as it is now and returns a value or a new state, so seeded replays, Auto Combat and the headless tests stay
// deterministic. The reducer looks the instance up by the plain action's `type` (actions/registry.js).
// params: the plain action object as dispatched ({ type, targetId, ... }, plus decision/reason from the AI).
export class CombatAction {
  constructor(type) {
    this.type = type
  }

  // The action id whose type ('major' | 'minor' | 'free', actions.json) it spends.
  get cost() {
    return this.type
  }

  // Why the acting combatant can't take it now (null = it can). The default checks the action economy only.
  unavailableReason(state, actor) {
    return canAfford(state, actor, this.cost) ? null : `No ${ACTION_TYPE_NAMES[actionTypeOf(this.cost)]} action left.`
  }

  // The new state. Returns the very same state when the action turns out not to be allowed (callers rely on it).
  apply(state) {
    return state
  }

  reduce(state, actor, params) {
    if (!actor || this.unavailableReason(state, actor, params)) return state
    return this.apply(state, actor, params)
  }

  // The state as if this action's lasting effect were already in place, without rolling, logging or spending anything:
  // what the AI weighs a plan against. null when the action has no such effect.
  hypothetical() {
    return null
  }

  // The shared bookkeeping: the AI's decision lines (none for the player's actions), then the action marker and log entry.
  decide(state, actor, params, details) {
    return recordDecision(state, actor, params, details)
  }

  record(state, actor, details, lines, markType = this.type) {
    return addLog(markAction(state, markType, actor.id, details), lines)
  }
}
