// A hostile NPC: in exploration it behaves as any NPC (perception and reactions by its disposition, NPCController); in
// combat it plays the enemy AI. An NPC becomes one when it turns hostile (controllers.js controllerIdOf), and every
// combatant on the enemy side is one.
import { normalStep } from '../combat/autoCombat.js'
import { canMove, getOpponents, getReachable } from '../combat/combatState.js'
import { tileDistance } from '../combat/rangeSystem.js'
import { NPCController } from './NPCController.js'

export class EnemyController extends NPCController {
  combatStep(state, self, { enemyAI = 'classic' } = {}) {
    return normalStep(state, self, enemyAI)
  }

  // In a fight started in the world, an enemy that knows of no party member searches instead of fighting: it moves
  // toward the nearest place it last knew of one (or where it was called to, link.searchPoints), then waits.
  searchStep(combat, self, { link }) {
    if (self.retreating || !combat.knowledge?.[self.id] || getOpponents(combat, self).length) return null
    const places = Object.values(combat.knowledge[self.id]).map((entry) => entry.lastKnownPosition).filter(Boolean)
    if (link.searchPoints[self.id]) places.push(link.searchPoints[self.id])
    const goal = places.sort((a, b) => tileDistance(self.position, a) - tileDistance(self.position, b))[0]
    const hold = (reason) => ({ type: 'endTurn', decision: 'Hold position', reason })
    if (!goal) return hold('No party member known, and nowhere to search.')
    if (!canMove(combat, self)) return hold('No party member in sight.')
    const tiles = [...getReachable(combat, self).values()].sort((a, b) => tileDistance(a.position, goal) - tileDistance(b.position, goal) || a.steps - b.steps)
    const best = tiles[0]
    if (!best || tileDistance(best.position, goal) >= tileDistance(self.position, goal)) return hold('Reached the last known position; no party member in sight.')
    return { type: 'move', destination: best.position, decision: 'Search', reason: `No party member known; moving toward the last known position (${goal.x},${goal.y}).` }
  }
}
