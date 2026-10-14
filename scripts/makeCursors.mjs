// Placeholder mouse cursors (src/styles/cursors.css): 32x32 PNGs in public/art/cursors/, drawn from simple shapes as
// game cursors: polished metal in the interface colours (gold, cyan, blue, red), a bevel lit from the top left, a dark
// rim and a soft drop shadow so they read on any background; the pointer glows. Each cursor's hotspot
// is set in cursors.css, so replacement art must keep the same tip or centre. Never overwrites a PNG without --force:
// the designer may have replaced it with real art.
// Run: node scripts/makeCursors.mjs [--force]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public/art/cursors')
const FORCE = process.argv.includes('--force')
const SIZE = 32
const SUBSAMPLES = 4
const OUTLINE = 1.3
const BEVEL = 1.7
const GLOW = 2.6
const SHADOW = { dx: 1.2, dy: 1.8, soft: 1.6, alpha: 0.5 }
// The light comes from the top left (towards it, normalised).
const LIGHT = [-Math.SQRT1_2, -Math.SQRT1_2]

const hex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16))
// Metals: the lit bevel, the body, and the shaded bevel and lower body.
const metal = (light, mid, dark) => ({ light: hex(light), mid: hex(mid), dark: hex(dark) })
const YELLOW = metal('#fff4c4', '#f2b52c', '#7c4f08')
const BLUE = metal('#d6e6ff', '#4f8ff0', '#162f78')
const CYAN = metal('#dcfffb', '#3fcad3', '#0c4f66')
const RED = metal('#ffc9bf', '#e2463d', '#6a110d')
const WHITE = metal('#ffffff', '#d5ddeb', '#66728c')
const GROOVE = metal('#b07a1c', '#7c4f08', '#4a2e04')
const GUNMETAL = metal('#eef2fa', '#9ba7be', '#353e54')
const GRIP = metal('#b3bccf', '#5d667c', '#232838')
const DARK = hex('#070c24')
const GLOW_CYAN = hex('#6ff5ff')
const GLOW_RED = hex('#ff5a3c')

// ------------------------------------------------------------------ signed distances (negative inside)

const length = (x, y) => Math.hypot(x, y)
function segment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return length(px - ax - t * dx, py - ay - t * dy)
}
const polygon = (points) => (px, py) => {
  let distance = Infinity
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    distance = Math.min(distance, segment(px, py, points[i], points[j]))
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside ? -distance : distance
}
const circle = (cx, cy, r) => (px, py) => length(px - cx, py - cy) - r
const ring = (cx, cy, r, width) => (px, py) => Math.abs(length(px - cx, py - cy) - r) - width / 2
const line = (a, b, width) => (px, py) => segment(px, py, a, b) - width / 2
const union = (...shapes) => (px, py) => Math.min(...shapes.map((shape) => shape(px, py)))
const subtract = (shape, cut) => (px, py) => Math.max(shape(px, py), -cut(px, py))
const roundRect = (x, y, w, h, r) => (px, py) => {
  const qx = Math.abs(px - (x + w / 2)) - w / 2 + r
  const qy = Math.abs(py - (y + h / 2)) - h / 2 + r
  return length(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}
const gear = (cx, cy, r, teeth) => (px, py) => {
  const angle = Math.atan2(py - cy, px - cx)
  const toothed = Math.cos(angle * teeth) > 0 ? r : r - 1.8
  return length(px - cx, py - cy) - toothed
}

// ------------------------------------------------------------------ the pieces

// A shape drawn in its own coordinates, placed at (x, y) and turned by angle (radians, clockwise on screen).
const placed = (shape, x, y, angle) => (px, py) => {
  const dx = px - x
  const dy = py - y
  return shape(dx * Math.cos(angle) + dy * Math.sin(angle), -dx * Math.sin(angle) + dy * Math.cos(angle))
}

// A Starfleet delta pointing up from its tip at (0, 0): sides bowing slightly outward, the base cut in by a curve.
function deltaPoints(length, halfWidth, notch) {
  const STEPS = 12
  const right = []
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    right.push([halfWidth * t + halfWidth * 0.16 * Math.sin(Math.PI * t), length * t])
  }
  const base = []
  for (let i = 1; i < STEPS; i++) {
    const x = halfWidth * (1 - (2 * i) / STEPS)
    base.push([x, length - notch * (1 - (x / halfWidth) ** 2)])
  }
  const left = right.slice(1).reverse().map(([x, y]) => [-x, y])
  return [...right, ...base, ...left]
}
const delta = (length, halfWidth, notch) => polygon(deltaPoints(length, halfWidth, notch))
// The delta leans right of vertical like an arrow cursor; its tip is the hotspot at (2, 2).
const LEAN = -0.44
const ARROW = placed(delta(24, 7.6, 6.2), 2, 2, LEAN)
// The inner delta engraved on the badge.
const ENGRAVING = placed((px, py) => Math.abs(delta(12, 3.6, 3)(px, py - 6.5)) - 0.45, 2, 2, LEAN)
// The small delta beside a badge (help, unavailable, talk, use).
const SMALL_ARROW = placed(delta(17, 5.4, 4.4), 2, 2, LEAN)
const SMALL_ENGRAVING = placed((px, py) => Math.abs(delta(8.5, 2.5, 2.1)(px, py - 4.6)) - 0.4, 2, 2, LEAN)
const BADGE = circle(22, 22, 8.5)

