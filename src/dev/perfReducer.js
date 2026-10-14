import { PERF, perfEnd, perfOff, perfStart } from './perfProbe.js'

// Development-only (docs/performance.md): the exploration reducer with the probe's hooks, or the reducer itself while
// the probe is off. Times each world tick (sim.tickTotal: party, NPCs and perception, without React), and with
// ?off=npcs empties the world's NPCs when a mission starts.
export function withPerf(reducer) {
  if (!PERF) return reducer
  return (state, action) => {
    const started = perfStart()
    const next = reducer(state, action)
    if (action.type === 'tick') perfEnd('sim.tickTotal', started)
    if (action.type === 'reset' && perfOff('npcs') && next?.world) return { ...next, world: { ...next.world, npcIds: [], npcs: {} } }
    return next
  }
}
