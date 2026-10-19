// Runtime helpers for patrol waypoint idle fidgets (no editor / character-library imports).
import { getIdleFidgets, getSpriteAnimation } from '../rules/appearance.js'

export function isWaypointAnimation(id) {
  return typeof id === 'string' && Boolean(getSpriteAnimation(id)) && getIdleFidgets().animations.includes(id)
}

// starting: true on the first wait frame after arrival. Returns null when finished or invalid (idle for the rest of the wait).
export function tickWaypointAnim(prev, point, starting, seconds) {
  if (!point?.animation || !isWaypointAnimation(point.animation)) return null
  const sheet = getSpriteAnimation(point.animation)
  if (!sheet) return null
  const duration = Number.isFinite(point.animationDuration) ? Math.max(0, Number(point.animationDuration)) : sheet.seconds
  if (duration <= 0) return null
  const loop = point.animationLoop === true
  if (starting || !prev || prev.name !== point.animation) {
    return {
      name: point.animation,
      playKey: `wp-${point.animation}-0`,
      elapsed: 0,
      duration,
      loop,
      natural: sheet.seconds,
      cycle: 0,
    }
  }
  const elapsed = prev.elapsed + seconds
  if (elapsed >= prev.duration) return null
  let { playKey, cycle } = prev
  if (loop && prev.natural > 0) {
    const nextCycle = Math.floor(elapsed / prev.natural)
    if (nextCycle > cycle) {
      cycle = nextCycle
      playKey = `wp-${point.animation}-${cycle}`
    }
  } else if (!loop && elapsed >= prev.natural) {
    return null
  }
  return { ...prev, playKey, elapsed, cycle }
}
