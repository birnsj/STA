// Full procedural clip tree. Clip names/timings from characterSprites.json (clips.js).
// Locomotion (idle/walk/run) uses travel-locked gait; one-shots/holds use clip phase u∈[0,1].

import {
  CLIP_META,
  IDLE_FIDGETS,
  basePose,
  clamp01,
  clipPlayMode,
  clipSeconds,
  deg,
  lerp,
} from './clips.js'

const SPEED_WALK = 0.55
const SPEED_RUN = 1
const LOCO_SPEED = {
  idle: 0,
  walk: SPEED_WALK,
  run: SPEED_RUN,
  sneakWalk: SPEED_WALK * 0.65,
  sneakIdle: 0,
  // Party shove: shorter stride while facing the pusher (NPCController keepClear).
  stepBack: SPEED_WALK * 0.7,
  // Hazard panic while moving: walk/run legs + panicked upper body.
  hazardPanicWalk: SPEED_WALK,
  hazardPanicRun: SPEED_RUN,
}

const WALK_STRIDE = 2.56
const RUN_STRIDE = 3.3
const WALK_SECONDS = 0.8
const RUN_SECONDS = 0.6
const MAX_TRAVEL = 0.55

const K_UP = 7.5
const K_DOWN = 16
const K_HIP = 10
const K_SPINE = 8
const K_CHEST = 3.2
const K_ARM = 3.6
const K_STOP = 18
const ACCEL_LEAN = 1.1
const ACCEL_LEAN_MAX = deg(12)

function easeToward(current, target, k, dt) {
  return current + (target - current) * (1 - Math.exp(-k * dt))
}

function evalIdlePose(u) {
  const w = u * Math.PI * 2
  const breathe = Math.sin(w)
  return {
    ...basePose(),
    arm: [deg(2 + breathe * 1.2), deg(4 + breathe * 1.2)],
    elbow: [deg(14), deg(16)],
    shoulder: [deg(1 + breathe * 0.4), deg(2 + breathe * 0.4)],
    breathe,
    // No vertical bounce — that lifted both feet off the tile every breath.
    bounce: 0,
    hipDrop: 0,
    headYaw: Math.sin(w * 0.35) * deg(2.5),
    headPitch: deg(8) + breathe * deg(0.6),
    spineLean: breathe * deg(0.6),
    chestLean: breathe * deg(0.4),
  }
}

function evalGaitPose(u, runMix, weight, crouch = 0) {
  const w = clamp01(weight)
  const r = clamp01(runMix)
  const phase = clamp01(u) * Math.PI * 2
  const s = Math.sin(phase)
  const c = Math.cos(phase)
  const liftL = 0.5 * (1 - c)
  const liftR = 0.5 * (1 + c)
  const bobWave = 0.5 * (1 - Math.cos(phase * 2))
  const amp = deg(lerp(24, 40, r)) * w * (1 - crouch * 0.25)
  const kneeFlex = deg(lerp(30, 54, r)) * w
  const kneeBase = deg(lerp(6, 11, r)) + deg(28) * crouch
  const armAmp = deg(lerp(42, 68, r)) * w * (1 - crouch * 0.35)
  const shoulderAmp = deg(lerp(16, 28, r)) * w
  const bob = lerp(0.22, 0.42, r) * w
  const lean = deg(lerp(5, 10, r)) * w + deg(12) * crouch
  const twist = deg(lerp(4, 7, r)) * w
  const side = -s * deg(lerp(2, 3.5, r)) * w
  return {
    ...basePose(),
    thigh: [deg(1.5) + amp * s + deg(18) * crouch, deg(-1) - amp * s + deg(18) * crouch],
    knee: [kneeBase + kneeFlex * liftL * liftL, kneeBase + kneeFlex * liftR * liftR],
    arm: [deg(8) + armAmp * s, deg(9) - armAmp * s],
    shoulder: [shoulderAmp * s, -shoulderAmp * s],
    elbow: [deg(lerp(28, 50, r)) + deg(16) * liftR * w, deg(lerp(28, 50, r)) + deg(16) * liftL * w],
    lean,
    bounce: bobWave * bob - crouch * 0.15,
    spineYaw: s * twist * 0.45,
    spineLean: lean * 0.7,
    spineSide: side * 0.55,
    chestLean: lean * 0.3 + bobWave * deg(lerp(0.6, 1.4, r)) * w,
    torsoYaw: -s * twist * 1.05,
    headYaw: -s * deg(2.5) * w,
    headPitch: deg(lerp(0.6, 2, r)) * w + bobWave * deg(0.8) * w + deg(6) * crouch,
    sideLean: side,
  }
}

