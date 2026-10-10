import { FADED_OPACITY } from './canvasTiles.js'

// A block fading in or out eases between solid and FADED_OPACITY over this long. MapCanvas (the canvas) and
// useFigureWindows (the blocks drawn over figures) both follow it, so a wall fades as one.
export const FADE_MS = 200

// fade: { target (the Set of keys to be see-through), changes (key -> { from, to, start } while a block fades) }.
export function fadeLevelAt(fade, key, now) {
  const change = fade.changes.get(key)
  if (!change) return fade.target.has(key) ? FADED_OPACITY : 1
  const t = Math.min(1, (now - change.start) / FADE_MS)
  return change.from + (change.to - change.from) * t
}

// The fade after the target becomes `faded`: every key that changed starts easing from where it is now (or jumps, when
// not animating).
export function retarget(fade, faded, now, animate = true) {
  if (fade.target === faded) return fade
  const changes = new Map(fade.changes)
  const changed = [...faded].filter((key) => !fade.target.has(key)).concat([...fade.target].filter((key) => !faded.has(key)))
  for (const key of changed) {
    if (animate) changes.set(key, { from: fadeLevelAt(fade, key, now), to: faded.has(key) ? FADED_OPACITY : 1, start: now })
    else changes.delete(key)
  }
  return { target: faded, changes }
}

// The fade without the changes that have finished by now.
export function settle(fade, now) {
  const finished = [...fade.changes].filter(([, change]) => now - change.start >= FADE_MS)
  if (!finished.length) return fade
  const changes = new Map(fade.changes)
  for (const [key] of finished) changes.delete(key)
  return { ...fade, changes }
}

// What to draw see-through now: the Set itself, or a Map of opacities mid-fade (keys still fading out stay in it until
// they are solid).
export function fadeLevels(fade, now) {
  if (!fade.changes.size) return fade.target
  const levels = new Map([...fade.target].map((key) => [key, FADED_OPACITY]))
  for (const key of fade.changes.keys()) {
    const level = fadeLevelAt(fade, key, now)
    if (level < 1) levels.set(key, level)
    else levels.delete(key)
  }
  return levels
}
