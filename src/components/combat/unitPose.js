import { blastDownHoldMs, blastStaggerAnimation, defeatAnimation, getSpriteAnimation } from '../../rules/appearance.js'
import { getWeapon } from '../../combat/weaponSystem.js'
import { shownGetUpPose, startGetUpWait } from '../maps/blastGetUpSync.js'
import { SHOT_ACTIONS } from './battleHelpers.js'

// Which sprite animation a combatant plays (characterSprites.json): its strike when the last action was its
// attack, the fall when it is Defeated (already lying there if it was down before the board appeared), getting up
// (getUp) when First Aid ends Defeated or after a blast Stress-Avoid stagger (fall → brief hold on the ground → getUp),
// hands up once it has surrendered, running (every combat Move and Sprint; designer decision 2026-10-12), cover, or idle.
// Pure and driven by timestamps (ms): the Pixi board (pixi/unitView.js) calls it every frame. Presentation only.
//
// Blast getUp: track.gettingUp + getUpPlaying. Always want getUp (FigureView keeps fall until the sheet assigns).
// The wall clock does not finish getUp — unitView clears it when the displayed layer has played the last frame.
//
// A track is { down, fall, settled, fallHeldUntil, surrendered, handsSettled, seenStrike, strike, gettingUp,
// getUpPlaying, staggerFall, staggerDown, seenBlast, seenReaction, reaction, reactionHeldUntil, pendingDefeat,
// oneShotUntil, playKey }. A Defeated target still plays get-hit first (pendingDefeat), then the fall.

const strikeAnimation = (action) => {
  if (action.variant === 'punch') return 'punch'
  if (action.variant === 'kick') return 'kick'
  return getWeapon(action.weaponId)?.type === 'melee' ? 'melee' : 'attack'
}
const isStrikeBy = (action, id) =>
  Boolean(
    action &&
      action.actorId === id &&
      action.weaponId &&
      ((SHOT_ACTIONS.includes(action.type) && (action.type !== 'ambush' || action.passed)) || action.type === 'attackObject'),
  )

const reactionAnimation = (action, id) => {
  if (!action || action.targetId !== id || !SHOT_ACTIONS.includes(action.type)) return null
  // A failed ambush is "spotted", not a shot the target dodges.
  if (action.type === 'ambush' && !action.passed) return null
  if (!action.passed) return 'dodge'
  // 0–2 Momentum flinches even when the hit Defeats them (a Minor). The fall plays after the clip.
  if ((action.momentumGenerated ?? 0) < 3) return 'getHit'
  return null
}

const oneShotDuration = (animation, speed) => (getSpriteAnimation(animation).seconds * 1000) / speed

export function poseInput(combatant, { lastAction = null, hitDelayMs = 0, speed = 1 } = {}) {
  const injury = combatant.blastReact?.injury
  // Prefer injury.id; fall back so a hand-off react without an id still plays fall → getUp.
  const blastKey =
    !combatant.condition?.defeated && combatant.blastReact
      ? (injury?.id ?? combatant.blastReact.key ?? `react:${combatant.id}`)
      : null
  return {
    down: Boolean(combatant.condition?.defeated),
    surrendered: Boolean(combatant.surrendered),
    // A heavy weapon throw (from/land, no explosion injury) uses the same fly-back as a survivor, then stays down.
    fall:
      combatant.blastReact?.from && combatant.blastReact?.land && !combatant.blastReact?.injury
        ? blastStaggerAnimation()
        : defeatAnimation(combatant.condition, combatant.id),
    blastKey,
    blastFall: blastKey ? blastStaggerAnimation() : null,
    strikeKey: isStrikeBy(lastAction, combatant.id) ? lastAction.key : null,
    reactionKey: reactionAnimation(lastAction, combatant.id) ? lastAction.key : null,
    reaction: reactionAnimation(lastAction, combatant.id),
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
    seenReaction: input.reactionKey,
    seenBlast: null,
    strike: null,
    reaction: null,
    reactionHeldUntil: null,
    reactionDurationMs: null,
    pendingDefeat: null,
    staggerFall: null,
    staggerDown: null,
    gettingUp: null,
    getUpPlaying: false,
    oneShotUntil: null,
    playKey: 0,
  }
}

