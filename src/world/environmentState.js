// The exploration state with a new environment (world/environment.js): the world map shows each destructible's current
// tile and what smoke hides, and a running fight gets the same environment and tiles. The same state when the
// environment is unchanged. Hazards are never challenge objects (docs/performance.md): their Neutralize task is built on
// demand (world/EnvironmentalHazard.js).
import { toBattleMap } from '../combat/battleMap.js'
import { resolveGroundSupports } from '../rules/inventory.js'
import { applyEnvironmentTiles } from './environment.js'

export function withEnvironment(state, environment) {
  if (!environment || environment === state.environment) return state
  let next = { ...state, environment }
  const map = applyEnvironmentTiles(state.party.map, environment)
  if (map !== state.party.map) {
    next = { ...next, party: { ...next.party, map }, world: { ...next.world, map } }
    // Elevated inventory drops re-bind to whatever surface (or floor) remains under them.
    next = resolveGroundSupports(next)
  }
  if (next.combat && next.combat.environment !== environment) {
    next = { ...next, combat: { ...next.combat, environment, map: applyEnvironmentTiles(toBattleMap(map), environment) } }
  }
  return next
}
