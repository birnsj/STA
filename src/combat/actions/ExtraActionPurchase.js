import { spendMomentum, spendThreat } from '../../rules/missionResources.js'
import { withStats } from '../combatLog.js'
import { extraActionPool, extraMinorBlock, secondMajorBlock } from '../combatSelectors.js'
import { actionsLeftText, EXTRA_ACTIONS } from '../turnActions.js'
import { CombatAction } from './CombatAction.js'

// Pays for an Extra Minor or Second Major: the party from group Momentum, an NPC by spending Threat (Book p.265).
// Returns { state, text } with the log wording for what was paid.
function payForExtraAction(state, actor, cost, countTask) {
  if (extraActionPool(actor) === 'momentum') {
    const resources = spendMomentum(state.resources, cost)
    const next = withStats({ ...state, resources }, (stats) => {
      countTask(stats)
      stats.momentum.spentExtraActions = (stats.momentum.spentExtraActions ?? 0) + cost
    })
    return { state: next, text: `Momentum spent: ${cost} (group pool now ${resources.momentum})` }
  }
  const resources = spendThreat(state.resources, cost)
  const next = withStats({ ...state, resources }, (stats) => {
    countTask(stats)
    stats.threat.spentByNpcs += cost
  })
  return { state: next, text: `Threat spent: ${cost} (Threat now ${resources.threat})` }
}

// Book p.260: 1 Momentum (an NPC: 1 Threat), one more minor action this turn (once per turn).
export class BuyExtraMinorAction extends CombatAction {
  constructor() {
    super('buyExtraMinor')
  }

  unavailableReason(state, actor) {
    return extraMinorBlock(state, actor)
  }

  apply(state, actor, params) {
    const decided = this.decide(state, actor, params)
    const turn = { ...state.turn, minor: state.turn.minor + 1, extraMinor: true }
    const paid = payForExtraAction(decided.state, actor, EXTRA_ACTIONS.extraMinorCost, (stats) => (stats.tasks.extraMinor += 1))
    return this.record({ ...paid.state, turn }, actor, {}, [...decided.lines, `${paid.text} for an extra minor action (${actionsLeftText(turn)})`], 'extraMinor')
  }
}

// Book p.289: 2 Momentum (an NPC: 2 Threat), a second major action this turn; its task is +1 Difficulty.
export class BuySecondMajorAction extends CombatAction {
  constructor() {
    super('buySecondMajor')
  }

  unavailableReason(state, actor) {
    return secondMajorBlock(state, actor)
  }

  apply(state, actor, params) {
    const decided = this.decide(state, actor, params)
    const turn = { ...state.turn, major: state.turn.major + 1, secondMajor: true }
    const paid = payForExtraAction(decided.state, actor, EXTRA_ACTIONS.secondMajorCost, (stats) => (stats.tasks.secondMajor += 1))
    return this.record(
      { ...paid.state, turn },
      actor,
      {},
      [...decided.lines, `${paid.text} for a second major action (${actionsLeftText(turn)}). Its task is +${EXTRA_ACTIONS.secondMajorDifficulty} Difficulty.`],
      'secondMajor',
    )
  }

  hypothetical(state) {
    return { ...state, turn: { ...state.turn, major: 1, secondMajor: true } }
  }
}
