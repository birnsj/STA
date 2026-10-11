import { previewSocial, socialStep } from '../combatSocial.js'
import { CombatAction } from './CombatAction.js'

// Persuade / Intimidate (major, designer decision Oct 2026; Book pp.279-282): ask an enemy in earshot to surrender. The
// opposed roll and the enemy's answer are combatSocial.js.
export class SocialAction extends CombatAction {
  preview(state, actor, { targetId }) {
    return previewSocial(state, actor.id, targetId, this.type)
  }

  unavailableReason(state, actor, params) {
    const preview = this.preview(state, actor, params)
    return preview.available ? null : preview.reason ?? 'Not available.'
  }

  reduce(state, actor, params) {
    return actor ? socialStep(state, actor, params) : state
  }
}
