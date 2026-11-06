// Starship Template Pieces — overlay duplicate of the Starship & Station palette (walls, floors, half bulkheads, props).
// Not map tiles; does not change Generate Map / makeTilesV2 / halfWalls generation.
// Usage: node scripts/makeTemplatePieces.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { paintPrismsAA, paintPrismsLightsAA } from './v2/templateDraw.mjs'

// Faces / materials that get wall-style light overlays (tileEffects wall fittings / props). Plain trim stays baked.
const OVERLAY_FACE = {
  lcars: { frameTime: 0.7, frames: [0, 1] },
  conduit: { frameTime: 0.2, frames: [0, 0, 1, 1] },
  hatch: { frameTime: 0.7, frames: [0, 1] },
  computer: { frameTime: 0.7, frames: [0, 1] },
  window: { frameTime: 0.5, frames: [0, 1] },
  viewport: { frameTime: 0.65, frames: [0, 1] },
  dock: { frameTime: 0.45, frames: [0, 0, 1, 1] },
}
const OVERLAY_MATERIAL = {
  machinery: { frameTime: 0.2, frames: [0, 0, 1, 1] },
  epsControl: { frameTime: 0.1, frames: [0, 1] },
  console: { frameTime: 0.55, frames: [0, 1] },
  bed: { frameTime: 0.9, frames: [0, 1] },
  pillar: { frameTime: 0.75, frames: [0, 1] },
  warpCoil: { frameTime: 0.28, frames: [0, 0, 1, 1] },
  pipeRiser: { frameTime: 0.5, frames: [0, 1] },
  junctionBox: { frameTime: 0.4, frames: [0, 1] },
  doorway: { frameTime: 0.7, frames: [0, 1] },
  grating: { frameTime: 0.35, frames: [0, 0, 1, 1] },
  floorSickbay: { frameTime: 0.9, frames: [0, 1] },
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'art', 'sprites', 'environment', 'templates')
const cataloguePath = path.join(root, 'src', 'data', 'adaptation', 'maps', 'templatePieces.json')

const THICK = 32
const HALF_THICK = 8 // 1/8 tile — matches makeTilesV2 HALF_THICK on a 64 design tile
const RUN = 64
const RUN_LONG = 128
const HEIGHT = 92
const FLOOR_H = 3

function box(x0, y0, x1, y1, z0, z1) {
  return { x0, y0, x1, y1, z0, z1 }
}

// Far-end overshoot (design units): tip-to-tip joins overlap slightly so AA seams don't read as gaps.
const SEAM = 1

function straightPrisms(length, thick, height) {
  return [box(-length - SEAM, -thick, 0, 0, 0, height)]
}

// 32-thick corner post: solid thick×thick pillar at the tip (designer: 32×32, not an L).
function cornerPostPrisms(thick, height) {
  return [box(-thick - SEAM, -thick - SEAM, 0, 0, 0, height)]
}

// Half-bulkhead corner: L of thin arms (run × thick). Tip at (0,0); arms into −X / −Y.
function cornerPrisms(run, thick, height) {
  return [
    box(-run - SEAM, -thick, 0, 0, 0, height),
    box(-thick, -run - SEAM, 0, 0, 0, height),
  ]
}

// Tee / cross / alcove / door-frame — tip-normalized multi-prism wall joins.
function teePrisms(run, thick, height) {
  const half = thick / 2
  return tipNormalize([
    box(-run - SEAM, -half, 0, half, 0, height),
    box(-half, -run - SEAM, half, -half, 0, height),
  ])
}
function crossPrisms(run, thick, height) {
  const half = thick / 2
  const arm = run / 2
  return tipNormalize([
    box(-half, -arm - SEAM, half, arm + SEAM, 0, height),
    box(-arm - SEAM, -half, arm + SEAM, half, 0, height),
  ])
}
function alcovePrisms(run, thick, depth, height) {
  // Back wall + two returns forming a niche into −Y.
  return tipNormalize([
    box(-run - SEAM, -thick, 0, 0, 0, height),
    box(-run - SEAM, -depth - SEAM, -run + thick, -thick, 0, height),
    box(-thick, -depth - SEAM, 0, -thick, 0, height),
  ])
}
function doorFramePrisms(run, thick, height, opening = 32) {
  // Two posts + lintel; opening centered on a run-length wall.
  const post = (run - opening) / 2
  const lintelZ = height - 24
  return [
    box(-run - SEAM, -thick, -run + post, 0, 0, height),
    box(-post - SEAM, -thick, 0, 0, 0, height),
    box(-run - SEAM, -thick, 0, 0, lintelZ, height),
  ]
}
function dockCollarPrisms(run, thick, height) {
  // Short collar stub: thicker flange at the tip + recessed throat.
  const flange = thick + 16
  return tipNormalize([
    box(-run - SEAM, -flange, 0, 0, 0, height - 20),
    box(-run + 8, -thick - 8, -8, 8, height - 20, height),
  ])
}

