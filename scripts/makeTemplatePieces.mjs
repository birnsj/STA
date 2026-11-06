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
}
const OVERLAY_MATERIAL = {
  machinery: { frameTime: 0.2, frames: [0, 0, 1, 1] },
  epsControl: { frameTime: 0.1, frames: [0, 1] },
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

function slabPrisms(w, d, height) {
  return [box(-w, -d, 0, 0, 0, height)]
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
}

function pieceFlags(tags, face, material) {
  const set = new Set(tags)
  if (set.has('floor')) return { cover: false, fade: false, emit: null }
  if (set.has('crate')) return { cover: true, fade: false, emit: null }
  if (set.has('machinery')) return { cover: true, fade: true, emit: GLOW.machinery }
  if (set.has('epsControl')) return { cover: true, fade: false, emit: GLOW.epsControl }
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

// --- Props ---
add('tplStarshipMachinery', 'Machinery', ['prop', 'starship', 'machinery'], { w: RUN, d: RUN }, 40, slabPrisms(RUN, RUN, 40), {
  material: 'machinery',
})
add('tplStarshipCrate', 'Crate / Low Console', ['prop', 'starship', 'crate'], { w: RUN, d: RUN }, 16, slabPrisms(RUN, RUN, 16), {
  material: 'crate',
})
add('tplStarshipEpsControl', 'EPS Conduit Control', ['prop', 'starship', 'epsControl'], { w: RUN, d: RUN }, 22, slabPrisms(RUN, RUN, 22), {
  material: 'epsControl',
})

fs.mkdirSync(outDir, { recursive: true })
for (const name of fs.readdirSync(outDir)) {
  if (name.endsWith('.png')) fs.unlinkSync(path.join(outDir, name))
}
for (const { name, png } of pngFiles) {
  fs.writeFileSync(path.join(outDir, name), png)
}
for (const entry of pieces) {
  console.log(`${entry.id} ${entry.size.width}×${entry.size.height} anchorX=${entry.anchorX} (+r90/180/270)`)
}

fs.writeFileSync(
  cataloguePath,
  `${JSON.stringify(
    {
      notes: [
        'Starship Template Pieces: overlay duplicate of the Starship & Station palette (walls, floors, half bulkheads, props).',
        'Overlays only — sit on deck underlay; do not replace ground tiles. Pathing/sight use the underlay.',
        'Does not change Generate Map, makeTilesV2, or halfWalls generation.',
        'Walls 32 thick (64 / 128 run); corner post is 32×32; half bulkheads 8 thick (L-corners 64×64); floors 64×64 slabs; props match tile heights.',
        'Tips snap to the editor guide grid. Paste overwrites the same tip or the sprite under the pointer.',
        'R yaws 90° around the vertical through the south tip (isometric floor). Art is re-projected per yaw (orients); not a screen-space spin.',
        'Fitting / prop pieces include animation.overlay emission frames (blink), drawn over the base like wall tile overlays. Art via scripts/makeTemplatePieces.mjs',
        'cover / fade match counterpart Starship tiles; animation.emissive / emitColour match wall overlay Properties (saved via /__templates).',
      ],
      pieces,
    },
    null,
    2,
  )}\n`,
)
console.log(`Wrote ${pieces.length} Starship template pieces (${pngFiles.length} PNGs)`)
