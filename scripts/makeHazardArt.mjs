// Placeholder art for destructible objects, hazards and explosions (designer decision, 2026-10-12: procedural PNGs).
// Run with: node scripts/makeHazardArt.mjs [--only=destructibles,hazards,explosions] [--force]
// Existing files are kept unless --force is passed, so art the designer has replaced is never overwritten.
//
// - Destructibles: one tile image per type and state (tiles.json ds* tiles, public/art/sprites/environment/destructibles/),
//   drawn with the v2 tile renderer (v2/engine.mjs, v2/kit.mjs objectScene) on a neutral deck plate.
// - Hazards: an 8-frame looping strip per hazard type (public/art/sprites/environment/hazards/{type}.png), each frame a
//   64 x 64 design window with the floor diamond along its bottom (components/maps/environmentArt.js HAZARD_FRAME).
// - Explosions: an 8-frame strip, small (128) and large (192) design frames (public/art/sprites/effects/).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'
import { bevel, clamp01, FORCE, hash, inside, mix, noise, outFile, renderTile, rgb, scale, smoothstep } from './v2/engine.mjs'
import { box, capsule, cone, cylinder, fbm3, noise3, objectScene, sphere } from './v2/kit.mjs'

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url))
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length).split(',') ?? null
const wanted = (group) => !only || only.includes(group)

function write(file, width, height, bytes) {
  if (fs.existsSync(file) && !FORCE) {
    console.log(`kept   ${path.relative(PUBLIC, file)}`)
    return
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, encodePng(width, height, bytes))
  console.log(`wrote  ${path.relative(PUBLIC, file)}`)
}

// ---------- destructible objects ----------
const C = 16
const hex = rgb
const part = (sdf, mat) => ({ sdf, mat })
const metal = (colour, { spec = 0.55, shininess = 40, seed = 2, grime = 0.15 } = {}) => (p) => ({
  albedo: scale(colour, 1 - grime + fbm3(p[0] * 0.3, p[1] * 0.3, p[2] * 0.3, seed) * grime * 1.6),
  spec,
  shininess,
})
const glow = (colour, strength = 1) => () => ({ albedo: colour, emit: scale(colour, strength), tag: 'lights' })
const stripes = (a, b, width = 2) => (p) => ({ albedo: Math.floor((p[0] + p[1] + p[2]) / width) % 2 === 0 ? a : b, spec: 0.3, shininess: 24 })

const deck = (scorched) => ({
  height: (u, v) => bevel(inside(u, v, 0, 0, 32, 32), 1.8, 1.4),
  surface(u, v) {
    let albedo = scale(hex('#59636b'), 0.88 + noise(u / 5, v / 5, 7) * 0.15)
    if (inside(u, v, 0, 0, 32, 32) < 1) albedo = scale(albedo, 0.5)
    if (scorched) albedo = scale(albedo, 0.35 + 0.65 * smoothstep(5, 15, Math.hypot(u - C, v - C) + (noise(u / 3, v / 3, 11) - 0.5) * 6))
    return { albedo, spec: 0.25, shininess: 24 }
  },
})