function slabPrisms(w, d, height) {
  return [box(-w, -d, 0, 0, 0, height)]
}

// Shift so the south tip (max X/Y) sits at (0,0) — same tip convention as walls/floors.
function tipNormalize(prisms) {
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of prisms) {
    maxX = Math.max(maxX, p.x0, p.x1)
    maxY = Math.max(maxY, p.y0, p.y1)
  }
  return prisms.map((p) => ({
    ...p,
    x0: p.x0 - maxX,
    y0: p.y0 - maxY,
    x1: p.x1 - maxX,
    y1: p.y1 - maxY,
  }))
}

function withMaterial(prisms, material) {
  return prisms.map((p) => ({ ...p, material }))
}

// Furniture footprints match Dimension Kit shapes; Starship materials replace flat Dim colours.
function chairPrisms() {
  return tipNormalize([
    box(-16, -8, -10, -2, 0, 8),
    box(10, -8, 16, -2, 0, 8),
    box(-16, 14, -10, 20, 0, 8),
    box(10, 14, 16, 20, 0, 8),
    box(-18, -6, 18, 20, 8, 12),
    box(-18, -22, 18, -8, 8, 28),
  ])
}
function stoolPrisms() {
  return tipNormalize([box(-5, -5, 5, 5, 0, 12), box(-14, -14, 14, 14, 12, 16)])
}
function benchPrisms() {
  return tipNormalize([
    box(-28, -6, -20, 2, 0, 8),
    box(20, -6, 28, 2, 0, 8),
    box(-28, 10, -20, 16, 0, 8),
    box(20, 10, 28, 16, 0, 8),
    box(-30, -8, 30, 16, 8, 12),
  ])
}
function benchLongPrisms() {
  return tipNormalize([
    box(-44, -6, -36, 2, 0, 8),
    box(36, -6, 44, 2, 0, 8),
    box(-44, 10, -36, 16, 0, 8),
    box(36, 10, 44, 16, 0, 8),
    box(-48, -8, 48, 16, 8, 12),
  ])
}
function bedPrisms() {
  return tipNormalize([
    box(-24, -16, 24, 26, 0, 8),
    box(-28, -14, 28, 28, 8, 12),
    box(-28, -28, 28, -16, 4, 24),
  ])
}
function tablePrisms() {
  return tipNormalize([
    box(-28, -28, -18, -18, 0, 14),
    box(18, -28, 28, -18, 0, 14),
    box(-28, 18, -18, 28, 0, 14),
    box(18, 18, 28, 28, 0, 14),
    box(-28, -28, 28, 28, 14, 16),
  ])
}
function consolePrisms() {
  // Thin upright screen (depth 6) so the LCARS face reads, not a floating slab top.
  return tipNormalize([
    ...withMaterial([box(-24, 0, 24, 26, 0, 14), box(-30, -6, 30, 28, 14, 18)], 'console'),
    ...withMaterial([box(-20, -16, 20, -10, 16, 38)], 'consoleScreen'),
  ])
}
function consoleWidePrisms() {
  return tipNormalize([
    ...withMaterial([box(-40, 0, 40, 28, 0, 14), box(-48, -6, 48, 30, 14, 18)], 'console'),
    ...withMaterial([box(-36, -16, 36, -10, 16, 40)], 'consoleScreen'),
  ])
}
function wallConsolePrisms() {
  return tipNormalize([
    ...withMaterial([box(-28, -4, 28, 14, 0, 14), box(-30, -8, 30, 16, 14, 18)], 'console'),
    ...withMaterial([box(-24, -14, 24, -8, 14, 38)], 'consoleScreen'),
  ])
}
function lockerPrisms() {
  return tipNormalize([box(-16, -16, 16, 16, 0, 52), box(-2, 14, 2, 18, 22, 30)])
}
function lockerWidePrisms() {
  return tipNormalize([box(-28, -16, 28, 16, 0, 52)])
}
function shelfPrisms() {
  return tipNormalize([
    box(-28, -22, -22, 22, 0, 36),
    box(22, -22, 28, 22, 0, 36),
    box(-22, -24, 22, -16, 0, 36),
    box(-22, -16, 22, 18, 10, 13),
    box(-22, -16, 22, 18, 22, 25),
    box(-22, -16, 22, 18, 34, 37),
  ])
}