function evalSneakIdle(u) {
  const idle = evalIdlePose(u)
  return {
    ...idle,
    thigh: [deg(22), deg(20)],
    knee: [deg(42), deg(40)],
    spineLean: deg(14) + idle.spineLean,
    chestLean: deg(6),
    bounce: idle.bounce - 0.12,
    headPitch: deg(12),
  }
}

/** Compact shuffle away while still facing the pusher (lean back, guarded arms). */
function evalStepBackPose(u) {
  const gait = evalGaitPose(u, 0, 0.8, 0)
  return {
    ...gait,
    lean: -deg(9),
    spineLean: -deg(7),
    chestLean: -deg(3),
    arm: [deg(-14) + gait.arm[0] * 0.3, deg(-12) + gait.arm[1] * 0.3],
    shoulder: [deg(-10), deg(-8)],
    elbow: [deg(36), deg(34)],
    bounce: gait.bounce * 0.5,
    headPitch: deg(5),
    torsoYaw: gait.torsoYaw * 0.55,
  }
}

/**
 * Final prone rest for a fall/death clip — body on the deck (no sink), limbs limp.
 * Used at hold end and when a ragdoll hands off to a death pose.
 */
export function evalDeathRestPose(fallClip = 'fallBlastBack') {
  const clip = fallClip || 'fallBlastBack'
  const crumple = clip === 'fallCrumple'
  const forward = clip === 'fallForward'
  const spin = String(clip).includes('Spin')
  const pitch = crumple ? deg(88) : forward ? deg(-92) : deg(92)
  return {
    ...basePose(),
    pitch: spin ? pitch * 0.72 : pitch,
    thigh: [deg(22), deg(48)],
    knee: [deg(40), deg(62)],
    arm: [deg(-20), deg(-70)],
    elbow: [deg(55), deg(78)],
    shoulder: [deg(-8), deg(-18)],
    spineLean: crumple ? deg(28) : deg(6),
    chestLean: forward ? deg(-4) : deg(4),
    bounce: 0,
    hipDrop: 0,
    torsoYaw: spin ? deg(100) : crumple ? deg(12) : deg(8),
    headYaw: spin ? deg(20) : deg(-6),
    headPitch: deg(-18),
    prop: false,
    aim: 0,
  }
}

