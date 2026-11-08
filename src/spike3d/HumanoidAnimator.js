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
const LOCO_SPEED = { idle: 0, walk: SPEED_WALK, run: SPEED_RUN, sneakWalk: SPEED_WALK * 0.65, sneakIdle: 0 }

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
    bounce: breathe * 0.05,
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

/** One-shot / hold pose curves. u∈[0,1]. */
function evalActionPose(clip, u) {
  const t = clamp01(u)
  const ease = t * t * (3 - 2 * t)
  const p = basePose()

  if (clip === 'cover') {
    const breathe = Math.sin(t * Math.PI * 2)
    return {
      ...p,
      thigh: [deg(8), deg(12)],
      knee: [deg(18), deg(22)],
      arm: [deg(-25), deg(-40)],
      elbow: [deg(70), deg(85)],
      shoulder: [deg(-20), deg(-35)],
      spineLean: deg(18),
      chestLean: deg(8),
      headPitch: deg(4),
      bounce: breathe * 0.03 - 0.05,
      prop: true,
      aim: 0.4,
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
      bounce: -0.35 * ease,
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
    const shake = Math.sin(t * Math.PI * 8)
    return {
      ...p,
      arm: [deg(-30) + deg(15) * shake, deg(-25) - deg(15) * shake],
      elbow: [deg(50), deg(55)],
      torsoYaw: deg(8) * shake,
      headYaw: deg(12) * shake,
      bounce: 0.04 * Math.abs(shake),
      spineLean: deg(6),
    }
  }

  // Fidgets
  if (clip === 'idleLookAround') {
    const look = Math.sin(t * Math.PI * 2)
    return { ...evalIdlePose(t), headYaw: deg(28) * look, torsoYaw: deg(8) * look }
  }
  if (clip === 'idleShiftWeight') {
    const w = Math.sin(t * Math.PI)
    return {
      ...evalIdlePose(t),
      thigh: [deg(1.5) + deg(6) * w, deg(-1) - deg(4) * w],
      sideLean: deg(6) * w,
      bounce: -0.02 * w,
    }
  }
  if (clip === 'idleTurn') {
    const turn = Math.sin(t * Math.PI)
    return { ...evalIdlePose(t), hipYaw: deg(35) * turn, torsoYaw: deg(20) * turn, headYaw: deg(15) * turn }
  }
  if (clip === 'idleCheckPhaser') {
    const reach = Math.sin(Math.min(1, t * 2) * Math.PI)
    return {
      ...evalIdlePose(t),
      arm: [deg(2), deg(4) - deg(55) * reach],
      elbow: [deg(14), deg(16) + deg(50) * reach],
      headPitch: deg(8) + deg(12) * reach,
      prop: reach > 0.4,
      aim: 0.2 * reach,
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

export function evalLocomotionPose(clip, u) {
  if (clip === 'walk') return evalGaitPose(u, 0, 1)
  if (clip === 'run') return evalGaitPose(u, 1, 1)
  if (clip === 'sneakWalk') return evalGaitPose(u, 0, 1, 0.85)
  if (clip === 'sneakIdle') return evalSneakIdle(u)
  return evalIdlePose(u)
}

function isLoco(clip) {
  return clip === 'idle' || clip === 'walk' || clip === 'run' || clip === 'sneakIdle' || clip === 'sneakWalk'
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

  play(name, { force = false } = {}) {
    const clip = name && (CLIP_META[name] || LOCO_SPEED[name] !== undefined || IDLE_FIDGETS.includes(name)) ? name : null
    if (!clip) return false
    if (!force && this._clip === clip) return true
    const prev = this._clip
    this._clip = clip
    this._targetSpeed = LOCO_SPEED[clip] ?? 0
    this._actionT = 0
    this._actionDone = false
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
    if (!(dt > 0) || dt > 0.1) return

    const clip = this._clip
    const mode = clipPlayMode(clip)
    const seconds = clipSeconds(clip)

    // Non-locomotion: drive action phase; loop/once/hold per catalogue.
    if (!isLoco(clip)) {
      if (!this._actionDone) {
        this._actionT += dt
        if (this._actionT >= seconds) {
          if (mode === 'loop') this._actionT %= seconds
          else {
            this._actionT = seconds
            this._actionDone = true
            if (mode === 'once') {
              // Return to idle after one-shots (attack, fidgets, getUp, …).
              this.play('idle')
              return this.update(dt, travel)
            }
          }
        }
      }
      const u = seconds > 0 ? Math.min(1, this._actionT / seconds) : 1
      const desired = evalActionPose(clip, mode === 'hold' && this._actionDone ? 1 : u)
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
    const runMix = sneak || speed <= SPEED_WALK ? 0 : clamp01((speed - SPEED_WALK) / (SPEED_RUN - SPEED_WALK))
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
      pitch: this._pitch,
      arm: [this._arm[0], this._arm[1]],
      shoulder: [this._shoulder[0], this._shoulder[1]],
      elbow: [this._elbow[0], this._elbow[1]],
    }
    this.model?.applyPose(this._pose)
  }
}
