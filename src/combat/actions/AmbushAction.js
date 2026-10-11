import { ambushStep, canAmbush } from '../combatAmbush.js'
import { CombatAction } from './CombatAction.js'

// The party's one Ambush attempt while unspotted (combatAmbush.js): the opposed roll, and the turn order it leaves.
export class AmbushAction extends CombatAction {
  constructor() {
    super('ambush')
  }

  unavailableReason(state) {
    return canAmbush(state) ? null : 'No ambush now.'
  }

  reduce(state, actor, action) {
    return ambushStep(state, action)
  }
}
