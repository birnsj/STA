import { updateCombatant } from '../combatLog.js'
import { isProne } from '../combatProne.js'
import { actionsLeftText, spendTurnAction } from '../turnActions.js'
import { CombatAction } from './CombatAction.js'

// Stand (minor, Book p.288): get up from being prone. Only offered while prone.
export class StandAction extends CombatAction {
  constructor() {
    super('stand')
  }

  unavailableReason(state, actor) {
    if (!isProne(actor)) return 'Not prone.'
    return super.unavailableReason(state, actor)
  }

  apply(state, actor, params) {
    const decided = this.decide(state, actor, params)
    const used = spendTurnAction(decided.state, actor.id, 'stand')
    const next = updateCombatant(used, actor.id, { prone: false })
    return this.record(next, actor, {}, [...decided.lines, `Stand: ${actor.character.name} gets up (${actionsLeftText(next.turn)})`])
  }
}