// The intact models, on the tile's 0..32 texels; heights match tiles.json.
const MODELS = {
  epsConduit: () => ({
    top: 30,
    parts: [
      part((p) => Math.min(box(p, [C - 9, C, 7], [2, 6, 7], 0.5), box(p, [C + 9, C, 7], [2, 6, 7], 0.5)), metal(hex('#5a646c'))),
      part((p) => Math.min(capsule(p, [C - 14, C - 3, 14], [C + 14, C - 3, 14], 3.2), capsule(p, [C - 14, C + 3, 14], [C + 14, C + 3, 14], 3.2)), metal(hex('#9aa4ac'), { spec: 0.6 })),
      part((p) => capsule(p, [C - 14, C, 22], [C + 14, C, 22], 3.4), (p) => (Math.abs(((p[0] % 8) + 8) % 8 - 4) < 0.8 ? glow(hex('#ff9a30'), 1.3)() : metal(hex('#8a949c'))(p))),
    ],
  }),
  plasmaJunction: () => ({
    top: 26,
    parts: [
      part((p) => box(p, [C, C, 8], [9, 9, 8], 1.2), metal(hex('#6c767e'))),
      part((p) => box(p, [C, C, 17], [7, 7, 1.2], 0.6), metal(hex('#a8b2ba'))),
      part((p) => cylinder(p, C, C, 4, 17, 25, 1), glow(hex('#5fc8ff'), 1.4)),
    ],
  }),
  gasCylinder: () => ({
    top: 32,
    parts: [
      part((p) => cylinder(p, C, C, 6.5, 0, 26, 2.5), (p) => (Math.abs(p[2] - 18) < 1.6 ? { albedo: hex('#f0c020'), spec: 0.5, shininess: 40 } : metal(hex('#c03a2a'), { spec: 0.6, grime: 0.08 })(p))),
      part((p) => cylinder(p, C, C, 2, 25, 30, 0.6), metal(hex('#b8c0c6'), { spec: 0.8 })),
      part((p) => capsule(p, [C - 3, C, 30], [C + 3, C, 30], 0.9), metal(hex('#30363a'))),
    ],
  }),
  chemicalContainer: () => ({
    top: 20,
    parts: [
      part((p) => box(p, [C, C, 9], [10, 7, 9], 1), (p) => (p[2] < 4 ? stripes(hex('#f0c020'), hex('#202020'))(p) : metal(hex('#4d7a3a'), { grime: 0.1 })(p))),
      part((p) => box(p, [C, C, 18.6], [10.5, 7.5, 0.8], 0.4), metal(hex('#8a949c'))),
      part((p) => box(p, [C + 10.4, C, 11], [0.3, 3, 3], 0.1), glow(hex('#a0ff60'), 0.9)),
    ],
  }),
  powerJunction: () => ({
    top: 26,
    parts: [
      part((p) => box(p, [C, C, 12], [8, 6, 12], 0.8), metal(hex('#7a7468'))),
      part((p) => box(p, [C + 8.2, C, 15], [0.4, 4, 6], 0.2), (p) => (Math.abs(p[1] - C - (p[2] - 15) * 0.5) < 0.9 ? glow(hex('#ffd040'), 1.2)() : { albedo: hex('#202428'), spec: 0.4 })),
      part((p) => Math.min(cylinder(p, C - 4, C, 1.2, 24, 27, 0.3), cylinder(p, C + 4, C, 1.2, 24, 27, 0.3)), metal(hex('#c08a40'), { spec: 0.8 })),
    ],
  }),
  forceFieldGenerator: () => ({
    top: 28,
    parts: [
      part((p) => cone(p, C, C, 0, 10, 16, 5), metal(hex('#5c6870'))),
      part((p) => cylinder(p, C, C, 5.5, 15, 18, 0.8), metal(hex('#a8b2ba'))),
      part((p) => sphere(p, [C, C, 23], 4.5), glow(hex('#60f0ff'), 1.1)),
    ],
  }),
  structuralSupport: () => ({
    top: 92,
    parts: [
      part((p) => box(p, [C, C, 46], [6, 6, 46], 1), metal(hex('#7d8790'), { grime: 0.2 })),
      part((p) => Math.min(box(p, [C, C, 3], [10, 10, 3], 1), box(p, [C, C, 89], [9, 9, 3], 1)), metal(hex('#5d666e'))),
      part((p) => Math.min(...[22, 46, 70].map((z) => box(p, [C, C, z], [7, 7, 1.2], 0.4))), metal(hex('#c0a040'), { spec: 0.6 })),
    ],
  }),
  atmosphericProcessor: () => ({
    top: 60,
    parts: [
      part((p) => box(p, [C, C, 28], [10, 9, 28], 1.4), (p) => (Math.abs(((p[2] % 5) + 5) % 5 - 2.5) < 0.5 && p[1] > C + 8 ? { albedo: hex('#1a1e22') } : metal(hex('#8e989e'))(p))),
      part((p) => cylinder(p, C, C, 6, 56, 59, 1), metal(hex('#5d666e'))),
      part((p) => box(p, [C + 10.2, C, 40], [0.4, 5, 1], 0.2), glow(hex('#50f0c0'), 1.2)),
    ],
  }),
}

