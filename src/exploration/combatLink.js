// Combat in the exploration world: thin wrappers over the WorldEncounter (WorldEncounter.js), for the reducer, screen
// and tests that already call these.
import { worldEncounter } from './WorldEncounter.js'

export {
  emitCombatNoise,
  getCombatDiagnostics,
  getCombatObjectAssist,
  getCombatObjectLines,
  getCombatObjects,
  MODE,
  previewCombatObject,
  recommendCombatObject,
  requestCombat,
} from './WorldEncounter.js'

// The single way into combat. request: { triggerNpcId, triggerTargetId, source, position }.
export const startCombat = (state, request) => worldEncounter.start(state, request)

// Every combat action from the combat screen: a combat action, { type: 'interact', ... } or { type: 'aiStep', ... }.
export const combatAction = (state, action) => worldEncounter.step(state, action)

// The single way out of combat.
export const endCombat = (state) => worldEncounter.end(state)
