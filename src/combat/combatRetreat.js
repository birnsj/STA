// Retreat (designer decision, Oct 2026; actions.json social): an enemy whose Stress track is full (no Stress left) runs
// from the party and leaves the fight once no party member has line of fire to it. The book has no morale rule; Core
// p.284 only notes that a fight can end with one side retreating. Its return later (regrouping) is the world's business
// (exploration/combatLink.js endCombat).
import { getMaxStress, remainingStress } from '../rules/personalCondition.js'
import { addLog, updateCombatant } from './combatLog.js'
import { canMove, canSprint, getReachable } from './combatMovement.js'
import { awaitingDecision, getActiveCombatant, getCombatantList, isActive } from './combatSelectors.js'
import { hasLineOfFire, tileDistance } from './rangeSystem.js'
import { advanceTurn, withOutcome } from './combatTurnOrder.js'

const breaksAndRuns = (combatant) =>
  combatant.side === 'enemy' &&
  isActive(combatant) &&
  !combatant.retreating &&
  getMaxStress(combatant.character).value > 0 &&
  remainingStress(combatant.character, combatant.condition) === 0

const partyMembers = (state) => getCombatantList(state).filter((c) => c.side === 'player' && isActive(c))
const exposure = (state, position) => partyMembers(state).filter((member) => hasLineOfFire(state.map, member.position, position)).length
const nearestParty = (state, position) => Math.min(...partyMembers(state).map((member) => tileDistance(member.position, position)))

// After every combat step: enemies out of Stress start retreating, and retreating enemies out of every party member's
// line of fire leave the fight (not while a roll or decision is still open). One that leaves on its own turn ends it.
export function withRetreats(state) {
  if (state.outcome) return state
  let next = state
  getCombatantList(state)
    .filter(breaksAndRuns)
    .forEach((enemy) => {
      next = updateCombatant(next, enemy.id, { retreating: true })
      next = addLog(next, [`${enemy.character.name} has no Stress left and retreats.`], 'info')
    })
  if (next.pending || awaitingDecision(next) || next.directed) return next
  const leaving = getCombatantList(next).filter((c) => c.retreating && isActive(c) && !exposure(next, c.position))
  if (!leaving.length) return next
  const activeId = getActiveCombatant(next)?.id
  leaving.forEach((enemy) => {
    next = updateCombatant(next, enemy.id, { left: true })
    next = addLog(next, [`${enemy.character.name} is out of sight and leaves the fight.`], 'info')
  })
  next = withOutcome(next)
  return !next.outcome && leaving.some((enemy) => enemy.id === activeId) ? advanceTurn(next) : next
}

// The AI's step for a retreating enemy: Sprint (else Move) to the reachable tile fewest party members can shoot at,
// then the farthest from the party; end the turn when that gains nothing. Prototype heuristic, flag for designer.
export function retreatStep(state, self) {
  const here = { exposure: exposure(state, self.position), distance: nearestParty(state, self.position) }
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