// Damaged: scorch over every surface, a chunk blown out and sparks where it broke.
function damaged(model, seed) {
  const sparks = [0, 1, 2].map((i) => [C - 4 + hash(i, 1, seed) * 8, C - 4 + hash(i, 2, seed) * 8, model.top * (0.45 + hash(i, 3, seed) * 0.4)])
  const scorch = (mat) => (p, n) => {
    const s = mat(p, n)
    const burnt = smoothstep(0.5, 0.72, fbm3(p[0] * 0.25, p[1] * 0.25, p[2] * 0.25, seed))
    return s.emit ? { ...s, emit: scale(s.emit, 0.4) } : { ...s, albedo: mix(s.albedo, hex('#18140f'), burnt * 0.85) }
  }
  const bite = [C + 5, C + 5, model.top * 0.6]
  return {
    top: model.top,
    parts: [
      ...model.parts.map(({ sdf, mat }) => part((p) => Math.max(sdf(p), -sphere(p, bite, 4.5 + (noise3(p[0], p[1], p[2], seed) - 0.5) * 2)), scorch(mat))),
      ...sparks.map((at) => part((p) => sphere(p, at, 0.7), glow(hex('#fff0a0'), 2))),
    ],
  }
}

// Destroyed: a low heap of scorched fragments on a burnt deck.
function destroyed(seed) {
  const pieces = Array.from({ length: 7 }, (_, i) => ({
    c: [C - 9 + hash(i, 1, seed) * 18, C - 9 + hash(i, 2, seed) * 18, 1 + hash(i, 3, seed) * 1.5],
    h: [1.5 + hash(i, 4, seed) * 3, 1 + hash(i, 5, seed) * 2.5, 0.8 + hash(i, 6, seed) * 1.4],
  }))
  return {
    top: 6,
    parts: [part((p) => Math.min(...pieces.map(({ c, h }) => box(p, c, h, 0.3))) + (noise3(p[0] * 0.8, p[1] * 0.8, p[2] * 0.8, seed) - 0.5) * 0.6, (p) => ({ albedo: scale(hex('#2e2c2a'), 0.6 + noise3(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, seed) * 0.6), spec: 0.2 }))],
  }
}

function destructibleJobs() {
  const tiles = JSON.parse(fs.readFileSync(new URL('../src/data/adaptation/maps/tiles.json', import.meta.url), 'utf8')).tiles.filter((tile) => tile.role === 'destructible')
  return Object.keys(MODELS).flatMap((type, index) =>
    ['intact', 'damaged', 'destroyed'].map((state) => {
      const file = `${type}-${state}.png`
      const tile = tiles.find((entry) => entry.image.endsWith(`/${file}`))
      return {
        file: outFile(file),
        draw: () => {
          const model = state === 'destroyed' ? destroyed(31 + index) : state === 'damaged' ? damaged(MODELS[type](), 17 + index) : MODELS[type]()
          return renderTile(objectScene({ ground: deck(state !== 'intact'), ...model }), tile?.imageHeight ?? 96, { subsamples: 2 })
        },
      }
    }),
  )
}

// ---------- flipbooks ----------
const FRAMES = 8
const TAU = Math.PI * 2

// A strip of FRAMES frames, each frameW x frameH design pixels at res pixels per design pixel, 2 x 2 supersampled.
// pixel(x, y, t) -> [r, g, b, a] (0..1, straight alpha) in design pixels, t the loop or play position 0..1.
function strip(frameW, frameH, res, pixel) {
  const W = frameW * res * FRAMES
  const H = frameH * res
  const bytes = new Uint8Array(W * H * 4)
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FRAMES
    for (let oy = 0; oy < H; oy++) {
      for (let ox = 0; ox < frameW * res; ox++) {
        const acc = [0, 0, 0, 0]
        for (const [sx, sy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
          const [r, g, b, a] = pixel((ox + sx) / res, (oy + sy) / res, t)
          acc[0] += r * a
          acc[1] += g * a
          acc[2] += b * a
          acc[3] += a
        }
        const i = (oy * W + f * frameW * res + ox) * 4
        const a = acc[3] / 4
        if (a <= 0) continue
        for (let k = 0; k < 3; k++) bytes[i + k] = Math.round(clamp01(acc[k] / acc[3]) * 255)
        bytes[i + 3] = Math.round(clamp01(a) * 255)
      }
    }
  }
  return { width: W, height: H, bytes }
}

const over = (top, bottom) => {
  const a = top[3] + bottom[3] * (1 - top[3])
  if (a <= 0) return [0, 0, 0, 0]
  return [0, 1, 2].map((k) => (top[k] * top[3] + bottom[k] * bottom[3] * (1 - top[3])) / a).concat(a)
}
const NONE = [0, 0, 0, 0]

