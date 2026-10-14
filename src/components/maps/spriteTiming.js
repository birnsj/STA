// When a figure's sprite animations play on the Pixi boards (a frame picked every tick). Presentation only.

// The last frame a non-looping animation shows (a loop slides on to the next frame's edge and starts again).
export const lastColumn = ({ start, frames, play }) => (play === 'loop' ? start + frames : start + frames - 1)

// The frame shown without animation (reduced motion): a loop's first, a once's middle, a hold's last (or first, played
// backwards).
export function restColumn({ start, frames, play }, reverse = false) {
  if (play === 'loop') return start
  if (play === 'once') return start + Math.floor(frames / 2)
  return reverse ? start : start + frames - 1
}

// A stable 0..1 from a figure's id, mixed so ids that differ by one letter still land far apart.
export function hashOf(seed) {
  let h = 0
  for (const character of String(seed)) h = (Math.imul(h, 31) + character.charCodeAt(0)) | 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
// Where in its loops a figure starts, so neighbours don't breathe or step in time.
export const phaseOf = (seed) => hashOf(seed)

// The maps move a figure about as it walks (re-sorted among the walls), and an animation restarted then would jump.
// So each animation is timed from a fixed point instead: a loop from the page clock (offset by the figure's phase), a
// one-shot from when it first played.
// 'seed|name|playKey|reverse' -> performance.now() when that one-shot began.
const oneShotStarts = new Map()
const ONE_SHOTS_KEPT = 200
export function startOf(key, now) {
  if (!oneShotStarts.has(key)) {
    if (oneShotStarts.size >= ONE_SHOTS_KEPT) oneShotStarts.delete(oneShotStarts.keys().next().value)
    oneShotStarts.set(key, now)
  }
  return oneShotStarts.get(key)
}
export const oneShotKey = (seed, name, playKey, reverse) => `${seed}|${name}|${playKey}|${reverse}`

// The walking loops share one stride (each starts with the same foot forward), so a figure switching between them
// carries on from the same point in its step instead of jumping to another foot: seed -> { name, seconds, offset }, the
// gait it last walked and where in the stride (0..1) that loop stood at time 0.
const GAITS = new Set(['walk', 'run', 'sneakWalk'])
const gaitClocks = new Map()
const wrap = (value) => value - Math.floor(value)
export function loopOffset(animation, seed, phase, nowSeconds) {
  const fallback = phase ?? phaseOf(seed)
  if (!GAITS.has(animation.name)) return fallback
  const last = gaitClocks.get(seed)
  const offset = !last ? fallback : last.name === animation.name ? last.offset : wrap(nowSeconds / last.seconds + last.offset - nowSeconds / animation.seconds)
  gaitClocks.set(seed, { name: animation.name, seconds: animation.seconds, offset })
  return offset
}

// The movement simulation's walking and running can flick for a moment (speed hovering at the walk/run line, a
// follower easing into its slot, a pause while sidestepping), which would swap the loop every few frames. So a new gait
// is only shown once it has held for GAIT_SETTLE_MS; setting off from standing still shows at once, and stopping shows
// after STOP_SETTLE_MS (just long enough to ride out a one-frame pause, so the figure stops when the character does).
const GAIT_SETTLE_MS = 250
const STOP_SETTLE_MS = 100
export const STANDING = new Set(['idle', 'sneakIdle'])
// How long `gait` must hold before it replaces the `steady` one shown.
export const gaitDelay = (steady, gait) => (STANDING.has(steady) && !STANDING.has(gait) ? 0 : STANDING.has(gait) ? STOP_SETTLE_MS : GAIT_SETTLE_MS)

// The gait to show, for a caller that ticks: track is { steady, pending, since } (or null to start), updated with the
// gait wanted at `now` (ms). Returns the new track; show track.steady.
export function steadyGait(track, gait, now) {
  if (!track) return { steady: gait, pending: null, since: now }
  if (gait === track.steady) return track.pending === null ? track : { ...track, pending: null }
  const pending = track.pending === gait ? track : { ...track, pending: gait, since: now }
  return now - pending.since >= gaitDelay(track.steady, gait) ? { steady: gait, pending: null, since: now } : pending
}

// The timing an animation shows with from `now` (ms): a loop's offset into its cycle (0..1, loopOffset), or when a
// one-shot began. timing: { seed, phase, settled, reverse, speed, playKey }.
export function startTiming(animation, timing, now) {
  if (animation.play === 'loop') return { offset: loopOffset(animation, timing.seed, timing.phase, now / 1000) }
  if (timing.settled) return { settled: true }
  return { startedAt: startOf(oneShotKey(timing.seed, animation.name, timing.playKey, timing.reverse), now) }
}

// The sheet column an animation shows at `now` (ms), from startTiming's result: the same frame element.animate shows
// for a loop (steps(frames)) and a one-shot (steps(frames, jump-none), held at either end).
export function frameColumn(animation, started, { reverse = false, speed = 1 } = {}, now) {
  const { start, frames, seconds, play } = animation
  if (play === 'loop') return start + Math.min(frames - 1, Math.floor(wrap(now / 1000 / seconds + started.offset) * frames))
  if (started.settled) return restColumn(animation, reverse)
  const progress = Math.min(1, Math.max(0, (now - started.startedAt) / ((seconds / speed) * 1000)))
  return start + Math.min(frames - 1, Math.floor((reverse ? 1 - progress : progress) * frames))
}
