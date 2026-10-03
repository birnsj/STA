// Auto Combat: AI-driven combat on the normal engine. Nothing here depends on React or timers; the screen only decides
// when to take the next step, so the same steps can run headless (runAutoCombat) for later batch simulation.
import { combatReducer, createCombat } from './combatState.js'
import { nextAIStep } from './combatAI.js'

// One AI step for whoever is acting. A rejected step (state unchanged) ends the turn instead of stalling.
export function stepAI(state) {
  if (!state || state.outcome) return state
  const action = nextAIStep(state)
  const next = combatReducer(state, action)
  if (next !== state) return next
  return combatReducer(state, { type: 'endTurn', decision: 'End turn', reason: `The ${action.type} step was not allowed; ending turn.` })
}

// The screen's reducer: the normal combat reducer plus { type: 'aiStep' }.
export const autoCombatReducer = (state, action) => (action.type === 'aiStep' ? stepAI(state) : combatReducer(state, action))

// Runs a whole fight with every combatant AI-controlled, without any UI. Same inputs + seed -> same result.
// map: a parsed map file.
export function runAutoCombat({ encounterId, map, players, seed, maxSteps = 5000 }) {
  let state = createCombat({ encounterId, map, players, seed })
  let steps = 0
  while (!state.outcome && steps < maxSteps) {
    state = stepAI(state)
    steps += 1
  }
  return { state, steps, outcome: state.outcome ?? 'unfinished', rounds: state.round }
}

// Plain-text combat log in chronological order (for copying out of the debug panel).
export function formatCombatLog(state) {
  return state.log
    .map((entry) => {
      if (entry.kind === 'round') return `\n${entry.lines.join('\n')}`
      if (entry.kind === 'turn') return `\n${entry.lines.join('\n')}`
      return entry.lines.join('\n')
    })
    .join('\n')
    .trim()
}