function pillarPrisms(size, height) {
  return [box(-size - SEAM, -size - SEAM, 0, 0, 0, height)]
}
function warpCoilPrisms() {
  return tipNormalize([
    box(-22, -22, 22, 22, 0, 10),
    box(-16, -16, 16, 16, 10, 52),
    box(-24, -24, 24, 24, 18, 26),
    box(-24, -24, 24, 24, 34, 42),
  ])
}
function pipeRiserPrisms() {
  return tipNormalize([
    box(-14, -14, 14, 14, 0, 8),
    box(-5, -5, 5, 5, 8, 80),
    box(-14, -5, -6, 5, 8, 72),
    box(6, -5, 14, 5, 8, 64),
  ])
}
function junctionBoxPrisms() {
  return tipNormalize([box(-16, -10, 16, 10, 0, 28)])
}

// 90° CCW yaw around the tip (0,0) in item/world XY — vertical (Z) stays up. Used so R spins pieces on the
// isometric floor instead of tumbling them in screen space.
function yawPoint(x, y, turns) {
  let dx = x
  let dy = y
  const n = ((turns % 4) + 4) % 4
  for (let i = 0; i < n; i++) {
    const nextX = -dy
    const nextY = dx
    dx = nextX
    dy = nextY
  }
  return [dx, dy]
}

function yawPrisms(prisms, turns) {
  if (!turns) return prisms
  return prisms.map((prism) => {
    const [x0, y0] = yawPoint(prism.x0, prism.y0, turns)
    const [x1, y1] = yawPoint(prism.x1, prism.y1, turns)
    return { x0, y0, x1, y1, z0: prism.z0, z1: prism.z1 }
  })
}

const pieces = []
const pngFiles = []

function overlaySpec(face, material) {
  if (material && OVERLAY_MATERIAL[material]) return OVERLAY_MATERIAL[material]
  if (face && OVERLAY_FACE[face]) return OVERLAY_FACE[face]
  return null
}

function bakeOverlay(id, suffix, prisms, turns, face, material, spec) {
  // Bright / dim emission (not fully off) so the blink reads clearly over the base.
  const on = paintPrismsLightsAA(prisms, { face, material, yawTurns: turns, gain: 1.4 })
  const dim = paintPrismsLightsAA(prisms, { face, material, yawTurns: turns, gain: 0.25 })
  const onName = `${id}${suffix}-emission-0.png`
  const dimName = `${id}${suffix}-emission-1.png`
  pngFiles.push({ name: onName, png: on.png }, { name: dimName, png: dim.png })
  return {
    overlay: true,
    frameTime: spec.frameTime,
    frames: spec.frames,
    images: [
      { emission: `/art/sprites/environment/templates/${onName}` },
      { emission: `/art/sprites/environment/templates/${dimName}` },
    ],
  }
}

const GLOW = {
  lcars: '#a8c0ff',
  conduit: '#6fc8ff',
  hatch: '#ff4040',
  computer: '#aab4a3',
  machinery: '#ff6b3d',
  epsControl: '#5fd0ff',
  console: '#7aa8ff',
  bed: '#5fd0ff',
  viewport: '#6a90c8',
  dock: '#60ff90',
  pillar: '#5fd0ff',
  warpCoil: '#6fc8ff',
  pipeRiser: '#60ff90',
  junctionBox: '#ffb040',
  doorway: '#f0b030',
  grating: '#d0601a',
  floorSickbay: '#5fd0ff',
}

function pieceFlags(tags, face, material) {
  const set = new Set(tags)
  if (set.has('floor')) {
    const emit = material && GLOW[material] ? GLOW[material] : null
    return { cover: false, fade: false, emit }
  }
  if (set.has('crate')) return { cover: true, fade: false, emit: null }
  if (set.has('epsControl')) return { cover: true, fade: false, emit: GLOW.epsControl }
  if (set.has('machinery') || set.has('pillar')) {
    const fade = !set.has('junctionBox')
    const emit = material && GLOW[material] ? GLOW[material] : GLOW.machinery
    return { cover: true, fade, emit }
  }
  if (set.has('furniture')) {
    const fade = set.has('locker') || set.has('shelf')
    const emit = material && GLOW[material] ? GLOW[material] : null
    return { cover: true, fade, emit }
  }
  const key = material && GLOW[material] ? material : face && GLOW[face] ? face : null
  return { cover: false, fade: true, emit: key ? GLOW[key] : null }
}

