import { AIM_TEXT } from '../combatAttacks.js'
import { canAim } from '../combatSelectors.js'
import { actionsLeftText, spendTurnAction } from '../turnActions.js'
import { CombatAction } from './CombatAction.js'

// Aim (minor, Book p.288): a reroll on this turn's attack. Doesn't stack; once per turn.
export class AimAction extends CombatAction {
  constructor() {
    super('aim')
  }

  unavailableReason(state, actor) {
    return canAim(state, actor) ? null : 'Already aimed, or no Minor action left.'
  }

  apply(state, actor, params) {
    const decided = this.decide(state, actor, params)
    const used = spendTurnAction(decided.state, actor.id, 'aim')
    const turn = { ...used.turn, aimReroll: true, aimed: true }
    return this.record({ ...used, turn }, actor, {}, [...decided.lines, `Aim: ${AIM_TEXT} (${actionsLeftText(turn)})`])
  }

  hypothetical(state) {
    return { ...state, turn: { ...state.turn, aimReroll: true } }
  }
}