// ---------- hazards ----------
// The 64 x 64 frame: the floor diamond centred at (32, 48), 64 wide and 32 tall.
const DX = 32
const DY = 48
const inDiamond = (x, y) => Math.abs(x - DX) / 32 + Math.abs(y - DY) / 16
// A loop-safe noise: the same at t = 0 and t = 1.
const loopNoise = (x, y, t, seed) => {
  const a = noise(x + Math.cos(TAU * t) * 3, y + Math.sin(TAU * t) * 3, seed)
  return a
}

function floorGlow(x, y, colour, strength, t, pulse = 0.2) {
  const d = inDiamond(x, y)
  if (d > 1) return NONE
  const flicker = 1 - pulse + pulse * Math.sin(TAU * t + x * 0.2)
  return [...colour, (1 - smoothstep(0.55, 1, d)) * strength * flicker]
}

function flames(x, y, t, [core, mid, edge], seed) {
  let best = 0
  for (let i = 0; i < 6; i++) {
    const bx = DX - 18 + hash(i, 1, seed) * 36
    const by = DY - 6 + hash(i, 2, seed) * 12
    if (inDiamond(bx, by) > 0.85) continue
    const height = 18 + hash(i, 3, seed) * 16
    const h = height * (0.75 + 0.25 * Math.sin(TAU * (t * 2 + hash(i, 4, seed))))
    const rise = (by - y) / h
    if (rise < 0 || rise > 1) continue
    const sway = Math.sin(TAU * (t * 2 + rise * 0.8 + hash(i, 5, seed))) * 2.5 * rise
    const width = (4 + hash(i, 6, seed) * 3) * (1 - rise) ** 0.6
    const across = Math.abs(x - bx - sway) / Math.max(width, 0.01)
    if (across > 1) continue
    best = Math.max(best, (1 - across) * (1 - rise * 0.7))
  }
  if (best <= 0) return NONE
  const colour = best > 0.6 ? mix(mid, core, (best - 0.6) / 0.4) : mix(edge, mid, best / 0.6)
  return [...colour, smoothstep(0, 0.35, best)]
}