/** One-shot / hold pose curves. u∈[0,1]. */
function evalActionPose(clip, u) {
  const t = clamp01(u)
  const ease = t * t * (3 - 2 * t)
  const p = basePose()

  if (clip === 'cover') {
    // Fresh procedural kneel (not a sprite retarget): right knee down, left foot forward,
    // torso upright with a slight forward crouch, phaser aimed along facing (getFacing → target).
    // pitch must stay 0 — any leftover fall tip read as “bent all the way back.”
    const breathe = Math.sin(t * Math.PI * 2)
    return {
      ...p,
      pitch: 0,
      // [left planted forward, right knee on the deck]
      thigh: [deg(36), deg(68)],
      knee: [deg(72), deg(92)],
      lean: deg(4),
      spineLean: deg(8),
      chestLean: deg(3),
      sideLean: 0,
      spineSide: 0,
      torsoYaw: deg(-4),
      headPitch: deg(3) + breathe * deg(0.4),
      headYaw: deg(2),
      // Weapon ready — keep the gun arm forward, not windmilling up behind the head.
      arm: [deg(-6), deg(-24)],
      elbow: [deg(32), deg(64)],
      shoulder: [deg(-4), deg(-18)],
      bounce: breathe * 0.012,
      hipDrop: 6.8,
      prop: true,
      aim: 0.78,
    }
  }

  if (clip === 'attack' || clip === 'melee' || clip === 'punch' || clip === 'kick') {
    const wind = Math.sin(Math.min(1, t * 2.2) * Math.PI)
    const strike = t < 0.45 ? ease : 1 - (t - 0.45) / 0.55
    const kick = clip === 'kick'
    const punch = clip === 'punch' || clip === 'melee'
    return {
      ...p,
      thigh: kick ? [deg(10), deg(-5) - deg(55) * wind] : [deg(4), deg(-2)],
      knee: kick ? [deg(12), deg(20) + deg(40) * wind] : [deg(8), deg(8)],
      arm: punch
        ? [deg(8) - deg(70) * wind, deg(10) + deg(20) * (1 - wind)]
        : [deg(15) - deg(50) * wind, deg(12)],
      elbow: punch ? [deg(20) + deg(40) * (1 - wind), deg(30)] : [deg(40), deg(35)],
      shoulder: [deg(-10) - deg(25) * wind, deg(5)],
      spineLean: deg(6) + deg(10) * strike,
      torsoYaw: deg(kick ? -8 : 12) * wind,
      lean: deg(8) * strike,
      prop: clip === 'attack',
      aim: clip === 'attack' ? 0.85 : 0,
    }
  }

  if (clip === 'dodge') {
    const slide = Math.sin(t * Math.PI)
    return {
      ...p,
      thigh: [deg(8) + deg(10) * slide, deg(6) - deg(8) * slide],
      knee: [deg(20) + deg(15) * slide, deg(18)],
      arm: [deg(-15), deg(-10)],
      spineSide: deg(-18) * slide,
      sideLean: deg(-14) * slide,
      torsoYaw: deg(-10) * slide,
      bounce: -0.08 * slide,
    }
  }

  if (clip === 'getHit') {
    const hit = Math.sin(Math.min(1, t * 1.6) * Math.PI)
    return {
      ...p,
      arm: [deg(-20) * hit, deg(-25) * hit],
      spineLean: deg(-12) * hit,
      chestLean: deg(-8) * hit,
      headPitch: deg(-10) * hit,
      torsoYaw: deg(8) * hit,
      bounce: 0.06 * hit,
    }
  }

  if (String(clip).startsWith('fall')) {
    // Mid-fall dips slightly; end rest is ON the deck (bounce 0) so corpses don't sink and vanish.
    if (ease >= 0.999) return evalDeathRestPose(clip)
    const crumple = clip === 'fallCrumple'
    const forward = clip === 'fallForward'
    const spin = clip.includes('Spin')
    const blast = clip.includes('Blast')
    const pitch = crumple ? deg(75) * ease : forward ? deg(-80) * ease : deg(85) * ease
    return {
      ...p,
      pitch: spin ? pitch * 0.6 : pitch,
      thigh: [deg(30) * ease, deg(35) * ease],
      knee: [deg(50) * ease, deg(55) * ease],
      arm: [deg(-40) * ease, deg(-35) * ease],
      elbow: [deg(40), deg(45)],
      spineLean: crumple ? deg(40) * ease : deg(20) * ease,
      bounce: -0.22 * Math.sin(ease * Math.PI),
      torsoYaw: spin ? deg(180) * ease : blast ? deg(20) * ease : 0,
      headPitch: deg(-20) * ease,
    }
  }

  if (clip === 'getUp') {
    // Plant → press → knee → stand
    const plant = clamp01(t / 0.3)
    const press = clamp01((t - 0.25) / 0.35)
    const stand = clamp01((t - 0.55) / 0.45)
    return {
      ...p,
      pitch: deg(70) * (1 - stand),
      thigh: [deg(40) * (1 - stand) + deg(8) * (1 - press), deg(45) * (1 - stand)],
      knee: [deg(60) * (1 - stand), deg(55) * (1 - stand) + deg(30) * (1 - press)],
      arm: [deg(-50) * (1 - press) + deg(5) * stand, deg(-45) * (1 - press)],
      elbow: [deg(70) * plant * (1 - stand), deg(65) * plant * (1 - stand)],
      spineLean: deg(35) * (1 - stand),
      bounce: -0.3 * (1 - stand),
      headPitch: deg(10) * (1 - stand),
    }
  }

  if (clip === 'surrender') {
    const up = ease
    return {
      ...p,
      arm: [deg(-110) * up, deg(-110) * up],
      elbow: [deg(10), deg(10)],
      shoulder: [deg(-50) * up, deg(-50) * up],
      headPitch: deg(4),
      prop: false,
      aim: 0,
    }
  }

  if (clip === 'hazardPanic') {
    // Stationary: upper-body flinch only — feet stay planted.
    return { ...p, ...evalHazardPanicUpper(t), bounce: 0, hipDrop: 0 }
  }

  // Fidgets — upper body / lean only so soles stay planted on the tile.
  if (clip === 'idleLookAround') {
    const look = Math.sin(t * Math.PI * 2)
    return { ...evalIdlePose(t), headYaw: deg(28) * look, torsoYaw: deg(8) * look }
  }
  if (clip === 'idleShiftWeight') {
    const w = Math.sin(t * Math.PI)
    return {
      ...evalIdlePose(t),
      sideLean: deg(5) * w,
      hipYaw: deg(4) * w,
      torsoYaw: deg(3) * w,
    }
  }
  if (clip === 'idleTurn') {
    const turn = Math.sin(t * Math.PI)
    return { ...evalIdlePose(t), hipYaw: deg(35) * turn, torsoYaw: deg(20) * turn, headYaw: deg(15) * turn }
  }
  if (clip === 'idleCheckPhaser') {
    // Quiet hip check — no drawn prop / aim flash (that read as a combat ready).
    const reach = Math.sin(Math.min(1, t * 1.6) * Math.PI)
    return {
      ...evalIdlePose(t),
      arm: [deg(2), deg(4) - deg(18) * reach],
      elbow: [deg(14), deg(16) + deg(22) * reach],
      shoulder: [deg(1), deg(2) - deg(6) * reach],
      headPitch: deg(8) + deg(4) * reach,
      headYaw: deg(5) * reach,
      torsoYaw: deg(3) * reach,
      prop: false,
      aim: 0,
    }
  }
  if (clip === 'idleScratchHead') {
    const scratch = Math.sin(Math.min(1, t * 2.2) * Math.PI)
    return {
      ...evalIdlePose(t),
      arm: [deg(2) - deg(90) * scratch, deg(4)],
      elbow: [deg(14) + deg(60) * scratch, deg(16)],
      headYaw: deg(-8) * scratch,
    }
  }

  return evalIdlePose(t)
}

