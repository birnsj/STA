// v2 art for the starship bridge tiles (TOS-inspired): a charcoal-and-warm-grey station ring with framed displays, the
// main viewscreen, turbolift doors, a maroon command well, the captain's chair, helm and stations, and a red railing
// that joins up (maps/railJoins.js). Same renderer and size as the other v2 art (engine.mjs, 256 x 384), written to
// the Bridge (TOS) palette-group folder (engine.mjs outFile).
//
// Run with: node scripts/makeTilesBridge.mjs [--force] [--sheet]
//   existing files are kept unless --force; --sheet also writes .tmp-sheet.png (a contact sheet) for checking.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'
import { blockScene, FORCE, floorScene, hash, OUT, OUT_H, OUT_W, render, rgb, scale, WALL_STRETCH } from './v2/engine.mjs'
import { box, capsule, cylinder, objectScene, sphere, tileNoise, faceNoise, writeSheet } from './v2/kit.mjs'
import { builtWall } from './v2/walls.mjs'
import { glow, matte, metal } from './v2/objects.mjs'

const hex = rgb
const C = 16
const mod = (x, n) => ((x % n) + n) % n
const part = (sdf, mat) => ({ sdf, mat })
const WALL_H = 32

// Console lights: a few small lit buttons in rows, most of them dark, in TOS colours.
const LIGHTS = ['#ff4a3a', '#ffc040', '#4aa8ff', '#5ae07a', '#ffffff'].map(hex)
function buttonAt(a, b, cell, seed, lit = 0.4) {
  const i = Math.floor(a / cell)
  const j = Math.floor(b / cell)
  const inCell = Math.max(Math.abs(mod(a, cell) - cell / 2), Math.abs(mod(b, cell) - cell / 2)) < cell * 0.3
  if (!inCell) return null
  if (hash(i, j, seed + 3) > lit) return { albedo: hex('#18181c'), spec: 0.5, shininess: 50 }
  const colour = LIGHTS[Math.floor(hash(i, j, seed) * LIGHTS.length)]
  return { albedo: colour, emit: scale(colour, 0.75), tag: 'lights' }
}

// ---------- floors ----------
// Fine carpet: a soft weave with a little colour drift, no bump.
const carpet = ({ colour, seed, alt = false }) => ({
  height: () => 0,
  surface(u, v) {
    const weave = (tileNoise(u * 4, v * 4, 32, seed) - 0.5) * 0.08
    const drift = (tileNoise(u, v, 4, seed + (alt ? 9 : 1)) - 0.5) * 0.1
    return { albedo: scale(colour, 1 + weave + drift), spec: 0.05, shininess: 8 }
  },
})
const deck = (alt) => carpet({ colour: hex('#3c3b41'), seed: 71, alt })
const well = (alt) => carpet({ colour: hex('#5a1e26'), seed: 72, alt })

