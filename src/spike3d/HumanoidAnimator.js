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
  resolveClipName,
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
  // Full sine stride — plant-bias was skating the feet under a moving root.
  const liftL = 0.5 * (1 - c)
  const liftR = 0.5 * (1 + c)
  const bobWave = 0.5 * (1 - Math.cos(phase * 2))
  // Light arm lag only (no extra hipDrop / harmonics that read as slide).
  const sArm = Math.sin(phase + lerp(0.12, 0.06, r))
  const amp = deg(lerp(26, 40, r)) * w * (1 - crouch * 0.25)
  const kneeFlex = deg(lerp(30, 54, r)) * w
  const kneeBase = deg(lerp(6, 11, r)) + deg(50) * crouch
  const armAmp = deg(lerp(34, 68, r)) * w * (1 - crouch * 0.55)
  const shoulderAmp = deg(lerp(14, 28, r)) * w * (1 - crouch * 0.4)
  const bob = lerp(0.18, 0.42, r) * w
  const lean = deg(lerp(5, 10, r)) * w + deg(16) * crouch
  const twist = deg(lerp(4, 7, r)) * w
  const side = -s * deg(lerp(2, 3.5, r)) * w
  // Thigh +X swings the leg back (−Z); crouch must go the other way so he squats forward.
  const crouchThigh = -deg(36) * crouch
  const crouchArm = deg(22) * crouch
  const crouchElbow = deg(48) * crouch
  return {
    ...basePose(),
    thigh: [deg(1.5) + amp * s + crouchThigh, deg(-1) - amp * s + crouchThigh],
    knee: [kneeBase + kneeFlex * liftL * liftL, kneeBase + kneeFlex * liftR * liftR],
    arm: [deg(8) + armAmp * sArm + crouchArm, deg(9) - armAmp * sArm + crouchArm],
    shoulder: [shoulderAmp * sArm + deg(6) * crouch, -shoulderAmp * sArm + deg(8) * crouch],
    elbow: [
      deg(lerp(28, 50, r)) + deg(16) * liftR * w + crouchElbow,
      deg(lerp(28, 50, r)) + deg(16) * liftL * w + crouchElbow,
    ],
    lean,
    bounce: bobWave * bob - crouch * 0.06,
    hipDrop: 1.6 * crouch,
    spineYaw: s * twist * 0.45,
    spineLean: lean * 0.7,
    spineSide: side * 0.55,
    chestLean: lean * 0.3 + bobWave * deg(lerp(0.6, 1.4, r)) * w,
    torsoYaw: -s * twist * 1.05,
    headYaw: -s * deg(2.5) * w,
    headPitch: deg(lerp(0.6, 2, r)) * w + bobWave * deg(0.8) * w + deg(10) * crouch,
    sideLean: side,
  }
}

/** Slow scan while crouched — not the tiny idle fidget yaw. */
function evalSneakLook(u) {
  const w = clamp01(u) * Math.PI * 2
  return {
    headYaw: Math.sin(w * 0.55) * deg(22) + Math.sin(w * 0.22) * deg(10),
    headPitch: deg(10) + Math.sin(w * 0.35) * deg(5) + Math.sin(w * 0.9) * deg(2),
  }
}

/**
 * Sneak arms out to the sides (lateral).
 * On this rig +arm X swings BACK — keep arm slightly negative (forward of torso) and raise with armSide.
 * open 1 = idle; lower = walk (milder).
 */
function evalSneakHands(open = 1) {
  const o = clamp01(open)
  return {
    arm: [deg(lerp(-6, -10, o)), deg(lerp(-5, -9, o))],
    elbow: [deg(lerp(48, 42, o)), deg(lerp(46, 40, o))],
    shoulder: [deg(lerp(2, 3, o)), deg(lerp(2, 4, o))],
    // Mild side raise — was reading as a full A-pose.
    armSide: [deg(lerp(12, 20, o)), deg(lerp(12, 20, o))],
  }
}

function evalSneakIdle(u) {
  const idle = evalIdlePose(u)
  const look = evalSneakLook(u)
  return {
    ...idle,
    // Crouch: thighs forward (−X), deep knee bend; arms out to the sides, head scanning.
    thigh: [deg(-48), deg(-44)],
    knee: [deg(78), deg(74)],
    ...evalSneakHands(1),
    spineLean: deg(14) + idle.spineLean,
    chestLean: deg(6),
    lean: deg(16),
    bounce: 0,
    hipDrop: 1.8,
    headYaw: look.headYaw,
    headPitch: look.headPitch,
  }
}