function arcs(x, y, t, colour) {
  const frame = Math.round(t * FRAMES)
  let best = 0
  for (let i = 0; i < 3; i++) {
    const points = []
    for (let k = 0; k <= 5; k++) {
      const s = k / 5
      const ax = DX - 24 + s * 48
      const ay = DY - 8 + hash(i, k, frame + 50) * 16
      points.push([ax + (hash(k, i, frame) - 0.5) * 6, ay - Math.sin(Math.PI * s) * (6 + hash(i, 9, frame) * 10)])
    }
    for (let k = 0; k < points.length - 1; k++) {
      const [x0, y0] = points[k]
      const [x1, y1] = points[k + 1]
      const vx = x1 - x0
      const vy = y1 - y0
      const s = clamp01(((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy))
      const d = Math.hypot(x - x0 - vx * s, y - y0 - vy * s)
      best = Math.max(best, d < 0.6 ? 1 : Math.max(0, 1 - (d - 0.6) / 2.5) * 0.6)
    }
  }
  if (best <= 0) return NONE
  return [...mix(colour, [1, 1, 1], best > 0.9 ? 0.8 : 0.2), best]
}

// Soft rising puffs; each loops (rises, fades in and out) within the strip so the animation repeats seamlessly.
function puffs(x, y, t, { colour, count, rise, size, density, seed, drift = 0 }) {
  let alpha = 0
  for (let i = 0; i < count; i++) {
    const phase = (t + hash(i, 1, seed)) % 1
    const bx = DX - 22 + hash(i, 2, seed) * 44 + Math.sin(TAU * phase) * drift
    const by = DY - 6 + hash(i, 3, seed) * 12 - phase * rise
    const r = size * (0.6 + phase * 0.8)
    const d = Math.hypot((x - bx) / r, (y - by) / (r * 0.75))
    if (d > 1) continue
    alpha += (1 - d * d) * Math.sin(Math.PI * phase) * density
  }
  const texture = 0.8 + loopNoise(x / 4, y / 4, t, seed) * 0.4
  return alpha > 0 ? [...scale(colour, texture), clamp01(alpha)] : NONE
}

const HAZARDS = {
  fire: (x, y, t) => over(flames(x, y, t, [hex('#fff4c0'), hex('#ffa030'), hex('#c02a10')], 3), floorGlow(x, y, hex('#ff7020'), 0.45, t)),
  plasmaFire: (x, y, t) => over(flames(x, y, t, [hex('#f0ffff'), hex('#60c8ff'), hex('#2040c0')], 5), floorGlow(x, y, hex('#40a0ff'), 0.5, t)),
  electricity: (x, y, t) => over(arcs(x, y, t, hex('#b0a0ff')), floorGlow(x, y, hex('#7060ff'), 0.25, t, 0.5)),
  smoke: (x, y, t) => puffs(x, y, t, { colour: hex('#6e6e6e'), count: 9, rise: 26, size: 12, density: 0.9, seed: 7, drift: 2 }),
  toxicGas: (x, y, t) => puffs(x, y, t, { colour: hex('#8cc840'), count: 9, rise: 18, size: 12, density: 0.8, seed: 9, drift: 3 }),
  radiation: (x, y, t) => {
    const motes = puffs(x, y, t, { colour: hex('#e8ff60'), count: 12, rise: 30, size: 1.6, density: 1, seed: 13 })
    return over(motes, floorGlow(x, y, hex('#c8f030'), 0.4, t, 0.5))
  },
  steam: (x, y, t) => puffs(x, y, t, { colour: hex('#eef6ff'), count: 8, rise: 34, size: 9, density: 0.6, seed: 15, drift: 1.5 }),
  coolantLeak: (x, y, t) => {
    const mist = puffs(x, y, t, { colour: hex('#a0fff0'), count: 7, rise: 6, size: 13, density: 0.45, seed: 17, drift: 4 })
    const pool = inDiamond(x, y) <= 0.8 ? [...hex('#30d8c0'), 0.35 * (0.8 + 0.2 * Math.sin(TAU * t + x * 0.3))] : NONE
    return over(mist, pool)
  },
}

function hazardJobs() {
  return Object.entries(HAZARDS).map(([type, pixel]) => ({
    file: path.join(PUBLIC, 'art/sprites/environment/hazards', `${type}.png`),
    draw: () => strip(64, 64, 4, pixel),
  }))
}

// ---------- explosions ----------
// The frame is side x side with the blast's tile centre at (side / 2, side * 0.7) (ExplosionFx.jsx).
function explosion(side) {
  const cx = side / 2
  const cy = side * 0.7
  const R = side * 0.36
  return (x, y, f) => {
    const t = f + 0.5 / FRAMES
    const grow = 0.25 + 0.75 * Math.sqrt(t)
    const r = R * grow
    const centreY = cy - r * 0.55 - t * side * 0.08
    const angle = Math.atan2(y - centreY, x - cx)
    const edge = r * (0.85 + (noise(Math.cos(angle) * 3 + 10, Math.sin(angle) * 3 + t * 4, 21) - 0.5) * 0.5)
    const d = Math.hypot(x - cx, (y - centreY) * 1.1) / edge
    let ball = NONE
    if (d < 1) {
      const heat = clamp01((1 - d) * 1.6 - t * 1.1 + (noise(x / 6, y / 6 + t * 5, 23) - 0.5) * 0.5)
      const colour = heat > 0.66 ? mix(hex('#ffd060'), hex('#fffbe0'), (heat - 0.66) / 0.34) : heat > 0.3 ? mix(hex('#e04a10'), hex('#ffd060'), (heat - 0.3) / 0.36) : mix(hex('#3a3430'), hex('#e04a10'), heat / 0.3)
      ball = [...colour, (1 - smoothstep(0.8, 1, d)) * (1 - smoothstep(0.7, 1, t))]
    }
    // The shock ring on the floor, early on.
    const ring = Math.abs(Math.hypot(x - cx, (y - cy) * 2) - side * 0.45 * Math.sqrt(t)) < side * 0.025 && t < 0.5 ? [1, 0.85, 0.6, 0.6 * (1 - t * 2)] : NONE
    return over(ball, ring)
  }
}

function explosionJobs() {
  return [
    ['small', 128],
    ['large', 192],
  ].map(([size, side]) => ({ file: path.join(PUBLIC, 'art/sprites/effects', `explosion-${size}.png`), draw: () => strip(side, side, 2, explosion(side)) }))
}

const jobs = [...(wanted('destructibles') ? destructibleJobs() : []), ...(wanted('hazards') ? hazardJobs() : []), ...(wanted('explosions') ? explosionJobs() : [])]
for (const job of jobs) {
  if (fs.existsSync(job.file) && !FORCE) {
    console.log(`kept   ${path.relative(PUBLIC, job.file)}`)
    continue
  }
  const { width, height, bytes } = job.draw()
  write(job.file, width, height, bytes)
}
