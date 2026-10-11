import { canCommunicate } from '../../rules/communication.js'
import { spendMomentum } from '../../rules/missionResources.js'
import { withStats } from '../combatLog.js'
import { directBlock, getAuthority, getDirectableAllies } from '../combatTasks.js'
import { actionsLeftText, freshTurn, spendTurnAction } from '../turnActions.js'
import { CombatAction } from './CombatAction.js'

// Book p.289 Direct (major): the character in authority spends 1 Momentum; an ally who can hear immediately takes a major
// action, which the commander assists (Control + Command). No +1 Difficulty for that ally's second major action.
export class DirectAction extends CombatAction {
  constructor() {
    super('direct')
  }

  unavailableReason(state, actor, { allyId }) {
    const block = directBlock(state, actor)
    if (block) return block
    return getDirectableAllies(state, actor).some((candidate) => candidate.id === allyId) ? null : 'That ally cannot be directed now.'
  }

  apply(state, actor, params) {
    const ally = state.combatants[params.allyId]
    const resources = spendMomentum(state.resources, 1)
    const decided = this.decide(state, actor, params)
    const used = spendTurnAction(decided.state, actor.id, 'direct')
    const commanderTurn = used.turn
    const via = canCommunicate(actor, ally, state.comms).via
    let next = {
      ...used,
      resources,
      directed: { commanderId: actor.id, allyId: ally.id, commanderTurn },
      // The ally's directed action counts toward their two major actions this round (spendTurnAction on their action).
      turn: { ...freshTurn(), major: 1, minor: 0 },
    }
    next = withStats(next, (stats) => {
      stats.tasks.direct += 1
      stats.momentum.spentDirect += 1
    })
    const authority = getAuthority(state, actor.side)
    return this.record(next, actor, { allyId: ally.id }, [
      ...decided.lines,
      `Direct: ${actor.character.name} directs ${ally.character.name} (Major action; ${actionsLeftText(commanderTurn)})`,
      `Authority: ${authority.reason}`,
      `${ally.character.name} hears the order ${via === 'communicator' ? 'over the communicator' : 'in earshot'}.`,
      `Momentum spent: 1 (group pool now ${resources.momentum})`,
      `${ally.character.name} takes one Major action now; ${actor.character.name} assists with Control + Command.`,
    ])
  }

  // The commander's turn waits while the ally acts.
  hypothetical(state, actor, { allyId }) {
    return { ...state, directed: { commanderId: actor.id, allyId, commanderTurn: state.turn }, turn: { ...freshTurn(), major: 1, minor: 0 } }
  }
}