export function advancePose(track, input, now) {
  const { down, surrendered, fall, blastKey, blastFall, strikeKey, reactionKey, reaction, lastAction, hitDelayMs, speed } = input
  let next = track
  // A killing low hit flinches first. Stay standing until that clip ends, then fall (settlePose).
  const flinchFirst = down && !next.down && reaction === 'getHit' && reactionKey !== next.seenReaction
  if (down !== next.down) {
    if (flinchFirst) {
      next = { ...next, pendingDefeat: { fall } }
    } else if (down && next.pendingDefeat && (next.reaction || next.reactionHeldUntil !== null)) {
      // Still in the flinch. The defeat fall waits.
    } else {
      next = down
        ? {
            ...next,
            down,
            fall,
            settled: false,
            fallHeldUntil: hitDelayMs > 0 ? now : null,
            gettingUp: null,
            getUpPlaying: false,
            staggerFall: null,
            staggerDown: null,
            strike: null,
            reaction: null,
            reactionHeldUntil: null,
            reactionDurationMs: null,
            pendingDefeat: null,
            playKey: next.playKey + 1,
          }
        : {
            ...next,
            down,
            fallHeldUntil: null,
            pendingDefeat: null,
            ...startGetUpWait({ playKey: next.playKey + 1 }),
            staggerFall: null,
            staggerDown: null,
          }
    }
  }
  if (surrendered !== next.surrendered) {
    next = { ...next, surrendered, handsSettled: false, strike: null, reaction: null, reactionHeldUntil: null, reactionDurationMs: null, playKey: next.playKey + 1 }
  }
  if (blastKey !== null && blastKey !== next.seenBlast && !down) {
    next = {
      ...next,
      seenBlast: blastKey,
      staggerFall: blastFall,
      staggerDown: null,
      gettingUp: null,
      getUpPlaying: false,
      strike: null,
      reaction: null,
      reactionHeldUntil: null,
      reactionDurationMs: null,
      playKey: next.playKey + 1,
    }
  }
  if (strikeKey !== null && strikeKey !== next.seenStrike) {
    next = { ...next, seenStrike: strikeKey, strike: down ? null : strikeAnimation(lastAction), playKey: next.playKey + 1 }
  }
  if (reactionKey !== null && reactionKey !== next.seenReaction) {
    next = {
      ...next,
      seenReaction: reactionKey,
      reaction: next.down ? null : reaction,
      reactionHeldUntil: !next.down && hitDelayMs > 0 ? now + hitDelayMs / speed : null,
      reactionDurationMs: !next.down && reaction ? oneShotDuration(reaction, speed) : null,
      playKey: next.playKey + 1,
    }
  }
  if (next === track) return track
  // gettingUp is not wall-clock armed here — unitView starts playback when the getup texture is on the sprite.
  const oneShot = next.strike ?? (next.reactionHeldUntil === null ? next.reaction : null) ?? next.staggerFall
  return {
    ...next,
    oneShotUntil: oneShot ? now + oneShotDuration(oneShot, speed) : next.staggerDown ? now + blastDownHoldMs() / speed : null,
    fallHeldUntil: next.fallHeldUntil !== null ? now + hitDelayMs / speed : null,
  }
}

export function settlePose(track, now) {
  let next = track
  if (next.fallHeldUntil !== null && now >= next.fallHeldUntil) next = { ...next, fallHeldUntil: null, playKey: next.playKey + 1 }
  if (next.reactionHeldUntil !== null && now >= next.reactionHeldUntil) {
    next = {
      ...next,
      reactionHeldUntil: null,
      oneShotUntil: now + next.reactionDurationMs,
      playKey: next.playKey + 1,
    }
  }
  if (next.oneShotUntil !== null && now >= next.oneShotUntil) {
    // Blast stagger: fall → hold on the ground → request getUp (unitView finishes on displayed playback).
    if (next.staggerFall) {
      const lie = next.staggerFall
      return {
        ...next,
        staggerFall: null,
        staggerDown: lie,
        gettingUp: null,
        getUpPlaying: false,
        oneShotUntil: now + blastDownHoldMs(),
        playKey: next.playKey + 1,
      }
    }
    if (next.staggerDown) {
      return {
        ...next,
        staggerDown: null,
        ...startGetUpWait({ playKey: next.playKey + 1 }),
      }
    }
    // Do not clear gettingUp on a wall clock — that pops to idle while the fall frame is still displayed.
    if (next.gettingUp) return next
    const defeated = next.pendingDefeat
    next = { ...next, strike: null, reaction: null, reactionDurationMs: null, oneShotUntil: null, pendingDefeat: null }
    if (defeated) {
      return {
        ...next,
        down: true,
        fall: defeated.fall,
        settled: false,
        fallHeldUntil: null,
        playKey: next.playKey + 1,
      }
    }
  }
  return next
}

export function poseWakeAt(track) {
  // getUp has no wake time until unitView arms playback from the displayed layer.
  if (track.gettingUp) return track.oneShotUntil
  const times = [track.fallHeldUntil, track.reactionHeldUntil, track.oneShotUntil].filter((time) => time !== null)
  return times.length ? Math.min(...times) : null
}

export function shownPose(track, { inCover = false, isWalking = false, panic = false } = {}) {
  if (track.down && track.fallHeldUntil !== null) return { animation: inCover ? 'cover' : 'idle', playKey: 0, settled: false, reverse: false }
  if (track.down) return { animation: track.fall, playKey: track.playKey, settled: track.settled, reverse: false }
  if (track.staggerFall) return { animation: track.staggerFall, playKey: track.playKey, settled: false, reverse: false }
  if (track.staggerDown) return { animation: track.staggerDown, playKey: track.playKey, settled: true, reverse: false }
  if (track.gettingUp) {
    return (
      shownGetUpPose(track) ?? {
        animation: track.gettingUp,
        playKey: track.playKey,
        settled: false,
        reverse: false,
        standingUp: true,
      }
    )
  }
  if (track.strike) return { animation: track.strike, playKey: track.playKey, settled: false, reverse: false }
  if (track.reaction && track.reactionHeldUntil === null) return { animation: track.reaction, playKey: track.playKey, settled: false, reverse: false }
  if (track.surrendered) return { animation: 'surrender', playKey: track.playKey, settled: track.handsSettled, reverse: false }
  if (isWalking) return { animation: 'run', playKey: 0, settled: false, reverse: false }
  // Presentation-only: while burning / afflicted, low-Fitness panic overrides standing idle (not cover).
  if (panic && !inCover) return { animation: 'hazardPanic', playKey: 0, settled: false, reverse: false }
  return { animation: inCover ? 'cover' : 'idle', playKey: 0, settled: false, reverse: false }
}