/** Shared panic torso/arms — clutch the head in pain (stationary + walk/run variants). */
function evalHazardPanicUpper(t) {
  // Slow squeeze pulse + fine tremor (not the old arm-flail).
  const clutch = 0.72 + 0.28 * Math.sin(t * Math.PI * 3.2)
  const tremor = Math.sin(t * Math.PI * 11)
  const rock = Math.sin(t * Math.PI * 2.4)
  return {
    // Both hands up to the temples; elbows bent so palms meet the skull.
    arm: [deg(-102) - deg(6) * clutch + deg(3) * tremor, deg(-100) - deg(6) * clutch - deg(3) * tremor],
    elbow: [deg(78) + deg(14) * clutch, deg(80) + deg(14) * clutch],
    shoulder: [deg(-32) - deg(8) * clutch, deg(-30) - deg(8) * clutch],
    torsoYaw: deg(5) * rock,
    headYaw: deg(7) * rock + deg(2) * tremor,
    headPitch: deg(14) + deg(5) * clutch,
    spineLean: deg(10) + deg(4) * clutch,
    chestLean: deg(4),
    prop: false,
    aim: 0,
  }
}

/** Walk/run legs with head-clutch upper body. */
function evalHazardPanicMove(u, runMix, weight) {
  const gait = evalGaitPose(u, runMix, weight, 0)
  const panic = evalHazardPanicUpper(u)
  return {
    ...gait,
    arm: panic.arm,
    elbow: panic.elbow,
    shoulder: panic.shoulder,
    torsoYaw: panic.torsoYaw,
    headYaw: panic.headYaw,
    headPitch: panic.headPitch,
    spineLean: (gait.spineLean ?? 0) * 0.35 + panic.spineLean,
    chestLean: (gait.chestLean ?? 0) * 0.25 + (panic.chestLean ?? 0),
    hipDrop: 0,
    prop: false,
    aim: 0,
  }
}

export function evalLocomotionPose(clip, u) {
  if (clip === 'walk') return evalGaitPose(u, 0, 1)
  if (clip === 'run') return evalGaitPose(u, 1, 1)
  if (clip === 'sneakWalk') return evalGaitPose(u, 0, 1, 0.85)
  if (clip === 'sneakIdle') return evalSneakIdle(u)
  if (clip === 'hazardPanicWalk') return evalHazardPanicMove(u, 0, 1)
  if (clip === 'hazardPanicRun') return evalHazardPanicMove(u, 1, 1)
  return evalIdlePose(u)
}

