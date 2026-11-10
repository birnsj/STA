/**
 * Clip name + timing contract for procedural (and later Mixamo) bodies.
 * Sourced from characterSprites.json so Mixamo mapping keeps the same names.
 * Viewer catalogues are filtered by animation set (humanoid vs monster, …).
 */
import spriteData from '../data/adaptation/characterSprites.json'
import animationSetsData from '../data/adaptation/animationSets.json'

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

// Procedural gait extras (not PNG sheet anims) — keep timings for the Animation Viewer / seek.
if (!CLIP_META.stepBack) CLIP_META.stepBack = { seconds: 0.8, play: 'loop' }
if (!CLIP_META.hazardPanicWalk) CLIP_META.hazardPanicWalk = { seconds: 0.8, play: 'loop' }
if (!CLIP_META.hazardPanicRun) CLIP_META.hazardPanicRun = { seconds: 0.6, play: 'loop' }

/** Old ranged-fire clip id → catalogue name. */
export const CLIP_ALIASES = Object.freeze({
  attack: 'phaser-attack01',
  dodge: 'dodge-left',
})

export function resolveClipName(name) {
  if (!name) return name
  return CLIP_ALIASES[name] ?? name
}

export const IDLE_FIDGETS = spriteData.idleFidgets?.animations ?? [
  'idleLookAround',
  'idleShiftWeight',
  'idleTurn',
  'idleCheckPhaser',
  'idleScratchHead',
]

/** Seconds between idle fidgets [min, max] — same catalogue as sprite FigureView. */
export const IDLE_FIDGET_GAP = spriteData.idleFidgets?.gapSeconds ?? [5, 14]

export function clipSeconds(name) {
  return CLIP_META[resolveClipName(name)]?.seconds ?? 1
}

export function clipPlayMode(name) {
  return CLIP_META[resolveClipName(name)]?.play ?? 'loop'
}

/** Sheet display order for the Animation Viewer. */
const VIEWER_SHEET_ORDER = [
  'walk',
  'run',
  'idle',
  'sneak',
  'combat',
  'reaction',
  'fall',
  'getup',
  'fidgets',
  'surrender',
  'panic',
]

const VIEWER_SHEET_LABELS = {
  walk: 'Walk',
  run: 'Run',
  idle: 'Idle',
  sneak: 'Sneak',
  combat: 'Combat',
  reaction: 'Reaction',
  fall: 'Fall',
  getup: 'Get Up',
  fidgets: 'Fidgets',
  surrender: 'Surrender',
  panic: 'Panic',
  base: 'Base (legacy)',
  '3dOnly': '3D only',
}

/** Gait clips on the procedural body that are not PNG sheet anims. */
const VIEWER_3D_ONLY = [
  { name: 'stepBack', seconds: 0.8, play: 'loop' },
  { name: 'hazardPanicWalk', seconds: 0.8, play: 'loop' },
  { name: 'hazardPanicRun', seconds: 0.6, play: 'loop' },
]

/** @returns {{ id: string, label: string, sheetIds: string[] }[]} */
export function listAnimationSets() {
  return (animationSetsData.sets ?? []).map((set) => ({
    id: set.id,
    label: set.label ?? set.id,
    sheetIds: [...(set.sheetIds ?? [])],
  }))
}

export function defaultAnimationSetId() {
  return animationSetsData.defaultSetId ?? 'humanoid'
}

/** Species → animation set (humanoids share one catalogue). */
export function animationSetIdForSpecies(speciesId) {
  const map = animationSetsData.speciesToSet ?? {}
  return map[speciesId] ?? defaultAnimationSetId()
}

function sheetAllowed(sheetId, allowedIds) {
  if (!allowedIds) return true
  return allowedIds.has(sheetId)
}

/**
 * Grouped clip catalogue for the Animation Viewer.
 * @param {string} [setId] animation set id (`humanoid`, `monster`, …); omit for default
 * @returns {{ id: string, label: string, clips: { name: string, seconds: number, play: string }[] }[]}
 */
export function animationViewerGroups(setId = defaultAnimationSetId()) {
  const set = (animationSetsData.sets ?? []).find((entry) => entry.id === setId)
  const allowedList = set?.sheetIds
  const allowed = allowedList ? new Set(allowedList) : null

  const groups = []
  const sheets = spriteData.sheets ?? {}
  const seen = new Set()
  const pushSheet = (sheetId) => {
    if (!sheetAllowed(sheetId, allowed)) return
    const sheet = sheets[sheetId]
    if (!sheet?.animations) return
    const clips = Object.entries(sheet.animations).map(([name, anim]) => {
      seen.add(name)
      return {
        name,
        seconds: Number(anim.seconds) || 1,
        play: anim.play === 'hold' || anim.play === 'once' ? anim.play : 'loop',
      }
    })
    if (!clips.length) return
    groups.push({
      id: sheetId,
      label: VIEWER_SHEET_LABELS[sheetId] ?? sheetId,
      clips,
    })
  }
  for (const id of VIEWER_SHEET_ORDER) pushSheet(id)
  for (const id of Object.keys(sheets)) {
    if (VIEWER_SHEET_ORDER.includes(id)) continue
    pushSheet(id)
  }
  if (sheetAllowed('3dOnly', allowed)) {
    const only3d = VIEWER_3D_ONLY.filter((clip) => !seen.has(clip.name))
    if (only3d.length) {
      groups.push({ id: '3dOnly', label: VIEWER_SHEET_LABELS['3dOnly'], clips: only3d })
    }
  }
  return groups
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
    // Extra abduction (radians) — arms out to the sides, not forward.
    armSide: [0, 0],
    breathe: 0,
    bounce: 0,
    hipDrop: 0,
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
