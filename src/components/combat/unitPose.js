import { blastDownHoldMs, blastStaggerAnimation, defeatAnimation, getSpriteAnimation, getUpAnimation } from '../../rules/appearance.js'
import { getWeapon } from '../../combat/weaponSystem.js'
import { SHOT_ACTIONS } from './battleHelpers.js'

// Which sprite animation a combatant plays (characterSprites.json): its strike when the last action was its
// attack, the fall when it is Defeated (already lying there if it was down before the board appeared), getting up
// (getUp) when First Aid ends Defeated or after a blast Stress-Avoid stagger (fall → brief hold on the ground → getUp),
// hands up once it has surrendered, running (every combat Move and Sprint; designer decision 2026-10-12), cover, or idle.
// Pure and driven by timestamps (ms): the Pixi board (pixi/unitView.js) calls it every frame. Presentation only.
//
// A track is { down, fall, settled, fallHeldUntil, surrendered, handsSettled, seenStrike, strike, gettingUp,
// staggerFall, staggerDown, seenBlast, oneShotUntil, playKey }.

const strikeAnimation = (action) => (getWeapon(action.weaponId)?.type === 'melee' ? 'melee' : 'attack')
const isStrikeBy = (action, id) =>
  Boolean(
    action &&
      action.actorId === id &&
      action.weaponId &&
      ((SHOT_ACTIONS.includes(action.type) && (action.type !== 'ambush' || action.passed)) || action.type === 'attackObject'),
  )

const oneShotDuration = (animation, speed) => (getSpriteAnimation(animation).seconds * 1000) / speed

export function poseInput(combatant, { lastAction = null, hitDelayMs = 0, speed = 1 } = {}) {
  const injury = combatant.blastReact?.injury
  // Prefer injury.id; fall back so a hand-off react without an id still plays fall → getUp.
  const blastKey =
    !combatant.condition?.defeated && combatant.blastReact
      ? (injury?.id ?? `react:${combatant.id}`)
      : null
  return {
    down: Boolean(combatant.condition?.defeated),
    surrendered: Boolean(combatant.surrendered),
    fall: defeatAnimation(combatant.condition, combatant.id),
    blastKey,
    blastFall: blastKey ? blastStaggerAnimation() : null,
    strikeKey: isStrikeBy(lastAction, combatant.id) ? lastAction.key : null,
    lastAction,
    hitDelayMs,
    speed,
  }
}

export function initialPose(input) {
  return {
    down: input.down,
    fall: input.down ? input.fall : null,
    settled: input.down,
    fallHeldUntil: null,
    surrendered: input.surrendered,
    handsSettled: input.surrendered,
    seenStrike: input.strikeKey,
    seenBlast: null,
    strike: null,
    staggerFall: null,
    staggerDown: null,
    gettingUp: null,
    oneShotUntil: null,
    playKey: 0,
  }
}

export function advancePose(track, input, now) {
  const { down, surrendered, fall, blastKey, blastFall, strikeKey, lastAction, hitDelayMs, speed } = input
  let next = track
  if (down !== next.down) {
    next = down
      ? { ...next, down, fall, settled: false, fallHeldUntil: hitDelayMs > 0 ? now : null, gettingUp: null, staggerFall: null, staggerDown: null, strike: null, playKey: next.playKey + 1 }
      : { ...next, down, fallHeldUntil: null, gettingUp: getUpAnimation(), staggerFall: null, staggerDown: null, playKey: next.playKey + 1 }
  }
  if (surrendered !== next.surrendered) {
    next = { ...next, surrendered, handsSettled: false, strike: null, playKey: next.playKey + 1 }
  }
  if (blastKey !== null && blastKey !== next.seenBlast && !down) {
    next = {
      ...next,
      seenBlast: blastKey,
      staggerFall: blastFall,
      staggerDown: null,
      gettingUp: null,
      strike: null,
      playKey: next.playKey + 1,
    }
  }
  if (strikeKey !== null && strikeKey !== next.seenStrike) {
    next = { ...next, seenStrike: strikeKey, strike: down ? null : strikeAnimation(lastAction), playKey: next.playKey + 1 }
  }
  if (next === track) return track
  const oneShot = next.strike ?? next.gettingUp ?? next.staggerFall
  return {
    ...next,
    oneShotUntil: oneShot ? now + oneShotDuration(oneShot, speed) : next.staggerDown ? now + blastDownHoldMs() / speed : null,
    fallHeldUntil: next.fallHeldUntil !== null ? now + hitDelayMs / speed : null,
  }
}

export function settlePose(track, now) {
  let next = track
  if (next.fallHeldUntil !== null && now >= next.fallHeldUntil) next = { ...next, fallHeldUntil: null, playKey: next.playKey + 1 }
  if (next.oneShotUntil !== null && now >= next.oneShotUntil) {
    // Blast stagger: fall → hold on the ground → getUp.
    if (next.staggerFall) {
      const lie = next.staggerFall
      return {
        ...next,
        staggerFall: null,
        staggerDown: lie,
        gettingUp: null,
        oneShotUntil: now + blastDownHoldMs(),
        playKey: next.playKey + 1,
      }
    }
    if (next.staggerDown) {
      // Timer stays null until unitView arms it after the getup sheet can draw (same as fall).
      return {
        ...next,
        staggerDown: null,
        gettingUp: getUpAnimation(),
        oneShotUntil: null,
        playKey: next.playKey + 1,
      }
    }
    next = { ...next, strike: null, gettingUp: null, oneShotUntil: null }
  }
  return next
}

export function poseWakeAt(track) {
  const times = [track.fallHeldUntil, track.oneShotUntil].filter((time) => time !== null)
  return times.length ? Math.min(...times) : null
}

export function shownPose(track, { inCover = false, isWalking = false, panic = false } = {}) {
  if (track.down && track.fallHeldUntil !== null) return { animation: inCover ? 'cover' : 'idle', playKey: 0, settled: false, reverse: false }
  if (track.down) return { animation: track.fall, playKey: track.playKey, settled: track.settled, reverse: false }
  if (track.staggerFall) return { animation: track.staggerFall, playKey: track.playKey, settled: false, reverse: false }
  if (track.staggerDown) return { animation: track.staggerDown, playKey: track.playKey, settled: true, reverse: false }
  if (track.gettingUp) return { animation: track.gettingUp, playKey: track.playKey, settled: false, reverse: false }
  if (track.strike) return { animation: track.strike, playKey: track.playKey, settled: false, reverse: false }
  if (track.surrendered) return { animation: 'surrender', playKey: track.playKey, settled: track.handsSettled, reverse: false }
  if (isWalking) return { animation: 'run', playKey: 0, settled: false, reverse: false }
  // Presentation-only: while burning / afflicted, low-Fitness panic overrides standing idle (not cover).
  if (panic && !inCover) return { animation: 'hazardPanic', playKey: 0, settled: false, reverse: false }
  return { animation: inCover ? 'cover' : 'idle', playKey: 0, settled: false, reverse: false }
}