// ---------- walls ----------
const CHARCOAL = hex('#26262b')
const WARM_GREY = hex('#8e887c')
const FRAME = hex('#5c5850')
// A display's graphic at (x, y) in 0..1 across the screen: bars, a sweep, a waveform or a grid, in one muted colour.
const SCREEN_HUES = ['#5ab0ff', '#ffb24a', '#6ee08a', '#ff6a5a'].map(hex)
function display(x, y, slot) {
  const hue = SCREEN_HUES[slot % SCREEN_HUES.length]
  const kind = slot % 4
  let on = false
  if (kind === 0) on = mod(x * 7, 1) < 0.6 && y < 0.2 + hash(Math.floor(x * 7), slot, 5) * 0.7
  if (kind === 1) {
    const r = Math.hypot(x - 0.5, (y - 0.5) * 0.8)
    on = Math.abs(r - 0.32) < 0.025 || Math.abs(r - 0.16) < 0.02 || (r < 0.32 && Math.abs(Math.atan2(y - 0.5, x - 0.5) - 0.7) < 0.12)
  }
  if (kind === 2) on = Math.abs(y - 0.5 - Math.sin(x * 14 + slot) * 0.22 * Math.sin(x * 3)) < 0.05
  if (kind === 3) on = (mod(x * 5, 1) < 0.08 || mod(y * 3, 1) < 0.1) && hash(Math.floor(x * 5), Math.floor(y * 3), slot) > 0.3
  return on ? { albedo: hue, emit: scale(hue, 0.7), tag: 'glow' } : { albedo: hex('#05080c'), emit: scale(hue, 0.05), spec: 0.9, shininess: 90 }
}
// Station wall: a dark console base, a band of framed displays (two per face), a warm grey bulkhead above.
const stationBand = () => (H) => {
  const band = [H * 0.42, H * 0.74]
  const inScreen = (u, v) => v > band[0] + 1.2 && v < band[1] - 1.2 && mod(u, 16) > 1.6 && mod(u, 16) < 14.4
  return {
    height(u, v, face) {
      if (face === 'top') return null
      if (inScreen(u, v)) return -0.7
      if (v > band[0] && v < band[1]) return 0.2
      return null
    },
    surface(u, v, face) {
      if (face === 'top') return { albedo: CHARCOAL, spec: 0.3, shininess: 30 }
      const slot = Math.floor(u / 16) + (face === 'left' ? 0 : 2)
      if (inScreen(u, v)) return display((mod(u, 16) - 1.6) / 12.8, (v - band[0] - 1.2) / (band[1] - band[0] - 2.4), slot)
      if (v > band[0] && v < band[1]) return { albedo: FRAME, spec: 0.3, shininess: 26 }
      if (v > band[0] - 4 && v <= band[0]) return buttonAt(u, v - band[0], 2, slot + 11, 0.35) ?? { albedo: hex('#1c1c20'), spec: 0.4, shininess: 30 }
      if (v < band[0]) return { albedo: scale(CHARCOAL, 0.95 + faceNoise(u, v, 8, 4) * 0.08), spec: 0.3, shininess: 30 }
      if (v > H - 3) return { albedo: scale(CHARCOAL, 0.8), spec: 0.3, shininess: 30 }
      if (Math.abs(v - (band[1] + H - 3) / 2) < 0.5) return { albedo: scale(WARM_GREY, 0.7) }
      return { albedo: scale(WARM_GREY, 0.96 + faceNoise(u, v, 8, 5) * 0.06), spec: 0.15, shininess: 18 }
    },
  }
}
const stationWall = builtWall({ kind: 'panels', colour: WARM_GREY, trim: CHARCOAL, dark: CHARCOAL, gloss: 0.2, seed: 81, extra: stationBand() })

// Main viewscreen: one big screen of stars and a faint nebula across the run (the face wraps, so neighbours join).
const viewscreen = () => (H) => {
  const inScreen = (u, v) => v > H * 0.2 && v < H * 0.86
  return {
    height(u, v, face) {
      if (face === 'top') return null
      return inScreen(u, v) ? -0.9 : null
    },
    surface(u, v, face) {
      if (face === 'top') return { albedo: CHARCOAL, spec: 0.3, shininess: 30 }
      if (!inScreen(u, v)) return v < H * 0.2 ? { albedo: CHARCOAL, spec: 0.3, shininess: 30 } : { albedo: FRAME, spec: 0.3, shininess: 26 }
      const w = face === 'left' ? u : u + 32
      if (hash(Math.floor(w * 1.4), Math.floor(v * 1.4), 9) > 0.986) return { albedo: hex('#ffffff'), emit: hex('#dde8ff'), tag: 'glow' }
      const nebula = Math.max(0, faceNoise(u, v, 2, 31) - 0.45) * faceNoise(u, v, 4, 32)
      const colour = scale(hex('#3050a0'), nebula * 0.6)
      return { albedo: hex('#02040a'), emit: colour, spec: 0.9, shininess: 90, tag: 'glow' }
    },
  }
}
const viewscreenWall = builtWall({ kind: 'panels', colour: FRAME, trim: CHARCOAL, dark: CHARCOAL, gloss: 0.2, seed: 82, extra: viewscreen() })

// Turbolift: muted red double doors with a centre split in a grey frame, a small light above.
const liftDoors = () => (H) => ({
  height(u, v, face) {
    if (face === 'top') return null
    if (u > 6 && u < 26 && v < H * 0.78) return Math.abs(u - 16) < 0.3 ? -0.6 : 0.4
    return null
  },
  surface(u, v, face) {
    if (face === 'top') return { albedo: CHARCOAL, spec: 0.3, shininess: 30 }
    if (u > 6 && u < 26 && v < H * 0.78) {
      if (Math.abs(u - 16) < 0.3) return { albedo: hex('#1a0806') }
      return { albedo: scale(hex('#a83a2c'), 0.88 + (v / H) * 0.2), spec: 0.35, shininess: 30 }
    }
    if (u > 13 && u < 19 && Math.abs(v - H * 0.86) < 1.2) return { albedo: hex('#ffe0a0'), emit: hex('#ffd080'), tag: 'lights' }
    return { albedo: v < H * 0.1 ? CHARCOAL : WARM_GREY, spec: 0.15, shininess: 18 }
  },
})
const turboliftWall = builtWall({ kind: 'panels', colour: WARM_GREY, trim: CHARCOAL, dark: CHARCOAL, gloss: 0.2, seed: 83, extra: liftDoors() })

