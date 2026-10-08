// The v2 tile renderer shared by scripts/makeTilesV2.mjs (the Starship & Station sample) and
// scripts/makeTilesV2World.mjs (every other tile): maths, value noise, height-map shapes, lighting, the 64 x 96 iso
// design grid and the anti-aliased renderer with bloom. See makeTilesV2.mjs for how a material is lit.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DESIGN_W = 64
export const DESIGN_H = 96
export const RESOLUTION = 4
export const SUBSAMPLES = 3
export const OUT_W = DESIGN_W * RESOLUTION
export const OUT_H = DESIGN_H * RESOLUTION
export const OUT = fileURLToPath(new URL('../../public/art/tiles-v2/', import.meta.url))
export const FORCE = process.argv.includes('--force')
// Tall views draw walls this many times as tall (tiles.json wallHeightScale), so wall faces are designed in drawn
// height and squashed into the image: rivets and panels come out the right shape once stretched.
export const WALL_STRETCH = 2
// Where a generated PNG goes: the palette-group folder (public/art/sprites/environment/<group>/) that tiles.json or
// tileEffects.json gives a file of that name, so a new image has to be added to one of them before it can be drawn.
const PUBLIC = fileURLToPath(new URL('../../public', import.meta.url))
const ART_PATHS = ['tiles.json', 'tileEffects.json'].flatMap(
  (name) => fs.readFileSync(new URL(`../../src/data/adaptation/maps/${name}`, import.meta.url), 'utf8').match(/\/art\/sprites\/environment\/[^"]+\.png/g) ?? [],
)
const named = (art, file) => {
  const [before, after] = art.split('/').pop().split('{joins}')
  return after === undefined ? before === file : file.startsWith(before) && file.endsWith(after)
}
export function outFile(file) {
  const art = ART_PATHS.find((candidate) => named(candidate, file))
  if (!art) throw new Error(`${file} isn't in tiles.json or tileEffects.json, so it has no folder`)
  const folder = path.join(PUBLIC, path.dirname(art))
  fs.mkdirSync(folder, { recursive: true })
  return path.join(folder, file)
}


// ---------- maths ----------
export const rgb = (hex) => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]
export const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t)
export const scale = (colour, factor) => colour.map((value) => value * factor)
export const add = (a, b) => a.map((value, i) => value + b[i])
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const normalize = (v) => scale(v, 1 / Math.hypot(...v))
export const clamp01 = (value) => Math.max(0, Math.min(1, value))
export const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

export function hash(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 982451653)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
export function noise(x, y, seed) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smoothstep(0, 1, x - x0)
  const fy = smoothstep(0, 1, y - y0)
  const n = (i, j) => hash(x0 + i, y0 + j, seed)
  const top = n(0, 0) + (n(1, 0) - n(0, 0)) * fx
  const bottom = n(0, 1) + (n(1, 1) - n(0, 1)) * fx
  return top + (bottom - top) * fy
}

// Height-map shapes, in texels (a tile edge is 32 texels). Positive heights stand out of the surface.
export const bevel = (distance, width, depth) => (distance >= width ? 0 : -depth * (1 - smoothstep(0, width, distance)))
export const groove = (offset, width, depth) => -depth * (1 - smoothstep(0, width, Math.abs(offset)))
export const dome = (r, radius, height) => (r >= radius ? 0 : height * Math.sqrt(1 - (r / radius) ** 2))
// Distance inside a rectangle to its nearest edge (negative outside).
export const inside = (u, v, u0, v0, u1, v1) => Math.min(u - u0, u1 - u, v - v0, v1 - v)

// ---------- lighting ----------
export const LIGHT = normalize([-0.35, 0.75, 1])
export const FILL = normalize([1, -0.3, 0.4])
export const VIEW = normalize([1, 1, 1.15])
export const HALF = normalize(add(LIGHT, VIEW))

// World axes: X along a tile's a (towards the bottom right), Y along b (towards the bottom left), Z up.
export const FRAMES = {
  top: { n: [0, 0, 1], t1: [1, 0, 0], t2: [0, 1, 0] },
  left: { n: [0, 1, 0], t1: [1, 0, 0], t2: [0, 0, 1] },
  right: { n: [1, 0, 0], t1: [0, -1, 0], t2: [0, 0, 1] },
}

// material: { height(u, v, face), surface(u, v, face) -> { albedo, spec, shininess, emit, ao } }
export function shade(material, u, v, face) {
  const frame = FRAMES[face]
  const step = 0.2
  const h = (du, dv) => material.height?.(u + du, v + dv, face) ?? 0
  const hu = (h(step, 0) - h(-step, 0)) / (2 * step)
  const hv = (h(0, step) - h(0, -step)) / (2 * step)
  const n = normalize(add(frame.n, add(scale(frame.t1, -hu), scale(frame.t2, -hv))))
  const s = material.surface(u, v, face)
  const light = 0.36 + 0.64 * Math.max(0, dot(n, LIGHT)) + 0.14 * Math.max(0, dot(n, FILL))
  const highlight = (s.spec ?? 0.2) * Math.max(0, dot(n, HALF)) ** (s.shininess ?? 24)
  const colour = add(scale(s.albedo, light * (s.ao ?? 1)), [highlight, highlight, highlight])
  return { colour, emit: s.emit ?? null, tag: s.tag ?? null }
}

// ---------- geometry (design units) ----------
export const CX = 32
export const CY = 80
export function iso(px, py, lift = 0) {
  const dx = px - CX
  const dy = py - (CY - lift)
  return { a: dx / 64 + dy / 32 + 0.5, b: -dx / 64 + dy / 32 + 0.5 }
}
export const inUnit = ({ a, b }) => a >= 0 && a <= 1 && b >= 0 && b <= 1