export function isLoco(clip) {
  return (
    clip === 'idle' ||
    clip === 'walk' ||
    clip === 'run' ||
    clip === 'sneakIdle' ||
    clip === 'sneakWalk' ||
    clip === 'stepBack' ||
    clip === 'hazardPanicWalk' ||
    clip === 'hazardPanicRun'
  )
}

export class HumanoidAnimator {
  constructor(model) {
    this.model = model
    this._clip = 'idle'
    this._targetSpeed = 0
    this._speed = 0
    this._prevSpeed = 0
    this._gaitPhase = 0
    this._idleT = 0
    this._actionT = 0
    this._actionDone = false
    this._paused = false
    // Animation viewer: once-clips hold the last frame instead of returning to idle.
    this._viewerHoldOnce = false
    // Animation viewer: treat once-clips as looping when the Loop checkbox is on.
    this._viewerLoopOnce = false
    this._lean = 0
    this._hipYaw = 0
    this._hipRoll = 0
    this._torsoYaw = 0
    this._spineLean = 0
    this._spineYaw = 0
    this._spineSide = 0
    this._chestLean = 0
    this._sideLean = 0
    this._sideStep = 0
    this._bounce = 0
    this._hipDrop = 0
    this._pitch = 0
    this._arm = [0, 0]
    this._shoulder = [0, 0]
    this._elbow = [deg(8), deg(10)]
    this._pose = evalIdlePose(0)
    this.model?.applyPose(this._pose)
  }

  get current() {
    return this._clip
  }

  get actionDone() {
    return Boolean(this._actionDone)
  }

  get paused() {
    return Boolean(this._paused)
  }

  /** Playhead 0–1 for the current clip (action phase, gait phase, or idle breath). */
  get progress() {
    const clip = this._clip
    if (isLoco(clip)) {
      if (clip === 'idle' || clip === 'sneakIdle' || this._targetSpeed === 0) {
        const idleSec = clipSeconds('idle')
        return idleSec > 0 ? clamp01(this._idleT / idleSec) : 0
      }
      return clamp01(this._gaitPhase)
    }
    const seconds = clipSeconds(clip)
    return seconds > 0 ? clamp01(this._actionT / seconds) : 1
  }

  setPaused(paused) {
    this._paused = Boolean(paused)
  }

  /** Lab mode: once-clips freeze at the end instead of auto-playing idle. */
  setViewerHoldOnce(on) {
    this._viewerHoldOnce = Boolean(on)
  }

  /** Lab mode: once-clips wrap like loop (overrides hold-at-end while on). */
  setViewerLoopOnce(on) {
    this._viewerLoopOnce = Boolean(on)
    if (this._viewerLoopOnce) this._actionDone = false
  }

  /**
   * Scrub to u∈[0,1] and snap the pose (no ease). Loco snaps gait/idle phase; actions set _actionT.
   */
  seek(u) {
    const t = clamp01(Number(u) || 0)
    const clip = this._clip
    if (isLoco(clip)) {
      this._speed = this._targetSpeed
      this._prevSpeed = this._speed
      const idleSec = clipSeconds('idle')
      if (clip === 'idle' || clip === 'sneakIdle' || this._targetSpeed === 0) {
        this._idleT = t * idleSec
        this._gaitPhase = 0
        const desired = clip === 'sneakIdle' ? evalSneakIdle(t) : evalIdlePose(t)
        this._snapPose(desired)
        return true
      }
      this._gaitPhase = t
      const sneak = clip === 'sneakWalk'
      const panicMove = clip === 'hazardPanicWalk' || clip === 'hazardPanicRun'
      const runMix = panicMove ? (clip === 'hazardPanicRun' ? 1 : 0) : sneak ? 0 : clip === 'run' ? 1 : 0
      let desired
      if (panicMove) desired = evalHazardPanicMove(t, runMix, 1)
      else if (clip === 'stepBack') desired = evalStepBackPose(t)
      else desired = evalGaitPose(t, runMix, 1, sneak ? 0.85 : 0)
      this._snapPose(desired)
      return true
    }
    const seconds = clipSeconds(clip)
    this._actionT = t * seconds
    this._actionDone = t >= 1 - 1e-6 && clipPlayMode(clip) !== 'loop'
    const desired = evalActionPose(clip, t)
    this._snapPose(desired)
    return true
  }