// Hull: the plain outside of the bridge ring (the near walls show their outer faces).
const hullWall = builtWall({ kind: 'panels', colour: hex('#4a4a50'), trim: CHARCOAL, dark: CHARCOAL, across: 2, gloss: 0.25, seed: 84 })

// ---------- objects ----------
const black = matte(hex('#1a1a1e'), { spec: 0.35, shininess: 34, vary: 0.06 })
const steel = metal(hex('#8a8c92'), { grime: 0.04 })
const consoleBody = metal(hex('#2c2c32'), { spec: 0.35, grime: 0.04 })
const panelTop = (seed, lit) => (p, n) => (n[2] > 0.55 ? (buttonAt(p[0], p[1], 2.4, seed, lit) ?? { albedo: hex('#3a3a40'), spec: 0.4, shininess: 34 }) : consoleBody(p, n))
// A console's display on the faces facing(n): the wall displays' graphics, at (a, b) across it in 0..1.
const screenFace = (slot, facing, at) => (p, n) => (facing(n) ? display(...at(p), slot) : consoleBody(p, n))
const stool = (x, y) => [
  part((p) => Math.min(cylinder(p, x, y, 1, 0, 8, 0.3), cylinder(p, x, y, 3.2, 0, 0.8, 0.3)), steel),
  part((p) => cylinder(p, x, y, 4, 8, 10, 1), black),
]

// Captain's chair facing -y (rotated: facing -x): a black seat on a pedestal, a tall back, arms with button pads.
function captainsChair() {
  return objectScene({
    ground: well(false),
    top: 28,
    parts: [
      part((p) => Math.min(cylinder(p, C, C + 1, 3.4, 0, 9, 0.5), cylinder(p, C, C + 1, 7.5, 0, 1.4, 0.5)), steel),
      part((p) => Math.min(box(p, [C, C, 11], [8.5, 8, 2.2], 1.6), box(p, [C, C + 7.2, 19], [8.5, 1.8, 9], 1.6)), black),
      part(
        (p) => Math.min(box(p, [C - 9.6, C - 1, 15], [1.8, 7, 1.6], 0.6), box(p, [C + 9.6, C - 1, 15], [1.8, 7, 1.6], 0.6)),
        (p, n) => (n[2] > 0.6 && p[1] < C + 2 ? (buttonAt(p[0] + 0.5, p[1], 1.8, 21, 0.8) ?? { albedo: hex('#2a2a2e') }) : black(p, n)),
      ),
    ],
  })
}

// Helm: a console running along x (neighbours join into one), its sloped button panel facing +y, a small amber
// readout and the crew seat on the +y side.
function helmConsole() {
  return objectScene({
    ground: well(false),
    top: 22,
    parts: [
      part((p) => Math.max(box(p, [C, C - 2, 6.5], [16, 6, 6.5], 0.8), p[2] - 13 + (p[1] - (C - 2)) * 0.45), panelTop(31, 0.45)),
      part((p) => box(p, [C, C - 7, 15.5], [5, 1.2, 3], 0.5), screenFace(1, (n) => n[1] > 0.5, (p) => [(p[0] - C + 4.5) / 9, (p[2] - 13) / 5])),
      ...stool(C, C + 9),
    ],
  })
}

// A bridge station against the wall on its -x side (rotated: -y): a desk running the tile's length (neighbours join),
// a display board behind it and a seat in front.
function stationConsole({ seed, slot, hood = false }) {
  const parts = [
    part((p) => Math.max(box(p, [C - 10, C, 7], [6, 16, 7], 0.8), p[2] - 14 + (p[0] - (C - 10)) * 0.4), panelTop(seed, 0.4)),
    part((p) => box(p, [C - 14.5, C, 20], [1.4, 12, 6], 0.6), screenFace(slot, (n) => n[0] > 0.5, (p) => [(C + 11 - p[1]) / 22, (p[2] - 15) / 10])),
    ...stool(C + 5, C),
  ]
  if (hood) {
    parts.push(
      part((p) => Math.max(box(p, [C - 9, C + 6, 18], [3.6, 3.6, 4.5], 1.2), -box(p, [C - 5.4, C + 6, 18], [1.4, 2.2, 2.6], 0.4)), consoleBody),
      part((p) => sphere(p, [C - 7.4, C + 6, 18], 1.8), glow(hex('#5ad0ff'), 1.2)),
    )
  }
  return objectScene({ ground: deck(false), top: 28, parts })
}