// Which face of a whole-tile block of height h the design point is on: top (a, b) or a side (u 0..32 along the face,
// left face from the left corner to the front, right face from the front to the right corner; z up from the floor).
export function blockFace(px, py, h) {
  const top = iso(px, py, h)
  if (inUnit(top)) return { face: 'top', u: top.a * 32, v: top.b * 32 }
  const bottom = px < CX ? CY + px / 2 : CY + 16 - (px - CX) / 2
  if (py > bottom || py < bottom - h) return null
  return px < CX ? { face: 'left', u: px, v: bottom - py } : { face: 'right', u: px - CX, v: bottom - py }
}

export const floorScene = (material) => (px, py) => {
  const point = iso(px, py)
  return inUnit(point) ? shade(material, point.a * 32, point.b * 32, 'top') : null
}

// stretch: side faces are designed this many times taller than drawn (walls, see WALL_STRETCH).
export const blockScene = (h, material, stretch = 1) => (px, py) => {
  const face = blockFace(px, py, h)
  if (!face) return null
  return shade(material, face.u, face.face === 'top' ? face.v : face.v * stretch, face.face)
}

// subsamples: anti-aliasing samples per pixel along each axis (fewer for expensive scenes). width, height: the image
// size in pixels (a tile's by default; two-tile panels are larger, v2/panels.mjs).
export function render(scene, { bloom = 0.9, subsamples = SUBSAMPLES, width = OUT_W, height = OUT_H } = {}) {
  const colour = new Float32Array(width * height * 3)
  const emit = new Float32Array(width * height * 3)
  const alpha = new Float32Array(width * height)
  const samples = subsamples * subsamples
  for (let oy = 0; oy < height; oy++) {
    for (let ox = 0; ox < width; ox++) {
      const i = oy * width + ox
      let hits = 0
      for (let sy = 0; sy < subsamples; sy++) {
        for (let sx = 0; sx < subsamples; sx++) {
          const result = scene((ox + (sx + 0.5) / subsamples) / RESOLUTION, (oy + (sy + 0.5) / subsamples) / RESOLUTION)
          if (!result) continue
          hits++
          for (let k = 0; k < 3; k++) {
            colour[i * 3 + k] += result.colour[k]
            if (result.emit) emit[i * 3 + k] += result.emit[k]
          }
        }
      }
      if (!hits) continue
      alpha[i] = hits / samples
      for (let k = 0; k < 3; k++) {
        colour[i * 3 + k] /= hits
        emit[i * 3 + k] /= hits
      }
    }
  }
  const glow = blur(emit, 6, 3, width, height)
  const bytes = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    for (let k = 0; k < 3; k++) {
      const value = colour[i * 3 + k] + emit[i * 3 + k] + glow[i * 3 + k] * bloom
      bytes[i * 4 + k] = Math.round(clamp01(value) * 255)
    }
    bytes[i * 4 + 3] = Math.round(alpha[i] * 255)
  }
  return bytes
}

// A light-only overlay for animating a tile's lights: just the emission of the surfaces tagged with one of tags, plus
// its bloom, with the brightness carried in the alpha so the overlay fades in and out cleanly over the tile.
export function renderLights(scene, tags, { gain = 1, width = OUT_W, height = OUT_H } = {}) {
  const emit = new Float32Array(width * height * 3)
  const samples = SUBSAMPLES * SUBSAMPLES
  for (let oy = 0; oy < height; oy++) {
    for (let ox = 0; ox < width; ox++) {
      const i = oy * width + ox
      for (let sy = 0; sy < SUBSAMPLES; sy++) {
        for (let sx = 0; sx < SUBSAMPLES; sx++) {
          const result = scene((ox + (sx + 0.5) / SUBSAMPLES) / RESOLUTION, (oy + (sy + 0.5) / SUBSAMPLES) / RESOLUTION)
          if (!result?.emit || !tags.includes(result.tag)) continue
          for (let k = 0; k < 3; k++) emit[i * 3 + k] += result.emit[k] / samples
        }
      }
    }
  }
  const glow = blur(emit, 6, 3, width, height)
  const bytes = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const light = [0, 1, 2].map((k) => (emit[i * 3 + k] + glow[i * 3 + k] * 1.4) * gain)
    const peak = Math.max(...light)
    if (peak < 0.01) continue
    for (let k = 0; k < 3; k++) bytes[i * 4 + k] = Math.round(clamp01(light[k] / peak) * 255)
    bytes[i * 4 + 3] = Math.round(clamp01(peak) * 255)
  }
  return bytes
}

export function blur(source, radius, passes, width = OUT_W, height = OUT_H) {
  let current = source
  for (let pass = 0; pass < passes; pass++) {
    const horizontal = new Float32Array(current.length)
    const result = new Float32Array(current.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let k = 0; k < 3; k++) {
          let sum = 0
          for (let d = -radius; d <= radius; d++) sum += current[(y * width + Math.min(width - 1, Math.max(0, x + d))) * 3 + k]
          horizontal[(y * width + x) * 3 + k] = sum / (radius * 2 + 1)
        }
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let k = 0; k < 3; k++) {
          let sum = 0
          for (let d = -radius; d <= radius; d++) sum += horizontal[(Math.min(height - 1, Math.max(0, y + d)) * width + x) * 3 + k]
          result[(y * width + x) * 3 + k] = sum / (radius * 2 + 1)
        }
      }
    }
    current = result
  }
  return current
}