function add(id, label, tags, footprint, height, prisms, { face = 'plain', material = null } = {}) {
  const painted0 = paintPrismsAA(prisms, { face, material, yawTurns: 0 })
  const spec = overlaySpec(face, material)
  const { cover, fade, emit } = pieceFlags(tags, face, material)
  const stamp = (anim) => {
    if (!anim) return null
    if (emit) anim.emitColour = emit
    return anim
  }
  const animation0 = stamp(spec ? bakeOverlay(id, '', prisms, 0, face, material, spec) : null)
  const orients = {}
  pngFiles.push({ name: `${id}.png`, png: painted0.png })
  for (const turns of [1, 2, 3]) {
    const yaw = turns * 90
    // Yaw the prism (wall silhouette) and pass yawTurns so floor/prop markings turn with it.
    const painted = paintPrismsAA(yawPrisms(prisms, turns), { face, material, yawTurns: turns })
    const name = `${id}_r${yaw}.png`
    pngFiles.push({ name, png: painted.png })
    const orient = {
      href: `/art/sprites/environment/templates/${name}`,
      size: { width: painted.size.w, height: painted.size.h },
      anchorX: painted.size.anchorX,
    }
    if (spec) orient.animation = stamp(bakeOverlay(id, `_r${yaw}`, yawPrisms(prisms, turns), turns, face, material, spec))
    orients[String(yaw)] = orient
  }
  pieces.push({
    id,
    label,
    href: `/art/sprites/environment/templates/${id}.png`,
    size: { width: painted0.size.w, height: painted0.size.h },
    anchorX: painted0.size.anchorX,
    ...(animation0 ? { animation: animation0 } : {}),
    orients,
    tags,
    footprint: { width: footprint.w, depth: footprint.d },
    height,
    cover,
    fade,
    ...(material ? { material } : { face }),
  })
}

// --- Walls (32 thick) ---
const STRAIGHTS = [
  { id: 'tplStarshipWall32', label: 'Bulkhead (No Windows) 32', face: 'plain', tags: ['plain', 'plainBulkhead'] },
  { id: 'tplStarshipWall32Window', label: 'Bulkhead (Windows) 32', face: 'window', tags: ['window', 'bulkhead'] },
  { id: 'tplStarshipWall32Lcars', label: 'LCARS Wall 32', face: 'lcars', tags: ['lcars', 'lcarsWall'] },
  { id: 'tplStarshipWall32Conduit', label: 'EPS Conduit Wall 32', face: 'conduit', tags: ['conduit', 'conduitWall'] },
  { id: 'tplStarshipWall32Hatch', label: 'Jefferies Hatch Wall 32', face: 'hatch', tags: ['hatch', 'hatchWall'] },
  { id: 'tplStarshipWall32Computer', label: 'Computer Bank Wall 32', face: 'computer', tags: ['computer', 'computerWall'] },
]
const LONGS = [
  { id: 'tplStarshipWall32PlainLong', label: 'Bulkhead (No Windows, Long) 32', face: 'plain', tags: ['plain', 'plainBulkhead', 'long'] },
  { id: 'tplStarshipWall32WindowLong', label: 'Bulkhead (Windows, Long) 32', face: 'window', tags: ['window', 'bulkhead', 'long'] },
  { id: 'tplStarshipWall32LcarsLong', label: 'LCARS Wall (Long) 32', face: 'lcars', tags: ['lcars', 'lcarsPanel', 'long'] },
  { id: 'tplStarshipWall32ConduitLong', label: 'EPS Conduit Wall (Long) 32', face: 'conduit', tags: ['conduit', 'conduitPanel', 'long'] },
  { id: 'tplStarshipWall32HatchLong', label: 'Jefferies Hatch Wall (Long) 32', face: 'hatch', tags: ['hatch', 'hatchPanel', 'long'] },
  { id: 'tplStarshipWall32ComputerLong', label: 'Computer Bank Wall (Long) 32', face: 'computer', tags: ['computer', 'computerPanel', 'long'] },
]