// A Type-2 phaser in its own coordinates, emitter at (0, 0) and the barrel running back along +x: the body, the
// Type-1 on top, the pistol grip below the back, and the emitter.
const PHASER_BODY = union(roundRect(1, -3, 22.5, 6, 2), polygon([[1.5, -2], [1.5, 2], [-1, 1.1], [-1, -1.1]]))
const PHASER_TOP = roundRect(8.5, -5.8, 11.5, 3.2, 1.2)
const PHASER_GRIP = polygon([[14, 2.5], [22.5, 2.5], [25, 14], [18.5, 15]])
const PHASER_EMITTER = circle(0, 0, 1.8)
// Aimed up and to the left, emitter at the hotspot (3, 5).
const AIM = 0.45
const aimed = (shape) => placed(shape, 3, 5, AIM)

// Layers paint in order; each is a shape with a fill, outlined in DARK.
const CURSORS = {
  default: [
    { shape: ARROW, fill: YELLOW },
    { shape: ENGRAVING, fill: GROOVE, outline: false },
  ],
  // The delta lit up: something here can be clicked.
  pointer: [
    { shape: ARROW, fill: YELLOW, glow: GLOW_CYAN },
    { shape: ENGRAVING, fill: CYAN, outline: false },
  ],
  help: [
    { shape: SMALL_ARROW, fill: YELLOW },
    { shape: SMALL_ENGRAVING, fill: GROOVE, outline: false },
    { shape: BADGE, fill: BLUE },
    { shape: union(circle(22, 17.6, 1.4), roundRect(20.8, 20.4, 2.4, 7, 1)), fill: WHITE, outline: false },
  ],
  'not-allowed': [
    { shape: SMALL_ARROW, fill: YELLOW },
    { shape: SMALL_ENGRAVING, fill: GROOVE, outline: false },
    { shape: union(ring(22, 22, 6.2, 2.6), line([17.6, 26.4], [26.4, 17.6], 2.6)), fill: RED },
  ],
  text: [{ shape: union(line([16, 6], [16, 26], 2), line([12, 5], [20, 5], 2), line([12, 27], [20, 27], 2)), fill: WHITE }],
  crosshair: [
    {
      shape: union(line([16, 3], [16, 12], 2), line([16, 20], [16, 29], 2), line([3, 16], [12, 16], 2), line([20, 16], [29, 16], 2), circle(16, 16, 1.4)),
      fill: WHITE,
    },
  ],
  // Four-way arrows: take hold of something and drag it.
  grab: [
    {
      shape: union(
        line([16, 6], [16, 26], 2.4),
        line([6, 16], [26, 16], 2.4),
        polygon([[16, 2], [20.5, 7.5], [11.5, 7.5]]),
        polygon([[16, 30], [20.5, 24.5], [11.5, 24.5]]),
        polygon([[2, 16], [7.5, 11.5], [7.5, 20.5]]),
        polygon([[30, 16], [24.5, 11.5], [24.5, 20.5]]),
      ),
      fill: YELLOW,
    },
  ],
  // A Type-2 phaser aimed at the enemy, its emitter glowing.
  attack: [
    { shape: aimed(PHASER_GRIP), fill: GRIP },
    { shape: aimed(PHASER_BODY), fill: GUNMETAL },
    { shape: aimed(PHASER_TOP), fill: GRIP },
    { shape: aimed(PHASER_EMITTER), fill: RED, glow: GLOW_RED },
  ],
  // A floor tile with an arrow coming down onto it: walk there.
  move: [
    { shape: subtract(polygon([[16, 19], [29, 25], [16, 31], [3, 25]]), polygon([[16, 22], [22.5, 25], [16, 28], [9.5, 25]])), fill: CYAN },
    { shape: union(line([16, 3], [16, 14], 3), polygon([[16, 22], [10.5, 14], [21.5, 14]])), fill: CYAN },
  ],
  // A speech bubble: talk to them.
  talk: [
    { shape: SMALL_ARROW, fill: YELLOW },
    { shape: SMALL_ENGRAVING, fill: GROOVE, outline: false },
    { shape: union(roundRect(13, 13, 18, 13, 4), polygon([[17, 24], [17, 30.5], [22.5, 24]])), fill: WHITE },
    { shape: union(circle(17.8, 19.5, 1.3), circle(22, 19.5, 1.3), circle(26.2, 19.5, 1.3)), fill: BLUE, outline: false },
  ],
  // A gear: use the object.
  use: [
    { shape: SMALL_ARROW, fill: YELLOW },
    { shape: SMALL_ENGRAVING, fill: GROOVE, outline: false },
    { shape: subtract(gear(22, 22, 8.5, 8), circle(22, 22, 3)), fill: BLUE },
  ],
}