  /** Apply channels from a desired pose immediately (no ease). */
  _snapPose(desired) {
    this._lean = desired.lean ?? 0
    this._hipYaw = desired.hipYaw ?? 0
    this._hipRoll = desired.hipRoll ?? 0
    this._spineLean = desired.spineLean ?? 0
    this._spineYaw = desired.spineYaw ?? 0
    this._spineSide = desired.spineSide ?? 0
    this._sideLean = desired.sideLean ?? 0
    this._sideStep = desired.sideStep ?? 0
    this._bounce = desired.bounce ?? 0
    this._hipDrop = desired.hipDrop ?? 0
    this._chestLean = desired.chestLean ?? 0
    this._torsoYaw = desired.torsoYaw ?? 0
    this._pitch = desired.pitch ?? 0
    this._arm[0] = desired.arm?.[0] ?? 0
    this._arm[1] = desired.arm?.[1] ?? 0
    this._shoulder[0] = desired.shoulder?.[0] ?? 0
    this._shoulder[1] = desired.shoulder?.[1] ?? 0
    this._elbow[0] = desired.elbow?.[0] ?? 0
    this._elbow[1] = desired.elbow?.[1] ?? 0
    this._pose = { ...desired, lean: this._lean, hipYaw: this._hipYaw, bounce: this._bounce, pitch: this._pitch }
    this.model?.applyPose(this._pose)
  }

  /** Jump a hold/once clip to its final frame and apply that pose immediately (ragdoll → floor pose). */
  snapActionToEnd() {
    const clip = this._clip
    if (!clip || isLoco(clip)) return false
    const seconds = clipSeconds(clip)
    this._actionT = seconds
    this._actionDone = true
    const desired = String(clip).startsWith('fall') ? evalDeathRestPose(clip) : evalActionPose(clip, 1)
    this._snapPose(desired)
    return true
  }

  /** Lock a defeated body on a readable prone death rest (after ragdoll or fall hold). */
  applyDeathRest(fallClip) {
    const clip = fallClip || this._clip || 'fallBlastBack'
    this._clip = clip
    this._targetSpeed = 0
    this._speed = 0
    this._prevSpeed = 0
    this._actionT = clipSeconds(clip)
    this._actionDone = true
    this._snapPose(evalDeathRestPose(clip))
    return true
  }

  play(name, { force = false } = {}) {
    const clip = name && (CLIP_META[name] || LOCO_SPEED[name] !== undefined || IDLE_FIDGETS.includes(name)) ? name : null
    if (!clip) return false
    if (!force && this._clip === clip) return true
    const prev = this._clip
    this._clip = clip
    this._targetSpeed = LOCO_SPEED[clip] ?? 0
    this._actionT = 0
    this._actionDone = false
    const leavingFall = String(prev).startsWith('fall') || prev === 'getUp'
    const upright =
      clip === 'idle' ||
      clip === 'cover' ||
      clip === 'hazardPanic' ||
      clip === 'walk' ||
      clip === 'run' ||
      clip === 'sneakWalk' ||
      clip === 'sneakIdle' ||
      clip === 'stepBack' ||
      clip === 'hazardPanicWalk' ||
      clip === 'hazardPanicRun' ||
      IDLE_FIDGETS.includes(clip)
    // Fall/getUp tip (pitch) must not carry into idle/cover — that read as floating or bent double.
    if (upright && (force || leavingFall || clip === 'cover' || clip === 'idle')) {
      this._pitch = 0
      if (clip !== 'cover') this._hipDrop = 0
    }
    if (force) {
      this._speed = this._targetSpeed
      this._prevSpeed = this._speed
      if (clip === 'idle') {
        // Snap out of fall/getUp lean so a force-idle after ragdoll/beam cannot leave a tipped body.
        this._gaitPhase = 0
        this._lean = 0
        this._spineLean = 0
        this._chestLean = 0
        this._sideLean = 0
        this._pitch = 0
        this._bounce = 0
        this._hipDrop = 0
        this._hipYaw = 0
        this._torsoYaw = 0
        this._pose = evalIdlePose(0)
        this.model?.applyPose(this._pose)
      }
    } else if (isLoco(clip) && this._targetSpeed === 0 && isLoco(prev)) {
      this._speed = 0
      this._prevSpeed = 0
      this._gaitPhase = 0
    }
    return true
  }

