// Retreat (designer decisions, Oct 2026): an enemy whose Stress track is full (no Stress left) breaks, and on its next
// turn flees the battle (actions/FleeAction.js); until then the party can still finish it. The fight is won once every
// enemy still up has fled. The book has no morale rule; Core p.284 only notes that a fight can end with one side
// retreating. Only enemies with a Stress track can break (Minor, Notable and Major NPCs have none).
import { getMaxStress, remainingStress } from '../rules/personalCondition.js'
import { addLog, updateCombatant } from './combatLog.js'
import { getCombatantList, isActive } from './combatSelectors.js'

const breaksAndRuns = (combatant) =>
  combatant.side === 'enemy' &&
  isActive(combatant) &&
  !combatant.retreating &&
  getMaxStress(combatant.character).value > 0 &&
  remainingStress(combatant.character, combatant.condition) === 0

// After every combat step: enemies out of Stress start retreating.
export function withRetreats(state) {
  if (state.outcome) return state
  let next = state
  getCombatantList(state)
    .filter(breaksAndRuns)
    .forEach((enemy) => {
      next = updateCombatant(next, enemy.id, { retreating: true })
      next = addLog(next, [`${enemy.character.name} has no Stress left and breaks: it flees on its next turn.`], 'info')
    })
  return next
}

// The AI's step for a retreating enemy: it flees the battle.
export const retreatStep = () => ({ type: 'flee', decision: 'Flee', reason: 'Out of Stress: flees the battle.' })
