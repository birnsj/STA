import { defeatAnimation, getSpriteAnimation } from '../../rules/appearance.js'
import { getWeapon } from '../../combat/weaponSystem.js'
import { SHOT_ACTIONS } from './battleHelpers.js'

// Which CharacterSprite animation a combatant plays (characterSprites.json): its strike when the last action was its
// attack, the fall when it is Defeated (already lying there if it was down before the board appeared), getting up
// (the fall backwards) when First Aid ends Defeated, hands up once it has surrendered (already up if it had before the
// board appeared), running (every combat Move and Sprint; designer decision 2026-10-12), cover, or idle.
// Pure and driven by timestamps (ms), so the SVG board (useUnitAnimation) and the Pixi board share it. Presentation only.
//
// A track is { down, fall, settled, fallHeldUntil, surrendered, handsSettled, seenStrike, strike, gettingUp,
// oneShotUntil, playKey }: fallHeldUntil, when a fall caused by a shot starts (it waits for the shot to land);
// oneShotUntil, when a strike or getting up has played and the figure goes back to its loop.

const strikeAnimation = (action) => (getWeapon(action.weaponId)?.type === 'melee' ? 'melee' : 'attack')
// The strike plays when the roll is resolved (hit or miss), with the shot (battleHelpers shotOf); a failed Ambush
// strikes nobody.
const isStrikeBy = (action, id) =>
  Boolean(action && SHOT_ACTIONS.includes(action.type) && action.actorId === id && action.weaponId && (action.type !== 'ambush' || action.passed))

// What a track follows: from the combatant and the last action. hitDelayMs: when the last action is a shot at this
// combatant, how long until it lands (a fall it causes waits for it). speed: the playback speed.
export function poseInput(combatant, { lastAction = null, hitDelayMs = 0, speed = 1 } = {}) {
  return {
    down: Boolean(combatant.condition?.defeated),
    surrendered: Boolean(combatant.surrendered),
    fall: defeatAnimation(combatant.condition, combatant.id),
    strikeKey: isStrikeBy(lastAction, combatant.id) ? lastAction.key : null,
    lastAction,
    hitDelayMs,
    speed,
  }
}

// A board appearing mid-fight: whoever is down already lies there, hands already up; the current action's strike is
// treated as seen, so an old shot isn't replayed.
export function initialPose(input) {
  return {
    down: input.down,
    fall: input.down ? input.fall : null,
    settled: input.down,
    fallHeldUntil: null,
    surrendered: input.surrendered,
    handsSettled: input.surrendered,
    seenStrike: input.strikeKey,
    strike: null,
    gettingUp: null,
    oneShotUntil: null,
    playKey: 0,
  }
}

// The track after the combatant changed at `now`. Returns the same object when nothing did.
export function advancePose(track, input, now) {
  const { down, surrendered, fall, strikeKey, lastAction, hitDelayMs, speed } = input
  let next = track
  if (down !== next.down) {
    next = down
      ? { ...next, down, fall, settled: false, fallHeldUntil: hitDelayMs > 0 ? now : null, gettingUp: null, strike: null, playKey: next.playKey + 1 }
      : { ...next, down, fallHeldUntil: null, gettingUp: next.fall, playKey: next.playKey + 1 }
  }
  if (surrendered !== next.surrendered) {
    next = { ...next, surrendered, handsSettled: false, strike: null, playKey: next.playKey + 1 }
  }
  if (strikeKey !== null && strikeKey !== next.seenStrike) {
    next = { ...next, seenStrike: strikeKey, strike: down ? null : strikeAnimation(lastAction), playKey: next.playKey + 1 }
  }
  if (next === track) return track
  // Each change restarts the clocks that are running, as the hook's timers were restarted.
  const oneShot = next.strike ?? next.gettingUp
  return {
    ...next,
    oneShotUntil: oneShot ? now + (getSpriteAnimation(oneShot).seconds * 1000) / speed : null,
    fallHeldUntil: next.fallHeldUntil !== null ? now + hitDelayMs / speed : null,
  }
}

// The track once the clocks have run to `now`: a held fall starts (from its first frame: a new playKey), a strike
// or getting up ends. Returns the same object when nothing ended.
export function settlePose(track, now) {
  let next = track
  if (next.fallHeldUntil !== null && now >= next.fallHeldUntil) next = { ...next, fallHeldUntil: null, playKey: next.playKey + 1 }
  if (next.oneShotUntil !== null && now >= next.oneShotUntil) next = { ...next, strike: null, gettingUp: null, oneShotUntil: null }
  return next
}

// When the track next changes by itself (ms), or null.
export function poseWakeAt(track) {
  const times = [track.fallHeldUntil, track.oneShotUntil].filter((time) => time !== null)
  return times.length ? Math.min(...times) : null
}

// The CharacterSprite props for a track: { animation, playKey, settled, reverse }.
export function shownPose(track, { inCover = false, isWalking = false } = {}) {
  if (track.down && track.fallHeldUntil !== null) return { animation: inCover ? 'cover' : 'idle', playKey: 0, settled: false, reverse: false }
  if (track.down) return { animation: track.fall, playKey: track.playKey, settled: track.settled, reverse: false }
  if (track.gettingUp) return { animation: track.gettingUp, playKey: track.playKey, settled: false, reverse: true }
  if (track.strike) return { animation: track.strike, playKey: track.playKey, settled: false, reverse: false }
  if (track.surrendered) return { animation: 'surrender', playKey: track.playKey, settled: track.handsSettled, reverse: false }
  if (isWalking) return { animation: 'run', playKey: 0, settled: false, reverse: false }
  return { animation: inCover ? 'cover' : 'idle', playKey: 0, settled: false, reverse: false }
}