  update(dt, travel = null) {
    if (this._paused) return
    if (!(dt > 0) || dt > 0.1) return

    const clip = this._clip
    const mode = clipPlayMode(clip)
    const seconds = clipSeconds(clip)

    // Non-locomotion: drive action phase; loop/once/hold per catalogue.
    if (!isLoco(clip)) {
      const loopOnce = mode === 'once' && this._viewerLoopOnce
      if (!this._actionDone) {
        this._actionT += dt
        if (this._actionT >= seconds) {
          if (mode === 'loop' || loopOnce) this._actionT %= seconds
          else {
            this._actionT = seconds
            this._actionDone = true
            if (mode === 'once' && !this._viewerHoldOnce) {
              // Return to idle after one-shots (attack, fidgets, getUp, …).
              this.play('idle')
              return this.update(dt, travel)
            }
          }
        }
      }
      const u = seconds > 0 ? Math.min(1, this._actionT / seconds) : 1
      const holdEnd = (mode === 'hold' || (mode === 'once' && this._viewerHoldOnce && !this._viewerLoopOnce)) && this._actionDone
      const desired = evalActionPose(clip, holdEnd ? 1 : u)
      this._applyDesired(desired, dt, 0, true)
      return
    }

    const target = this._targetSpeed
    const k = target >= this._speed ? K_UP : K_DOWN
    this._speed = easeToward(this._speed, target, k, dt)
    if (Math.abs(target - this._speed) < 0.0008) this._speed = target

    const speed = this._speed
    const speedRate = (speed - this._prevSpeed) / dt
    this._prevSpeed = speed
    const sneak = clip === 'sneakWalk' || clip === 'sneakIdle'
    const panicMove = clip === 'hazardPanicWalk' || clip === 'hazardPanicRun'
    const runMix = panicMove
      ? clip === 'hazardPanicRun'
        ? 1
        : 0
      : sneak || speed <= SPEED_WALK
        ? 0
        : clamp01((speed - SPEED_WALK) / (SPEED_RUN - SPEED_WALK))
    const weight = clamp01(speed / (sneak ? SPEED_WALK * 0.65 : SPEED_WALK))
    const weightEase = weight * weight * (3 - 2 * weight)
    const crouch = sneak ? 0.85 : 0

    if (speed > 0.015) {
      const stride = lerp(WALK_STRIDE, RUN_STRIDE, runMix) * (sneak ? 0.7 : 1)
      if (travel == null) {
        const cycle = lerp(WALK_SECONDS, RUN_SECONDS, runMix) * (sneak ? 1.35 : 1)
        this._gaitPhase = (this._gaitPhase + dt / cycle) % 1
      } else {
        const stepped = Math.min(MAX_TRAVEL, Math.max(0, travel))
        if (stepped > 1e-5) this._gaitPhase = (this._gaitPhase + stepped / stride) % 1
      }
    }

    this._idleT += dt
    const idleSec = clipSeconds('idle')
    if (this._idleT >= idleSec) this._idleT %= idleSec

    let desired
    if (clip === 'sneakIdle' || (sneak && weightEase < 0.02)) {
      desired = evalSneakIdle(this._idleT / idleSec)
    } else if (weightEase < 0.02) {
      desired = evalIdlePose(this._idleT / idleSec)
    } else if (panicMove) {
      desired = evalHazardPanicMove(this._gaitPhase, runMix, Math.max(0.55, weightEase))
    } else if (clip === 'stepBack') {
      const idle = evalIdlePose(this._idleT / idleSec)
      const step = evalStepBackPose(this._gaitPhase)
      desired =
        weightEase > 0.97
          ? step
          : {
              ...step,
              bounce: lerp(idle.bounce, step.bounce, weightEase),
              headYaw: lerp(idle.headYaw, step.headYaw, weightEase),
              breathe: (idle.breathe ?? 0) * (1 - weightEase),
            }
    } else if (weightEase > 0.97 && speed >= (sneak ? SPEED_WALK * 0.5 : SPEED_WALK * 0.98)) {
      desired = evalGaitPose(this._gaitPhase, runMix, 1, crouch)
    } else {
      const idle = sneak ? evalSneakIdle(this._idleT / idleSec) : evalIdlePose(this._idleT / idleSec)
      const gait = evalGaitPose(this._gaitPhase, runMix, weightEase, crouch)
      desired = {
        ...gait,
        bounce: lerp(idle.bounce, gait.bounce, weightEase),
        headYaw: lerp(idle.headYaw, gait.headYaw, weightEase),
        breathe: (idle.breathe ?? 0) * (1 - weightEase),
      }
    }

    this._applyDesired(desired, dt, speedRate, target <= 0)
  }