// ------------------------------------------------------------------ rendering

const clamp01 = (value) => Math.max(0, Math.min(1, value))
const mix = (a, b, t) => a.map((channel, i) => channel + (b[i] - channel) * t)

// A metal surface at a point inside a shape: darker towards the bottom right, and a bevel along the edge, bright
// where the edge faces the light and dark where it faces away, with a thin highlight just inside the lit rim.
function metalAt(shape, { light, mid, dark }, px, py, distance) {
  let colour = mix(mid, dark, clamp01((px + py - 10) / 44) * 0.75)
  const depth = -distance
  if (depth < BEVEL) {
    const e = 0.2
    const nx = shape(px + e, py) - shape(px - e, py)
    const ny = shape(px, py + e) - shape(px, py - e)
    const n = Math.hypot(nx, ny) || 1
    const facing = (nx / n) * LIGHT[0] + (ny / n) * LIGHT[1]
    const edge = 1 - depth / BEVEL
    colour = facing > 0 ? mix(colour, light, edge * facing * 0.95) : mix(colour, dark, edge * -facing * 0.8)
  }
  return colour
}

// One sample, painted back to front over transparency: the drop shadow, then per layer its glow, dark rim and
// metal. Returns premultiplied [r, g, b, a] (0-255, alpha 0-1).
function sample(layers, px, py) {
  let out = [0, 0, 0, 0]
  const over = (colour, alpha) => {
    if (alpha <= 0) return
    out = [colour[0] * alpha + out[0] * (1 - alpha), colour[1] * alpha + out[1] * (1 - alpha), colour[2] * alpha + out[2] * (1 - alpha), alpha + out[3] * (1 - alpha)]
  }
  const shadowDistance = Math.min(...layers.map(({ shape }) => shape(px - SHADOW.dx, py - SHADOW.dy))) - OUTLINE
  over([0, 0, 0], SHADOW.alpha * clamp01(0.5 - shadowDistance / SHADOW.soft))
  for (const { shape, fill, outline = true, glow } of layers) {
    const distance = shape(px, py)
    if (glow && distance > 0) over(glow, 0.75 * clamp01(1 - (distance - OUTLINE) / GLOW) ** 2)
    if (distance < 0) over(metalAt(shape, fill, px, py, distance), 1)
    else if (outline && distance < OUTLINE) over(DARK, 1)
  }
  return out
}

function render(layers) {
  const data = new Uint8Array(SIZE * SIZE * 4)
  const count = SUBSAMPLES * SUBSAMPLES
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sum = [0, 0, 0, 0]
      for (let sy = 0; sy < SUBSAMPLES; sy++) {
        for (let sx = 0; sx < SUBSAMPLES; sx++) {
          const value = sample(layers, x + (sx + 0.5) / SUBSAMPLES, y + (sy + 0.5) / SUBSAMPLES)
          for (let c = 0; c < 4; c++) sum[c] += value[c]
        }
      }
      const alpha = sum[3] / count
      if (alpha <= 0) continue
      const i = (y * SIZE + x) * 4
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(sum[c] / count / alpha)
      data[i + 3] = Math.round(255 * alpha)
    }
  }
  return data
}

fs.mkdirSync(OUT, { recursive: true })
for (const [name, layers] of Object.entries(CURSORS)) {
  const file = path.join(OUT, `${name}.png`)
  if (fs.existsSync(file) && !FORCE) {
    console.log(`kept ${path.relative(ROOT, file)} (use --force to redraw)`)
    continue
  }
  fs.writeFileSync(file, encodePng(SIZE, SIZE, render(layers)))
  console.log(`wrote ${path.relative(ROOT, file)}`)
}