for (const entry of STRAIGHTS) {
  add(entry.id, entry.label, ['wall', 'starship', 'straight', 'thick32', ...entry.tags], { w: RUN, d: THICK }, HEIGHT, straightPrisms(RUN, THICK, HEIGHT), {
    face: entry.face,
  })
}
add(
  'tplStarshipWall32Corner',
  'Bulkhead Corner 32',
  ['wall', 'starship', 'corner', 'thick32', 'plain', 'plainBulkhead'],
  { w: THICK, d: THICK },
  HEIGHT,
  cornerPostPrisms(THICK, HEIGHT),
  { face: 'plain' },
)
for (const entry of LONGS) {
  add(entry.id, entry.label, ['wall', 'starship', 'straight', 'thick32', ...entry.tags], { w: RUN_LONG, d: THICK }, HEIGHT, straightPrisms(RUN_LONG, THICK, HEIGHT), {
    face: entry.face,
  })
}

// Structural joins / openings (interior plain bulkhead look).
add(
  'tplStarshipWall32Tee',
  'Bulkhead Tee 32',
  ['wall', 'starship', 'tee', 'thick32', 'plain', 'plainBulkhead'],
  { w: RUN, d: RUN },
  HEIGHT,
  teePrisms(RUN, THICK, HEIGHT),
  { face: 'plain' },
)
add(
  'tplStarshipWall32Cross',
  'Bulkhead Cross 32',
  ['wall', 'starship', 'cross', 'thick32', 'plain', 'plainBulkhead'],
  { w: RUN, d: RUN },
  HEIGHT,
  crossPrisms(RUN, THICK, HEIGHT),
  { face: 'plain' },
)
add(
  'tplStarshipWall32Alcove',
  'Bulkhead Alcove 32',
  ['wall', 'starship', 'alcove', 'thick32', 'plain', 'plainBulkhead'],
  { w: 48, d: 40 },
  HEIGHT,
  alcovePrisms(48, THICK, 40, HEIGHT),
  { face: 'plain' },
)
add(
  'tplStarshipDoorFrame',
  'Door Frame 32',
  ['wall', 'starship', 'door', 'thick32', 'plain', 'plainBulkhead'],
  { w: RUN, d: THICK },
  HEIGHT,
  doorFramePrisms(RUN, THICK, HEIGHT, 32),
  { face: 'plain' },
)

// --- Exterior hull ---
add(
  'tplStarshipHull32',
  'Exterior Hull 32',
  ['wall', 'starship', 'hull', 'exterior', 'straight', 'thick32'],
  { w: RUN, d: THICK },
  HEIGHT,
  straightPrisms(RUN, THICK, HEIGHT),
  { face: 'hull' },
)
add(
  'tplStarshipHull32Long',
  'Exterior Hull (Long) 32',
  ['wall', 'starship', 'hull', 'exterior', 'straight', 'thick32', 'long'],
  { w: RUN_LONG, d: THICK },
  HEIGHT,
  straightPrisms(RUN_LONG, THICK, HEIGHT),
  { face: 'hull' },
)
add(
  'tplStarshipHull32Corner',
  'Exterior Hull Corner 32',
  ['wall', 'starship', 'hull', 'exterior', 'corner', 'thick32'],
  { w: THICK, d: THICK },
  HEIGHT,
  cornerPostPrisms(THICK, HEIGHT),
  { face: 'hull' },
)
add(
  'tplStarshipHullViewport',
  'Hull Viewport 32',
  ['wall', 'starship', 'hull', 'exterior', 'viewport', 'straight', 'thick32'],
  { w: RUN, d: THICK },
  HEIGHT,
  straightPrisms(RUN, THICK, HEIGHT),
  { face: 'viewport' },
)
add(
  'tplStarshipHullViewportLong',
  'Hull Viewport (Long) 32',
  ['wall', 'starship', 'hull', 'exterior', 'viewport', 'straight', 'thick32', 'long'],
  { w: RUN_LONG, d: THICK },
  HEIGHT,
  straightPrisms(RUN_LONG, THICK, HEIGHT),
  { face: 'viewport' },
)
add(
  'tplStarshipDockCollar',
  'Docking Collar',
  ['wall', 'starship', 'hull', 'exterior', 'dock', 'thick32'],
  { w: RUN, d: THICK + 16 },
  HEIGHT,
  dockCollarPrisms(RUN, THICK, HEIGHT),
  { face: 'dock' },
)

