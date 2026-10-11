import { addLog } from '../combatLog.js'
import { getTurnGroup, isTurnFinished } from '../combatSelectors.js'
import { advanceTurn, switchToMember } from '../combatTurnOrder.js'
import { CombatAction } from './CombatAction.js'

// End Turn (free): the rest of the party group still to act takes over, in initiative order; else the next turn.
export class EndTurnAction extends CombatAction {
  constructor() {
    super('endTurn')
  }

  unavailableReason(state) {
    return state.pending ? 'Resolve the roll first.' : null
  }

  apply(state, actor, params) {
    // A directed ally passing gives up the directed action (the Momentum is spent); the commander's turn resumes.
    if (state.directed) return addLog({ ...state, turn: { ...state.turn, done: true } }, [`${actor.character.name} passes on the directed action.`])
    const decided = this.decide(state, actor, params)
    const ended = addLog({ ...decided.state, turn: { ...state.turn, done: true } }, [...decided.lines, `${actor.character.name} ends their turn.`])
    const nextMember = this.nextMember(ended, actor)
    return nextMember ? switchToMember(ended, nextMember) : advanceTurn(ended)
  }

  // Whoever End Turn hands over to: the first unfinished member of the party group after the actor, in initiative
  // order (null = the next turn).
  nextMember(state, actor) {
    return getTurnGroup(state).find((id) => id !== actor.id && !isTurnFinished(state, id)) ?? null
  }
}

// Designer decision (Oct 2026): the player picks which member of the party group acts, at any time.
export class SelectCombatantAction extends CombatAction {
  constructor() {
    super('selectCombatant')
  }

  unavailableReason(state, actor, { combatantId }) {
    if (state.pending || state.directed || combatantId === actor.id) return 'Not now.'
    if (!getTurnGroup(state).includes(combatantId) || isTurnFinished(state, combatantId)) return 'Not in the acting group, or finished.'
    return null
  }

  apply(state, actor, { combatantId }) {
    return switchToMember(state, combatantId)
  }
}
