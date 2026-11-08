/**
 * Clip name + timing contract for procedural (and later Mixamo) bodies.
 * Sourced from characterSprites.json so Mixamo mapping keeps the same names.
 */
import spriteData from '../data/adaptation/characterSprites.json'

const DEG = Math.PI / 180

/** @type {Record<string, { seconds: number, play: 'loop'|'once'|'hold' }>} */
export const CLIP_META = {}

for (const sheet of Object.values(spriteData.sheets ?? {})) {
  for (const [name, anim] of Object.entries(sheet.animations ?? {})) {
    CLIP_META[name] = {
      seconds: Number(anim.seconds) || 1,
      play: anim.play === 'hold' || anim.play === 'once' ? anim.play : 'loop',
    }
  }
}

export const IDLE_FIDGETS = spriteData.idleFidgets?.animations ?? [
  'idleLookAround',
  'idleShiftWeight',
  'idleTurn',
  'idleCheckPhaser',
  'idleScratchHead',
]

export function clipSeconds(name) {
  return CLIP_META[name]?.seconds ?? 1
}

export function clipPlayMode(name) {
  return CLIP_META[name]?.play ?? 'loop'
}

export const deg = (d) => d * DEG

export function lerp(a, b, t) {
  return a + (b - a) * t
}

export function clamp01(x) {
  return Math.min(1, Math.max(0, x))
}

/** Base standing pose channels. */
export function basePose() {
  return {
    thigh: [deg(1.5), deg(-1)],
    knee: [deg(5), deg(5)],
    arm: [deg(2), deg(4)],
    elbow: [deg(14), deg(16)],
    shoulder: [deg(1), deg(2)],
    breathe: 0,
    bounce: 0,
    hipYaw: 0,
    hipRoll: 0,
    torsoYaw: 0,
    headYaw: 0,
    headPitch: deg(8),
    sideStep: 0,
    sideLean: 0,
    lean: 0,
    spineLean: 0,
    spineYaw: 0,
    spineSide: 0,
    chestLean: 0,
    pitch: 0,
    prop: false,
    aim: 0,
  }
}
