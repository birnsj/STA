// Retreat (designer decisions, Oct 2026; actions.json social): an enemy whose Stress track is full (no Stress left) breaks
// and runs from the party, but never leaves the fight: the party has to hunt it down. The book has no morale rule;
// Core p.284 only notes that a fight can end with one side retreating. Only enemies with a Stress track can break
// (Minor, Notable and Major NPCs have none).
import { getMaxStress, remainingStress } from '../rules/personalCondition.js'
import { addLog, updateCombatant } from './combatLog.js'
import { canMove, canSprint, getReachable } from './combatMovement.js'
import { getCombatantList, isActive } from './combatSelectors.js'
import { hasLineOfFire, tileDistance } from './rangeSystem.js'

const breaksAndRuns = (combatant) =>
  combatant.side === 'enemy' &&
  isActive(combatant) &&
  !combatant.retreating &&
  getMaxStress(combatant.character).value > 0 &&
  remainingStress(combatant.character, combatant.condition) === 0

const partyMembers = (state) => getCombatantList(state).filter((c) => c.side === 'player' && isActive(c))
const exposure = (state, position) => partyMembers(state).filter((member) => hasLineOfFire(state.map, member.position, position)).length
const nearestParty = (state, position) => Math.min(...partyMembers(state).map((member) => tileDistance(member.position, position)))

// After every combat step: enemies out of Stress start retreating.
export function withRetreats(state) {
  if (state.outcome) return state
  let next = state
  getCombatantList(state)
    .filter(breaksAndRuns)
    .forEach((enemy) => {
      next = updateCombatant(next, enemy.id, { retreating: true })
      next = addLog(next, [`${enemy.character.name} has no Stress left and retreats.`], 'info')
    })
  return next
}

// The AI's step for a retreating enemy: Sprint (else Move) to the reachable tile fewest party members can shoot at,
// then the farthest from the party; end the turn when that gains nothing. Once out of sight it stays hidden there, so
// the party can catch it (running on would let a faster enemy circle the map forever). Prototype heuristic, flagged.
export function retreatStep(state, self) {
  const here = { exposure: exposure(state, self.position), distance: nearestParty(state, self.position) }
  if (here.exposure === 0) return { type: 'endTurn', decision: 'Retreat (hide)', reason: 'Out of Stress: hiding out of the party\'s sight.' }
  for (const kind of ['sprint', 'move']) {
    if (!(kind === 'sprint' ? canSprint(state, self) : canMove(state, self))) continue
    const best = [...getReachable(state, self, kind).values()]
      .filter((entry) => entry.steps > 0)
      .map((entry) => ({ position: entry.position, exposure: exposure(state, entry.position), distance: nearestParty(state, entry.position) }))
      .sort((a, b) => a.exposure - b.exposure || b.distance - a.distance)[0]
    if (best && (best.exposure < here.exposure || (best.exposure === here.exposure && best.distance > here.distance))) {
      const verb = kind === 'sprint' ? 'Sprint' : 'Move'
      return {
        type: kind,
        destination: best.position,
        decision: `Retreat (${verb})`,
        reason: best.exposure ? `Out of Stress: running from the party (${best.exposure} can still see it there).` : 'Out of Stress: running out of the party\'s sight.',
      }
    }
  }
  return { type: 'endTurn', decision: 'Retreat', reason: 'Out of Stress and retreating; nowhere better to run this turn.' }
}
