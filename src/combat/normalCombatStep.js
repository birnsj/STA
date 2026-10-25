import { nextAIStep } from './combatAI.js'
import { escapeHazardStep } from './hazardAvoidance.js'
import { standUpStep } from './combatProne.js'
import { retreatStep } from './combatRetreat.js'
import { objectShotStep } from './objectAI.js'
import { PLANNER_PROFILES, plannerStep } from './turnPlanner.js'
import { randomStep } from './randomAI.js'
import { supportStep } from './supportAI.js'

// One ordinary AI decision. Kept apart from the auto-combat runner so actor controllers do not import the runner that
// dispatches back through those same controllers.
export function normalStep(state, self, ai) {
  if (self.retreating) return retreatStep(state, self)
  const escape = escapeHazardStep(state, self)
  if (escape) return escape
  const stand = standUpStep(state, self)
  if (stand) return stand
  if (ai === 'random') return randomStep(state, self)
  const support = supportStep(state, self)
  if (support) return support
  const objectShot = objectShotStep(state, self)
  if (objectShot) return objectShot
  if (PLANNER_PROFILES[ai]) return plannerStep(state, self, ai)
  return nextAIStep(state)
}