/** Crouched shuffle with arms out to the sides and the same head scan as sneak idle. */
function evalSneakWalk(u) {
  const gait = evalGaitPose(u, 0, 1, 0.85)
  const look = evalSneakLook(u)
  const hands = evalSneakHands(0.65)
  // Keep a little stride sway on the arms so they don’t freeze solid while moving.
  const sway = Math.sin(clamp01(u) * Math.PI * 2) * deg(5)
  return {
    ...gait,
    arm: [hands.arm[0] + sway, hands.arm[1] - sway],
    elbow: hands.elbow,
    shoulder: hands.shoulder,
    armSide: hands.armSide,
    headYaw: look.headYaw,
    headPitch: look.headPitch,
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
    // Kneeling cover loop: planted R knee / L foot, gun by the head.
    // Only integer harmonics of the loop (1×, 2×) so t=0 and t=1 match — fractional rates popped every cycle.
    const w = clamp01(t) * Math.PI * 2
    const breathe = Math.sin(w * 2)
    const look = Math.sin(w)
    const look2 = Math.sin(w * 2 + 0.6)
    return {
      ...p,
      pitch: 0,
      // Kneel locked — no thigh/knee rock (that read as glitchy foot swim).
      thigh: [deg(5), deg(-45)],
      knee: [deg(98), deg(108)],
      lean: deg(6) + deg(1.2) * breathe,
      spineLean: deg(8) + deg(1.8) * breathe,
      chestLean: deg(3) + deg(1.2) * breathe,
      sideLean: 0,
      spineSide: 0,
      torsoYaw: deg(-4) + deg(3) * look,
      hipYaw: 0,
      headPitch: deg(4) + deg(2) * breathe + deg(2) * look2,
      headYaw: deg(4) + deg(10) * look,
      arm: [deg(10) + deg(2) * breathe, deg(-62) + deg(3) * look2],
      elbow: [deg(14), deg(108) + deg(3) * breathe],
      shoulder: [deg(2), deg(-28) + deg(2) * look2],
      armSide: [0, deg(14)],
      bounce: 0,
      // Fixed drop — breathing hipDrop bobbed the whole kneel.
      hipDrop: 8.7,
      prop: true,
      aim: 0.95 + 0.03 * breathe,
    }
  }

  if (clip === 'cover-enter') {
    // Stand → drop into cover kneel (R knee down, L foot forward, phaser to head-ready).
    const drop = clamp01(clamp01(t) / 0.92)
    const dropE = drop * drop * (3 - 2 * drop)
    return {
      ...p,
      pitch: 0,
      thigh: [lerp(deg(1.5), deg(5), dropE), lerp(deg(-1), deg(-45), dropE)],
      knee: [lerp(deg(5), deg(98), dropE), lerp(deg(5), deg(108), dropE)],
      lean: lerp(deg(2), deg(6), dropE),
      spineLean: lerp(deg(2), deg(8), dropE),
      chestLean: lerp(deg(1), deg(3), dropE),
      sideLean: 0,
      spineSide: 0,
      torsoYaw: lerp(0, deg(-4), dropE),
      hipYaw: 0,
      headPitch: lerp(deg(8), deg(4), dropE),
      headYaw: lerp(0, deg(4), dropE),
      arm: [lerp(deg(4), deg(10), dropE), lerp(deg(4), deg(-62), dropE)],
      elbow: [lerp(deg(14), deg(14), dropE), lerp(deg(16), deg(108), dropE)],
      shoulder: [lerp(deg(1), deg(2), dropE), lerp(deg(2), deg(-28), dropE)],
      armSide: [0, lerp(0, deg(14), dropE)],
      bounce: 0,
      hipDrop: lerp(0, 8.7, dropE),
      prop: dropE > 0.12,
      aim: lerp(0, 0.95, dropE),
    }
  }

  if (clip === 'cover-attack') {
    // Rise from kneel → stand → fire → drop back into cover (so the cover loop doesn’t pop).
    const u = clamp01(t)
    const rise = clamp01(u / 0.32)
    const riseE = rise * rise * (3 - 2 * rise)
    const fire = Math.sin(clamp01((u - 0.22) / 0.4) * Math.PI)
    const fireE = fire * fire * (3 - 2 * fire)
    const sink = u > 0.68 ? clamp01((u - 0.68) / 0.32) : 0
    const sinkE = sink * sink * (3 - 2 * sink)
    // 1 = fully up for the shot; ease back to kneel at the end.
    const up = riseE * (1 - sinkE)
    return {
      ...p,
      pitch: 0,
      thigh: [lerp(deg(5), deg(1.5), up), lerp(deg(-45), deg(-1), up)],
      knee: [lerp(deg(98), deg(5), up), lerp(deg(108), deg(5), up)],
      lean: lerp(deg(6), deg(4), up) + deg(5) * fireE * (1 - sinkE),
      spineLean: lerp(deg(8), deg(4), up) + deg(6) * fireE * (1 - sinkE),
      chestLean: lerp(deg(3), deg(2), up) + deg(3) * fireE * (1 - sinkE),
      sideLean: 0,
      spineSide: 0,
      torsoYaw: lerp(deg(-4), 0, up) + deg(-5) * fireE * (1 - sinkE),
      hipYaw: 0,
      headPitch: lerp(deg(4), deg(2), up) + deg(2) * fireE * (1 - sinkE),
      headYaw: lerp(deg(4), deg(-2), up),
      arm: [lerp(deg(10), deg(6), up), lerp(deg(-62), deg(-90), fireE * (1 - sinkE) + 0 * sinkE)],
      elbow: [deg(14), lerp(deg(108), deg(10), fireE * (1 - sinkE))],
      shoulder: [deg(2), lerp(deg(-28), deg(-4), fireE * (1 - sinkE))],
      armSide: [0, lerp(deg(14), 0, fireE * (1 - sinkE))],
      bounce: 0,
      hipDrop: lerp(8.7, 0, up),
      prop: true,
      aim: lerp(0.95, 1, fireE * (1 - sinkE)),
    }
  }

  if (clip === 'phaser-attack01' || clip === 'attack') {
    // Phaser: gun arm points FORWARD along facing, then lowers. No recoil / fire kick.
    // Legacy clip id `attack` kept for any stale callers; catalogue name is phaser-attack01.
    // On this rig −arm X is forward (+arm X is behind). Peak aim at mid-clip.
    const lift = Math.sin(clamp01(t) * Math.PI)
    const liftE = lift * lift * (3 - 2 * lift)
    return {
      ...p,
      // Feet planted — no thigh/knee/hip motion for the whole clip.
      thigh: [deg(1.5), deg(-1)],
      knee: [deg(5), deg(5)],
      // Right stays down; left thrusts horizontal-forward (−90°). Past that tips the muzzle up.
      arm: [deg(6), lerp(deg(6), deg(-90), liftE)],
      elbow: [deg(14), lerp(deg(16), deg(10), liftE)],
      shoulder: [deg(2), lerp(deg(2), deg(-4), liftE)],
      armSide: [0, 0],
      spineLean: deg(6) * liftE,
      chestLean: deg(2) * liftE,
      lean: deg(6) * liftE,
      headPitch: deg(2) * liftE,
      headYaw: deg(-2) * liftE,
      torsoYaw: deg(-4) * liftE,
      hipYaw: 0,
      hipDrop: 0,
      bounce: 0,
      sideLean: 0,
      spineSide: 0,
      prop: liftE > 0.04,
      aim: liftE,
    }
  }

  if (clip === 'melee') {
    // Two-handed shove: both arms thrust forward, slightly out of sync. Right foot planted;
    // left leg steps forward then recovers. −arm / −thigh X = forward on this rig.
    const easePush = (u) => {
      const s = Math.sin(clamp01(u) * Math.PI)
      return s * s * (3 - 2 * s)
    }
    // Left arm lags the right a little so the shove isn’t perfectly mirrored.
    const pushR = easePush(t)
    const pushL = easePush(t - 0.1)
    const windR = t < 0.28 ? Math.sin((t / 0.28) * Math.PI) * (1 - pushR) : 0
    const windL = t < 0.34 ? Math.sin((t / 0.34) * Math.PI) * (1 - pushL) : 0
    // Left foot slides forward then back on the deck — thigh + matching knee so it never lifts.
    const step = Math.sin(clamp01(t) * Math.PI)
    return {
      ...p,
      thigh: [deg(1.5), lerp(deg(-1), deg(-14), step)],
      knee: [deg(6), lerp(deg(6), deg(22), step)],
      arm: [
        lerp(deg(6) + deg(18) * windR, deg(-88), pushR),
        lerp(deg(6) + deg(16) * windL, deg(-90), pushL),
      ],
      elbow: [
        lerp(deg(42) + deg(10) * windR, deg(8), pushR),
        lerp(deg(40) + deg(10) * windL, deg(8), pushL),
      ],
      shoulder: [
        lerp(deg(2) - deg(6) * windR, deg(-8), pushR),
        lerp(deg(2) - deg(6) * windL, deg(-8), pushL),
      ],
      // Negative armSide tucks both hands toward centre for a close two-hand shove.
      armSide: [lerp(0, deg(-22), pushR), lerp(0, deg(-22), pushL)],
      spineLean: deg(4) + deg(14) * Math.max(pushR, pushL) - deg(4) * Math.max(windR, windL),
      chestLean: deg(8) * Math.max(pushR, pushL),
      lean: deg(4) + deg(12) * Math.max(pushR, pushL),
      headPitch: deg(4) * Math.max(pushR, pushL),
      torsoYaw: deg(-3) * step,
      hipYaw: 0,
      hipDrop: 0,
      bounce: 0,
      sideLean: 0,
      spineSide: 0,
      prop: false,
      aim: 0,
    }
  }

  if (clip === 'punch') {
    // Heavy haymaker on arms[1] (the hand that reads as the character’s right in viewer/iso).
    // Other arm stays down. −arm X = forward. Slow coil, then a snappy commit.
    const u = clamp01(t)
    const wind = u < 0.4 ? Math.sin((u / 0.4) * (Math.PI * 0.5)) : u < 0.48 ? 1 : 0
    // Sharper than smoothstep — hangs near 0, then jumps into the hit.
    const smashX = clamp01((u - 0.38) / 0.28)
    const smash = smashX * smashX * smashX * (4 * (1 - smashX) + smashX)
    const smashPeak = Math.sin(clamp01((u - 0.38) / 0.42) * Math.PI)
    const commit = Math.max(smash, smashPeak * smashPeak)
    return {
      ...p,
      pitch: 0,
      // Step the lead foot into the hit; back leg drives.
      thigh: [deg(-2) - deg(26) * commit + deg(8) * wind, deg(6) + deg(14) * wind - deg(10) * commit],
      knee: [deg(8) + deg(36) * commit, deg(10) + deg(16) * wind],
      // [other arm down, punching arm coils back then whips high — face height]
      // Past −90° on arm X tips the fist up; shoulder lift carries it to the head.
      arm: [
        deg(18) + deg(10) * wind,
        lerp(deg(18) + deg(70) * wind, deg(-118), commit),
      ],
      elbow: [
        deg(48) + deg(6) * wind,
        lerp(deg(100) + deg(10) * wind, deg(8), commit),
      ],
      shoulder: [
        deg(2),
        lerp(deg(8) + deg(22) * wind, deg(-42), commit),
      ],
      armSide: [deg(6), lerp(deg(10) * wind, deg(4), commit)],
      spineLean: deg(4) - deg(10) * wind + deg(20) * commit,
      chestLean: -deg(4) * wind + deg(14) * commit,
      lean: deg(2) - deg(8) * wind + deg(18) * commit,
      // +yaw throws this shoulder through the target.
      torsoYaw: -deg(32) * wind + deg(40) * commit,
      hipYaw: -deg(14) * wind + deg(18) * commit,
      headPitch: -deg(6) * wind + deg(10) * commit,
      headYaw: -deg(14) * wind + deg(18) * commit,
      sideLean: -deg(10) * wind + deg(12) * commit,
      spineSide: -deg(6) * wind + deg(8) * commit,
      bounce: 0.05 * wind - 0.1 * commit,
      hipDrop: 1.2 * commit,
      prop: false,
      aim: 0,
    }
  }

  if (clip === 'kick') {
    // Extreme action-karate high kick on legs[1]. Plant (index 0) frozen. −thigh X = forward/up.
    const u = clamp01(t)
    const chamber = u < 0.42 ? Math.sin((u / 0.42) * (Math.PI * 0.5)) : u < 0.78 ? 1 : 1 - clamp01((u - 0.78) / 0.22)
    const snapX = clamp01((u - 0.4) / 0.18)
    const snap = snapX * snapX * (3 - 2 * snapX)
    const extend = u < 0.4 ? 0 : u < 0.72 ? snap * Math.sin(clamp01((u - 0.4) / 0.32) * Math.PI) : 0
    const drive = Math.max(chamber, extend)
    return {
      ...p,
      pitch: 0,
      // Plant locked. Kick almost vertical — chamber to chin, snap past the head.
      thigh: [deg(2), lerp(deg(-16), deg(-125), chamber) - deg(28) * extend],
      knee: [deg(6), lerp(deg(28), deg(130), chamber) - deg(108) * extend],
      // Big arm silhouette — opposite guard out, kick-side arm sweeps back then cuts.
      arm: [
        lerp(deg(-8), deg(-70), drive) - deg(12) * extend,
        deg(16) + deg(36) * chamber - deg(20) * extend,
      ],
      elbow: [
        lerp(deg(48), deg(28), drive),
        deg(50) + deg(18) * chamber,
      ],
      shoulder: [
        lerp(deg(-4), deg(-22), drive),
        deg(6) + deg(16) * chamber - deg(8) * extend,
      ],
      armSide: [lerp(deg(4), deg(14), drive), deg(10) + deg(8) * chamber],
      // Deep lean-back + twist into the kick so the upper body sells the height.
      spineLean: deg(4) - deg(16) * chamber + deg(14) * extend,
      chestLean: deg(2) - deg(10) * chamber + deg(10) * extend,
      lean: deg(4) - deg(12) * chamber + deg(12) * extend,
      torsoYaw: deg(18) * chamber + deg(10) * extend,
      hipYaw: deg(6) * chamber,
      headPitch: deg(8) - deg(6) * chamber + deg(14) * extend,
      headYaw: deg(12) * chamber + deg(6) * extend,
      sideLean: deg(6) * chamber + deg(4) * extend,
      spineSide: deg(4) * chamber,
      bounce: 0,
      hipDrop: 0,
      prop: false,
      aim: 0,
    }
  }

  if (clip === 'dodge' || clip === 'dodge-left' || clip === 'dodge-right') {
    // Boxer slip L/R: load → snap off the line → hold → recover.
    // side −1 = slip left (dodge-left / legacy dodge), +1 = slip right.
    const side = clip === 'dodge-right' ? 1 : -1
    const u = clamp01(t)
    const load = u < 0.22 ? u / 0.22 : 1
    const loadE = load * load * (3 - 2 * load)
    const slipX = clamp01((u - 0.16) / 0.2)
    const slipIn = slipX * slipX * (3 - 2 * slipX)
    const hold = u >= 0.36 && u <= 0.58 ? 1 : u < 0.36 ? slipIn : 1
    const back = u > 0.58 ? clamp01((u - 0.58) / 0.42) : 0
    const backE = back * back * (3 - 2 * back)
    const slip = u <= 0.58 ? Math.max(loadE * 0.35, slipIn) * hold : 1 - backE
    const crouch =
      lerp(loadE * 0.55, 1, Math.min(1, slipIn + (u > 0.36 && u < 0.58 ? 0.15 : 0))) *
      (u <= 0.58 ? 1 : 1 - backE * 0.85)
    return {
      ...p,
      pitch: 0,
      thigh: [deg(2) - deg(22) * crouch, deg(-1) - deg(22) * crouch],
      knee: [deg(10) + deg(52) * crouch, deg(10) + deg(52) * crouch],
      arm: [deg(-36) - deg(8) * slip, deg(-38) - deg(8) * slip],
      elbow: [deg(98) + deg(8) * slip, deg(100) + deg(8) * slip],
      shoulder: [deg(-22) - deg(6) * slip, deg(-20) - deg(6) * slip],
      armSide: [deg(10), deg(10)],
      spineLean: deg(8) + deg(20) * crouch + deg(6) * slip,
      chestLean: deg(4) + deg(12) * crouch,
      lean: deg(6) + deg(14) * crouch,
      sideLean: deg(28) * side * slip,
      spineSide: deg(22) * side * slip,
      torsoYaw: deg(12) * side * slip,
      hipYaw: 0,
      headPitch: deg(10) + deg(6) * crouch,
      // Cancel torso yaw so the face stays on the opponent.
      headYaw: deg(-12) * side * slip,
      bounce: 0,
      hipDrop: 2.4 * crouch,
      prop: false,
      aim: 0,
    }
  }

  if (clip === 'getHit' || clip === 'getHit-left' || clip === 'getHit-right') {
    // Upper-body recoil only — feet stay planted (no thigh/knee/bounce/hipDrop).
    // Same side convention as dodge (getHit-right = +1).
    const side = clip === 'getHit-right' ? 1 : -1
    const u = clamp01(t)
    const impact = u < 0.28 ? Math.sin((u / 0.28) * (Math.PI / 2)) : 1
    const hold = u >= 0.28 && u <= 0.52 ? 1 : impact
    const recover = u > 0.52 ? 1 - clamp01((u - 0.52) / 0.48) : 1
    const hit = (u <= 0.52 ? hold : recover) * (u < 0.28 ? impact * impact * (3 - 2 * impact) : 1)
    const snap = hit * hit
    return {
      ...p,
      arm: [deg(-38) * hit - deg(12) * snap, deg(-48) * hit - deg(10) * snap],
      elbow: [deg(28) + deg(42) * hit, deg(24) + deg(48) * hit],
      shoulder: [deg(-18) * hit, deg(-22) * hit],
      armSide: [deg(8) + deg(14) * side * hit, deg(8) - deg(10) * side * hit],
      spineLean: deg(-22) * hit - deg(8) * snap,
      chestLean: deg(-16) * hit,
      lean: deg(-10) * hit,
      headPitch: deg(-18) * hit - deg(6) * snap,
      torsoYaw: deg(22) * side * hit,
      sideLean: deg(26) * side * hit,
      spineSide: deg(20) * side * hit,
      headYaw: deg(-14) * side * hit,
      bounce: 0,
      hipDrop: 0,
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
  if (clip === 'sneakWalk') return evalSneakWalk(u)
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
      else if (sneak) desired = evalSneakWalk(t)
      else desired = evalGaitPose(t, runMix, 1, 0)
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
    const requested = resolveClipName(name)
    const clip =
      requested && (CLIP_META[requested] || LOCO_SPEED[requested] !== undefined || IDLE_FIDGETS.includes(requested))
        ? requested
        : null
    if (!clip) return false
    if (!force && this._clip === clip) return true
    const prev = this._clip
    this._clip = clip
    this._targetSpeed = LOCO_SPEED[clip] ?? 0
    this._actionT = 0
    this._actionDone = false
    const leavingFall = String(prev).startsWith('fall') || prev === 'getUp'
    const coverClip = clip === 'cover' || clip === 'cover-attack' || clip === 'cover-enter'
    // cover / cover-attack begin kneeling — keep hipDrop. cover-enter begins standing.
    const startKneeling = clip === 'cover' || clip === 'cover-attack'
    const upright =
      clip === 'idle' ||
      coverClip ||
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
    if (upright && (force || leavingFall || coverClip || clip === 'idle')) {
      this._pitch = 0
      if (!startKneeling) this._hipDrop = 0
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
      if (sneak) {
        // Stride from gait phase; head scan from idle clock so it doesn’t hitch every step.
        desired = { ...evalSneakWalk(this._gaitPhase), ...evalSneakLook(this._idleT / idleSec) }
      } else {
        desired = evalGaitPose(this._gaitPhase, runMix, 1, crouch)
      }
    } else {
      const idle = sneak ? evalSneakIdle(this._idleT / idleSec) : evalIdlePose(this._idleT / idleSec)
      const gait = sneak
        ? evalSneakWalk(this._gaitPhase)
        : evalGaitPose(this._gaitPhase, runMix, weightEase, crouch)
      // Sneak look-around stays on the idle clock so the scan doesn’t hitch with stride.
      const sneakLook = sneak ? evalSneakLook(this._idleT / idleSec) : null
      desired = {
        ...gait,
        bounce: lerp(idle.bounce, gait.bounce, weightEase),
        headYaw: sneakLook ? sneakLook.headYaw : lerp(idle.headYaw, gait.headYaw, weightEase),
        headPitch: sneakLook ? sneakLook.headPitch : gait.headPitch,
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