// --- Half bulkheads (⅛ tile thick, same as tiles.json halfBulkhead) ---
add(
  'tplStarshipHalfBulkhead',
  'Half Bulkhead',
  ['wall', 'starship', 'straight', 'halfBulkhead', 'thick8'],
  { w: RUN, d: HALF_THICK },
  HEIGHT,
  straightPrisms(RUN, HALF_THICK, HEIGHT),
  { face: 'plain' },
)
add(
  'tplStarshipHalfBulkheadCorner',
  'Half Bulkhead Corner',
  ['wall', 'starship', 'corner', 'halfBulkhead', 'thick8'],
  { w: RUN, d: RUN },
  HEIGHT,
  cornerPrisms(RUN, HALF_THICK, HEIGHT),
  { face: 'plain' },
)

// --- Floors ---
add('tplStarshipFloor', 'Deck Plating', ['floor', 'starship', 'floor'], { w: RUN, d: RUN }, FLOOR_H, slabPrisms(RUN, RUN, FLOOR_H), {
  material: 'floor',
})
add('tplStarshipDoorway', 'Doorway', ['floor', 'starship', 'doorway'], { w: RUN, d: RUN }, FLOOR_H, slabPrisms(RUN, RUN, FLOOR_H), {
  material: 'doorway',
})
add('tplStarshipGrating', 'EPS Grating', ['floor', 'starship', 'grating'], { w: RUN, d: RUN }, FLOOR_H, slabPrisms(RUN, RUN, FLOOR_H), {
  material: 'grating',
})

// Bigger floors + surface variants (UV pattern spans the whole slab).
const BIG_DECKS = [
  { id: 'tplStarshipFloor128', label: 'Deck Plating 128', w: 128, d: 128 },
  { id: 'tplStarshipFloor128x64', label: 'Deck Plating 128×64', w: 128, d: 64 },
  { id: 'tplStarshipFloor192x128', label: 'Deck Plating 192×128', w: 192, d: 128 },
  { id: 'tplStarshipFloor192x64', label: 'Deck Plating 192×64', w: 192, d: 64 },
  { id: 'tplStarshipFloor256', label: 'Deck Plating 256', w: 256, d: 256 },
]
for (const entry of BIG_DECKS) {
  add(entry.id, entry.label, ['floor', 'starship', 'floor', 'large'], { w: entry.w, d: entry.d }, FLOOR_H, slabPrisms(entry.w, entry.d, FLOOR_H), {
    material: 'floor',
  })
}
add(
  'tplStarshipFloorCorridor128',
  'Corridor Deck 128',
  ['floor', 'starship', 'floor', 'corridor', 'large'],
  { w: 128, d: 128 },
  FLOOR_H,
  slabPrisms(128, 128, FLOOR_H),
  { material: 'floorCorridor' },
)
add(
  'tplStarshipFloorCorridor128x64',
  'Corridor Deck 128×64',
  ['floor', 'starship', 'floor', 'corridor', 'large'],
  { w: 128, d: 64 },
  FLOOR_H,
  slabPrisms(128, 64, FLOOR_H),
  { material: 'floorCorridor' },
)
add(
  'tplStarshipFloorCorridor192x128',
  'Corridor Deck 192×128',
  ['floor', 'starship', 'floor', 'corridor', 'large'],
  { w: 192, d: 128 },
  FLOOR_H,
  slabPrisms(192, 128, FLOOR_H),
  { material: 'floorCorridor' },
)
add(
  'tplStarshipFloorCargo128',
  'Cargo Deck 128',
  ['floor', 'starship', 'floor', 'cargo', 'large'],
  { w: 128, d: 128 },
  FLOOR_H,
  slabPrisms(128, 128, FLOOR_H),
  { material: 'floorCargo' },
)
add(
  'tplStarshipFloorCargo128x64',
  'Cargo Deck 128×64',
  ['floor', 'starship', 'floor', 'cargo', 'large'],
  { w: 128, d: 64 },
  FLOOR_H,
  slabPrisms(128, 64, FLOOR_H),
  { material: 'floorCargo' },
)
add(
  'tplStarshipFloorCarpet128',
  'Carpet 128',
  ['floor', 'starship', 'floor', 'carpet', 'large'],
  { w: 128, d: 128 },
  FLOOR_H,
  slabPrisms(128, 128, FLOOR_H),
  { material: 'floorCarpet' },
)
add(
  'tplStarshipFloorCarpet192x128',
  'Carpet 192×128',
  ['floor', 'starship', 'floor', 'carpet', 'large'],
  { w: 192, d: 128 },
  FLOOR_H,
  slabPrisms(192, 128, FLOOR_H),
  { material: 'floorCarpet' },
)
add(
  'tplStarshipFloorSickbay128',
  'Sickbay Deck 128',
  ['floor', 'starship', 'floor', 'sickbay', 'large'],
  { w: 128, d: 128 },
  FLOOR_H,
  slabPrisms(128, 128, FLOOR_H),
  { material: 'floorSickbay' },
)
add(
  'tplStarshipGrating128',
  'EPS Grating 128',
  ['floor', 'starship', 'grating', 'large'],
  { w: 128, d: 128 },
  FLOOR_H,
  slabPrisms(128, 128, FLOOR_H),
  { material: 'grating' },
)
add(
  'tplStarshipGrating128x64',
  'EPS Grating 128×64',
  ['floor', 'starship', 'grating', 'large'],
  { w: 128, d: 64 },
  FLOOR_H,
  slabPrisms(128, 64, FLOOR_H),
  { material: 'grating' },
)
add(
  'tplStarshipDoorway128x64',
  'Doorway 128×64',
  ['floor', 'starship', 'doorway', 'large'],
  { w: 128, d: 64 },
  FLOOR_H,
  slabPrisms(128, 64, FLOOR_H),
  { material: 'doorway' },
)

