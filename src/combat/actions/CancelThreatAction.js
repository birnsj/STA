import { spendMomentum } from '../../rules/missionResources.js'
import { withStats } from '../combatLog.js'
import { ADAPTATION_MOMENTUM_SPENDS } from '../turnActions.js'
import { CombatAction } from './CombatAction.js'

// VIDEOGAME ADAPTATION (off unless actions.json turns it on; not a book spend): 1 Momentum removes 1 Threat.
export class CancelThreatAction extends CombatAction {
  constructor() {
    super('cancelThreat')
  }

  unavailableReason(state) {
    if (!ADAPTATION_MOMENTUM_SPENDS) return 'Not in these rules.'
    if (state.pending) return 'Resolve the roll first.'
    return state.resources.threat > 0 && spendMomentum(state.resources, 1) ? null : 'Needs 1 Momentum and some Threat.'
  }

  apply(state, actor, params) {
    const resources = spendMomentum(state.resources, 1)
    const decided = this.decide(state, actor, params)
    const next = withStats({ ...decided.state, resources: { ...resources, threat: resources.threat - 1 } }, (stats) => {
      stats.momentum.spentCancelThreat += 1
      stats.threat.cancelled += 1
    })
    return this.record(next, actor, {}, [...decided.lines, `Momentum spent to cancel 1 Threat (Momentum ${next.resources.momentum}, Threat ${next.resources.threat}).`])
  }
}