  _applyDesired(desired, dt, speedRate, stopping) {
    const kSpine = stopping ? K_STOP : K_SPINE
    const kChest = stopping ? K_STOP : K_CHEST
    const kArm = stopping ? K_STOP : K_ARM
    const accelLean = stopping ? 0 : Math.max(0, Math.min(ACCEL_LEAN_MAX, speedRate * ACCEL_LEAN))
    this._lean = easeToward(this._lean, (desired.lean ?? 0) + accelLean, kSpine, dt)
    this._hipYaw = easeToward(this._hipYaw, desired.hipYaw ?? 0, K_HIP, dt)
    this._hipRoll = easeToward(this._hipRoll, desired.hipRoll ?? 0, K_HIP, dt)
    this._spineLean = easeToward(this._spineLean, (desired.spineLean ?? 0) + accelLean * 0.75, kSpine, dt)
    this._spineYaw = easeToward(this._spineYaw, desired.spineYaw ?? 0, kSpine, dt)
    this._spineSide = easeToward(this._spineSide, desired.spineSide ?? 0, kSpine, dt)
    this._sideLean = easeToward(this._sideLean, desired.sideLean ?? 0, kSpine, dt)
    this._sideStep = easeToward(this._sideStep, desired.sideStep ?? 0, K_HIP, dt)
    this._bounce = easeToward(this._bounce, desired.bounce ?? 0, K_HIP, dt)
    // Leave cover kneel quickly so idle doesn’t keep sinking/lifting the soles.
    const dropTarget = desired.hipDrop ?? 0
    this._hipDrop = easeToward(this._hipDrop ?? 0, dropTarget, dropTarget < 0.05 || stopping ? K_STOP : K_HIP, dt)
    this._chestLean = easeToward(this._chestLean, (desired.chestLean ?? 0) + accelLean * 0.4, kChest, dt)
    this._torsoYaw = easeToward(this._torsoYaw, desired.torsoYaw ?? 0, kChest, dt)
    this._pitch = easeToward(this._pitch, desired.pitch ?? 0, stopping ? K_STOP : K_SPINE, dt)
    const shoulder = desired.shoulder ?? [0, 0]
    this._arm[0] = easeToward(this._arm[0], desired.arm[0], kArm, dt)
    this._arm[1] = easeToward(this._arm[1], desired.arm[1], kArm, dt)
    this._shoulder[0] = easeToward(this._shoulder[0], shoulder[0], kArm, dt)
    this._shoulder[1] = easeToward(this._shoulder[1], shoulder[1], kArm, dt)
    this._elbow[0] = easeToward(this._elbow[0], desired.elbow[0], kArm, dt)
    this._elbow[1] = easeToward(this._elbow[1], desired.elbow[1], kArm, dt)

    this._pose = {
      ...desired,
      lean: this._lean,
      hipYaw: this._hipYaw,
      hipRoll: this._hipRoll,
      spineLean: this._spineLean,
      spineYaw: this._spineYaw,
      spineSide: this._spineSide,
      chestLean: this._chestLean,
      torsoYaw: this._torsoYaw,
      sideLean: this._sideLean,
      sideStep: this._sideStep,
      bounce: this._bounce,
      hipDrop: this._hipDrop,
      pitch: this._pitch,
      arm: [this._arm[0], this._arm[1]],
      shoulder: [this._shoulder[0], this._shoulder[1]],
      elbow: [this._elbow[0], this._elbow[1]],
    }
    this.model?.applyPose(this._pose)
  }
}