// --- Props / machinery / pillars ---
add('tplStarshipMachinery', 'Machinery', ['prop', 'starship', 'machinery'], { w: RUN, d: RUN }, 40, slabPrisms(RUN, RUN, 40), {
  material: 'machinery',
})
add(
  'tplStarshipMachineryTall',
  'Machinery (Tall)',
  ['prop', 'starship', 'machinery', 'tall'],
  { w: RUN, d: RUN },
  64,
  slabPrisms(RUN, RUN, 64),
  { material: 'machinery' },
)
add(
  'tplStarshipMachineryWide',
  'Machinery (Wide)',
  ['prop', 'starship', 'machinery', 'long'],
  { w: RUN_LONG, d: RUN },
  40,
  slabPrisms(RUN_LONG, RUN, 40),
  { material: 'machinery' },
)
add(
  'tplStarshipPillar32',
  'Support Pillar 32',
  ['prop', 'starship', 'machinery', 'pillar'],
  { w: THICK, d: THICK },
  HEIGHT,
  pillarPrisms(THICK, HEIGHT),
  { material: 'pillar' },
)
add(
  'tplStarshipPillar16',
  'Support Pillar 16',
  ['prop', 'starship', 'machinery', 'pillar'],
  { w: 16, d: 16 },
  HEIGHT,
  pillarPrisms(16, HEIGHT),
  { material: 'pillar' },
)
add(
  'tplStarshipWarpCoil',
  'Warp Coil Stub',
  ['prop', 'starship', 'machinery', 'warpCoil'],
  { w: 48, d: 48 },
  52,
  warpCoilPrisms(),
  { material: 'warpCoil' },
)
add(
  'tplStarshipPipeRiser',
  'Pipe Riser',
  ['prop', 'starship', 'machinery', 'pipeRiser'],
  { w: 28, d: 28 },
  80,
  pipeRiserPrisms(),
  { material: 'pipeRiser' },
)
add(
  'tplStarshipJunctionBox',
  'Junction Box',
  ['prop', 'starship', 'machinery', 'junctionBox'],
  { w: 32, d: 20 },
  28,
  junctionBoxPrisms(),
  { material: 'junctionBox' },
)
add('tplStarshipCrate', 'Crate / Low Console', ['prop', 'starship', 'crate'], { w: RUN, d: RUN }, 16, slabPrisms(RUN, RUN, 16), {
  material: 'crate',
})
add('tplStarshipEpsControl', 'EPS Conduit Control', ['prop', 'starship', 'epsControl'], { w: RUN, d: RUN }, 22, slabPrisms(RUN, RUN, 22), {
  material: 'epsControl',
})