// Red padded railing on a low charcoal divider. Plain (unjoined) piece: along x (rotated: along y).
const RAIL_DIRECTIONS = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] }
const segment2d = (p, a, b) => {
  const [abx, aby] = [b[0] - a[0], b[1] - a[1]]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (abx * abx + aby * aby)))
  return Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t)
}
// ends: where the rail runs from the tile centre to (each joined edge or corner, just past it so neighbours overlap).
function railing(ends) {
  const divider = (p) => Math.min(...ends.map((end) => Math.max(segment2d(p, [C, C], end) - 1, Math.abs(p[2] - 4) - 3.7) - 0.3))
  const posts = (p) => Math.min(...ends.map((end) => cylinder(p, (C + end[0]) / 2, (C + end[1]) / 2, 0.7, 7, 11)))
  const rail = (p) => Math.min(...ends.map((end) => capsule(p, [C, C, 12], [end[0], end[1], 12], 1.9)))
  return objectScene({
    ground: deck(false),
    top: 16,
    parts: [part(divider, metal(CHARCOAL, { spec: 0.4, grime: 0.04 })), part(posts, steel), part(rail, matte(hex('#b8302a'), { spec: 0.45, shininess: 36, vary: 0.06 }))],
  })
}
const endTowards = (d) => [C + RAIL_DIRECTIONS[d][0] * 17, C + RAIL_DIRECTIONS[d][1] * 17]
const railJoins = () => {
  const names = Object.keys(RAIL_DIRECTIONS)
  const sets = names.map((a) => [a])
  names.forEach((a, i) => names.slice(i + 1).forEach((b) => sets.push([a, b])))
  return sets.map((set) => [`tosRail-${set.join('-')}.png`, object(() => railing(set.map(endTowards)))])
}

// ---------- jobs ----------
const wall = (material) => () => render(blockScene(WALL_H, material(WALL_H * WALL_STRETCH), WALL_STRETCH))
const lowWall = (material, h) => () => render(blockScene(h, material(h)))
const object = (scene) => () => render(scene(), { subsamples: 2 })
const walls = (name, material) => [
  [`${name}.png`, wall(material)],
  [`${name}-mid.png`, lowWall(material, 16)],
  [`${name}-low.png`, lowWall(material, 7)],
]
const JOBS = [
  ['tosVoid.png', () => new Uint8Array(OUT_W * OUT_H * 4)],
  ['tosDeck.png', () => render(floorScene(deck(false)))],
  ['tosDeck-alt.png', () => render(floorScene(deck(true)))],
  ['tosWell.png', () => render(floorScene(well(false)))],
  ['tosWell-alt.png', () => render(floorScene(well(true)))],
  ...walls('tosWall', stationWall),
  ...walls('tosViewscreen', viewscreenWall),
  ...walls('tosTurbolift', turboliftWall),
  ...walls('tosHull', hullWall),
  ['tosChair.png', object(captainsChair)],
  ['tosHelm.png', object(helmConsole)],
  ['tosStation.png', object(() => stationConsole({ seed: 41, slot: 0 }))],
  ['tosScience.png', object(() => stationConsole({ seed: 51, slot: 1, hood: true }))],
  ['tosRail.png', object(() => railing([endTowards('W'), endTowards('E')]))],
  ...railJoins(),
]

const sheet = process.argv.includes('--sheet')
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7).split(',')
const rendered = []
for (const [file, draw] of JOBS) {
  if (only && !only.some((prefix) => file.startsWith(prefix))) continue
  const target = path.join(OUT, file)
  if (fs.existsSync(target) && !FORCE) {
    console.log(`kept   ${file} (already exists)`)
    continue
  }
  const bytes = draw()
  fs.writeFileSync(target, encodePng(OUT_W, OUT_H, bytes))
  rendered.push({ id: file, bytes })
  console.log(`wrote  ${file}`)
}
if (sheet && rendered.length) writeSheet(fileURLToPath(new URL('../.tmp-sheet.png', import.meta.url)), rendered)
