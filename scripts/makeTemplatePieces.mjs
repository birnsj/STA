// Starship Template Pieces — overlay duplicate of the Starship & Station palette (walls, floors, half bulkheads, props).
// Not map tiles; does not change Generate Map / makeTilesV2 / halfWalls generation.
// Usage: node scripts/makeTemplatePieces.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { paintPrismsAA } from './v2/templateDraw.mjs'

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

function cornerPrisms(thick, height) {
  return [box(-thick - SEAM, -thick - SEAM, 0, 0, 0, height)]
}

// Half-bulkhead corner: L of thin arms (not a solid square).
function halfCornerPrisms(run, thick, height) {
  return [
    box(-run - SEAM, -thick, 0, 0, 0, height),
    box(-thick, -run - SEAM, 0, 0, 0, height),
  ]
}

function slabPrisms(w, d, height) {
  return [box(-w, -d, 0, 0, 0, height)]
}

const pieces = []

function add(id, label, tags, footprint, height, prisms, { face = 'plain', material = null } = {}) {
  const painted = paintPrismsAA(prisms, { face, material })
  pieces.push({
    entry: {
      id,
      label,
      href: `/art/sprites/environment/templates/${id}.png`,
      size: { width: painted.size.w, height: painted.size.h },
      anchorX: painted.size.anchorX,
      tags,
      footprint: { width: footprint.w, depth: footprint.d },
      height,
      ...(material ? { material } : { face }),
    },
    png: painted.png,
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
  cornerPrisms(THICK, HEIGHT),
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
  halfCornerPrisms(RUN, HALF_THICK, HEIGHT),
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
for (const { entry, png } of pieces) {
  fs.writeFileSync(path.join(outDir, `${entry.id}.png`), png)
  console.log(`${entry.id} ${entry.size.width}×${entry.size.height} anchorX=${entry.anchorX}`)
}

fs.writeFileSync(
  cataloguePath,
  `${JSON.stringify(
    {
      notes: [
        'Starship Template Pieces: overlay duplicate of the Starship & Station palette (walls, floors, half bulkheads, props).',
        'Overlays only — sit on deck underlay; do not replace ground tiles. Pathing/sight use the underlay.',
        'Does not change Generate Map, makeTilesV2, or halfWalls generation.',
        'Walls 32 thick (64 / 128 run); half bulkheads 8 thick; floors 64×64 slabs; props match tile heights.',
        'Tips snap to the editor guide grid. Paste overwrites the same tip or the sprite under the pointer. R rotates 90°. Art via scripts/makeTemplatePieces.mjs',
      ],
      pieces: pieces.map(({ entry }) => entry),
    },
    null,
    2,
  )}\n`,
)
console.log(`Wrote ${pieces.length} Starship template pieces`)