// --- Furniture & consoles ---
add('tplStarshipChair', 'Ops Chair', ['prop', 'starship', 'furniture', 'chair'], { w: 36, d: 42 }, 12, chairPrisms(), {
  material: 'chair',
})
add('tplStarshipStool', 'Stool', ['prop', 'starship', 'furniture', 'stool'], { w: 28, d: 28 }, 16, stoolPrisms(), {
  material: 'stool',
})
add('tplStarshipBench', 'Bench', ['prop', 'starship', 'furniture', 'bench'], { w: 60, d: 24 }, 12, benchPrisms(), {
  material: 'bench',
})
add('tplStarshipBenchLong', 'Bench (Long)', ['prop', 'starship', 'furniture', 'bench', 'long'], { w: 96, d: 24 }, 12, benchLongPrisms(), {
  material: 'bench',
})
add('tplStarshipTable', 'Table', ['prop', 'starship', 'furniture', 'table'], { w: 56, d: 56 }, 16, tablePrisms(), {
  material: 'table',
})
add('tplStarshipBed', 'Biobed', ['prop', 'starship', 'furniture', 'bed'], { w: 56, d: 56 }, 12, bedPrisms(), {
  material: 'bed',
})
add('tplStarshipConsole', 'Console', ['prop', 'starship', 'furniture', 'console'], { w: 60, d: 50 }, 18, consolePrisms(), {
  material: 'console',
})
add(
  'tplStarshipConsoleWide',
  'Console (Wide)',
  ['prop', 'starship', 'furniture', 'console', 'long'],
  { w: 96, d: 52 },
  18,
  consoleWidePrisms(),
  { material: 'console' },
)
add(
  'tplStarshipWallConsole',
  'Wall Console',
  ['prop', 'starship', 'furniture', 'console', 'wall'],
  { w: 60, d: 36 },
  18,
  wallConsolePrisms(),
  { material: 'console' },
)
add('tplStarshipLocker', 'Locker', ['prop', 'starship', 'furniture', 'locker'], { w: 32, d: 32 }, 52, lockerPrisms(), {
  material: 'locker',
})
add(
  'tplStarshipLockerWide',
  'Locker (Wide)',
  ['prop', 'starship', 'furniture', 'locker', 'long'],
  { w: 56, d: 32 },
  52,
  lockerWidePrisms(),
  { material: 'locker' },
)
add('tplStarshipShelf', 'Shelf', ['prop', 'starship', 'furniture', 'shelf'], { w: 56, d: 48 }, 37, shelfPrisms(), {
  material: 'shelf',
})

fs.mkdirSync(outDir, { recursive: true })
// Only clear Starship template PNGs — Dimension Kit (tplDim*) shares this folder.
for (const name of fs.readdirSync(outDir)) {
  if (name.endsWith('.png') && name.startsWith('tplStarship')) fs.unlinkSync(path.join(outDir, name))
}
for (const { name, png } of pngFiles) {
  fs.writeFileSync(path.join(outDir, name), png)
}
for (const entry of pieces) {
  console.log(`${entry.id} ${entry.size.width}×${entry.size.height} anchorX=${entry.anchorX} (+r90/180/270)`)
}

// Keep Dimension Kit entries (tplDim*) — this bake only replaces Starship pieces.
const prior = fs.existsSync(cataloguePath) ? JSON.parse(fs.readFileSync(cataloguePath, 'utf8')) : { pieces: [] }
const dimension = (prior.pieces ?? []).filter(
  (entry) => (entry.tags ?? []).includes('dimension') || String(entry.id).startsWith('tplDim'),
)
const notes = [
  'Starship Template Pieces: overlay duplicate of the Starship & Station palette (walls, floors, half bulkheads, props, furniture).',
  'Overlays only — sit on deck underlay; do not replace ground tiles. Pathing/sight use the underlay.',
  'Does not change Generate Map, makeTilesV2, or halfWalls generation.',
  'Walls 32 thick (64 / 128 run); corner post is 32×32; half bulkheads 8 thick (L-corners 64×64); floors 64×64 slabs; props + furniture/consoles (multi-prism).',
  'Tips snap to the editor guide grid. Paste overwrites the same tip or the sprite under the pointer.',
  'R yaws 90° around the vertical through the south tip (isometric floor). Art is re-projected per yaw (orients); not a screen-space spin.',
  'Fitting / prop / console / biobed pieces include animation.overlay emission frames (blink). Art via scripts/makeTemplatePieces.mjs',
  'cover / fade match counterpart Starship tiles; animation.emissive / emitColour match wall overlay Properties (saved via /__templates).',
]
if (dimension.length) {
  notes.push(
    'Dimension Kit (tplDim*): solid-but-lit AA size/footprint tests. Separate from Starship templates and Calibration tiles. Art via scripts/makeDimensionKit.mjs.',
  )
}
fs.writeFileSync(cataloguePath, `${JSON.stringify({ notes, pieces: [...pieces, ...dimension] }, null, 2)}\n`)
console.log(`Wrote ${pieces.length} Starship template pieces (${pngFiles.length} PNGs); kept ${dimension.length} Dimension entries`)
