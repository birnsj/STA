// React state does not need to commit at a monitor's full refresh rate. Sixty simulation presentations per second keep
// movement smooth while preventing 120/144/180 Hz displays from multiplying the full ExplorationScreen commit cost.
export const WORLD_TICK_HZ = 60
export const WORLD_TICK_MS = 1000 / WORLD_TICK_HZ
const FRAME_TOLERANCE_MS = 1

export const createWorldTickCadence = (now) => ({ lastTick: now })

export function takeWorldTick(cadence, now) {
  const elapsed = now - cadence.lastTick
  if (elapsed < WORLD_TICK_MS - FRAME_TOLERANCE_MS) return null
  cadence.lastTick = now
  return Math.max(0, elapsed / 1000)
}
