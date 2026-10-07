// Building blocks for the v2 art of every non-starship tile (scripts/makeTilesV2World.mjs), on top of engine.mjs.
// - Seamless noise: tile textures wrap every 32 texels so neighbouring tiles join without seams (floors and wall tops
//   in both directions, wall faces along the run).
// - Object scenes: props, plants and boulders are signed distance fields ray-marched through the same iso camera,
//   standing on a ground material, with soft shadows and ambient occlusion; lit like the v2 materials.
// - A contact sheet writer for checking a batch of tiles at a glance.
import fs from 'node:fs'
import { encodePng } from '../png.mjs'
import { add, clamp01, CX, CY, dot, FILL, FRAMES, HALF, hash, LIGHT, normalize, OUT_H, OUT_W, scale, smoothstep } from './engine.mjs'

// ---------- seamless noise ----------
const wrap = (i, n) => ((i % n) + n) % n
const fade = (t) => t * t * (3 - 2 * t)

// Value noise at lattice coordinates (x, y), wrapping with periods px, py (0: no wrap).
function lattice(x, y, px, py, seed) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = fade(x - x0)
  const fy = fade(y - y0)
  const n = (i, j) => hash(px ? wrap(x0 + i, px) : x0 + i, py ? wrap(y0 + j, py) : y0 + j, seed)
  const top = n(0, 0) + (n(1, 0) - n(0, 0)) * fx
  const bottom = n(0, 1) + (n(1, 1) - n(0, 1)) * fx
  return top + (bottom - top) * fy
}

// cells: lattice cells across one 32-texel tile (an integer, so the noise wraps at the tile edge).
// tileNoise wraps in u and v (floors, wall tops); faceNoise wraps only in u (wall faces, v is height).
export const tileNoise = (u, v, cells, seed) => lattice((u / 32) * cells, (v / 32) * cells, cells, cells, seed)
export const faceNoise = (u, v, cells, seed) => lattice((u / 32) * cells, (v / 32) * cells, cells, 0, seed)

// Fractal sums of either noise, in 0..1. cells doubles each octave.
export function fbm(noiseFn, u, v, cells, seed, octaves = 4) {
  let sum = 0
  let weight = 1
  let total = 0
  for (let o = 0; o < octaves; o++) {
    sum += noiseFn(u, v, cells << o, seed + o * 17) * weight
    total += weight
    weight *= 0.5
  }
  return sum / total
}

// Cellular noise: distance (texels) to the nearest and second-nearest feature point, and the nearest cell's random id.
// wrapV false: wraps only along u (wall faces).
export function cells(u, v, count, seed, wrapV = true) {
  const x = (u / 32) * count
  const y = (v / 32) * count
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  let f1 = 9
  let f2 = 9
  let id = 0
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const cx = xi + di
      const cy = yi + dj
      const hx = wrap(cx, count)
      const hy = wrapV ? wrap(cy, count) : cy
      const d = Math.hypot(x - (cx + 0.15 + hash(hx, hy, seed) * 0.7), y - (cy + 0.15 + hash(hx, hy, seed + 1) * 0.7))
      if (d < f1) {
        f2 = f1
        f1 = d
        id = hash(hx, hy, seed + 2)
      } else if (d < f2) f2 = d
    }
  }
  const unit = 32 / count
  return { f1: f1 * unit, f2: f2 * unit, edge: (f2 - f1) * unit, id }
}

// 3D value noise (not periodic) for objects.
export function noise3(x, y, z, seed) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)
  const fx = fade(x - x0)
  const fy = fade(y - y0)
  const fz = fade(z - z0)
  const n = (i, j, k) => hash(x0 + i, y0 + j + (z0 + k) * 7919, seed)
  const plane = (k) => {
    const top = n(0, 0, k) + (n(1, 0, k) - n(0, 0, k)) * fx
    const bottom = n(0, 1, k) + (n(1, 1, k) - n(0, 1, k)) * fx
    return top + (bottom - top) * fy
  }
  const a = plane(0)
  return a + (plane(1) - a) * fz
}
export function fbm3(x, y, z, seed, octaves = 3) {
  let sum = 0
  let weight = 1
  let total = 0
  let f = 1
  for (let o = 0; o < octaves; o++) {
    sum += noise3(x * f, y * f, z * f, seed + o * 31) * weight
    total += weight
    weight *= 0.5
    f *= 2
  }
  return sum / total
}

// ---------- distance fields (texels; the tile spans x, y 0..32, z is up in design pixels) ----------
export const sphere = (p, c, r) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r
export function ellipsoid(p, c, r) {
  const q = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]]
  const k0 = Math.hypot(...q)
  const k1 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2])
  return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1
}
// An axis-aligned box: centre c, half sizes h, rounded by r.
export function box(p, c, h, r = 0) {
  const q = [Math.abs(p[0] - c[0]) - h[0] + r, Math.abs(p[1] - c[1]) - h[1] + r, Math.abs(p[2] - c[2]) - h[2] + r]
  const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0))
  return outside + Math.min(Math.max(q[0], q[1], q[2]), 0) - r
}
// An upright cylinder at (cx, cy) from z0 to z1, its edges rounded by r.
export function cylinder(p, cx, cy, radius, z0, z1, r = 0) {
  const d = [Math.hypot(p[0] - cx, p[1] - cy) - radius + r, Math.abs(p[2] - (z0 + z1) / 2) - (z1 - z0) / 2 + r]
  return Math.min(Math.max(d[0], d[1]), 0) + Math.hypot(Math.max(d[0], 0), Math.max(d[1], 0)) - r
}
// An upright cone frustum: radius r0 at z0 narrowing (or widening) to r1 at z1. Close to exact for gentle slopes.
export function cone(p, cx, cy, z0, r0, z1, r1) {
  const t = clamp01((p[2] - z0) / (z1 - z0))
  const radius = r0 + (r1 - r0) * t
  const slope = Math.hypot(1, (r1 - r0) / (z1 - z0))
  const side = (Math.hypot(p[0] - cx, p[1] - cy) - radius) / slope
  return Math.max(side, z0 - p[2], p[2] - z1)
}
export function capsule(p, a, b, r) {
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
  const h = clamp01(dot(pa, ba) / dot(ba, ba))
  return Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - r
}
// A capsule that tapers from ra at a to rb at b.
export function taper(p, a, b, ra, rb) {
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
  const h = clamp01(dot(pa, ba) / dot(ba, ba))
  return Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - (ra + (rb - ra) * h)
}
// A ring lying flat round (cx, cy) at height z.
export const torus = (p, cx, cy, z, R, r) => Math.hypot(Math.hypot(p[0] - cx, p[1] - cy) - R, p[2] - z) - r
export function smin(a, b, k) {
  // Callers fold lists starting from Infinity; Infinity * 0 would otherwise give NaN.
  if (a === Infinity) return b
  if (b === Infinity) return a
  const h = clamp01(0.5 + (0.5 * (b - a)) / k)
  return b + (a - b) * h - k * h * (1 - h)
}

// ---------- object scenes ----------
const RAY = normalize([-1, -1, -1])
const ROOT3 = Math.sqrt(3)

// ground: a floor material (height/surface, as engine.mjs shade); parts: [{ sdf(p), mat(p, n) -> surface }].
// top: the highest point any part reaches (where marching starts). The object's surface returns the same fields as a
// material's (albedo, spec, shininess, emit, tag, ao).
export function objectScene({ ground, parts, top = 60 }) {
  const dist = (p) => {
    let d = Infinity
    for (const part of parts) d = Math.min(d, part.sdf(p))
    return d
  }
  const nearest = (p) => {
    let best = parts[0]
    let d = Infinity
    for (const part of parts) {
      const value = part.sdf(p)
      if (value < d) {
        d = value
        best = part
      }
    }
    return best
  }
  const shadow = (p) => {
    let result = 1
    let t = 0.4
    for (let i = 0; i < 40 && t < 70; i++) {
      const d = dist([p[0] + LIGHT[0] * t, p[1] + LIGHT[1] * t, p[2] + LIGHT[2] * t])
      if (d < 0.02) return 0
      result = Math.min(result, (6 * d) / t)
      t += Math.max(d, 0.3)
    }
    return clamp01(result)
  }
  const occlusion = (p, n) => {
    let occ = 0
    let weight = 1
    for (let i = 1; i <= 4; i++) {
      const h = i * 1.4
      occ += (h - dist([p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h])) * weight
      weight *= 0.6
    }
    return clamp01(1 - occ * 0.09)
  }
  const light = (n, s, sun, ao) => {
    const level = 0.36 + 0.64 * Math.max(0, dot(n, LIGHT)) * sun + 0.14 * Math.max(0, dot(n, FILL))
    const highlight = (s.spec ?? 0.15) * Math.max(0, dot(n, HALF)) ** (s.shininess ?? 20) * sun
    return add(scale(s.albedo, level * ao * (s.ao ?? 1)), [highlight, highlight, highlight])
  }
  const groundAt = (x, y) => {
    if (x < 0 || y < 0 || x > 32 || y > 32) return null
    const step = 0.2
    const h = (du, dv) => ground.height?.(x + du, y + dv, 'top') ?? 0
    const frame = FRAMES.top
    const n = normalize(add(frame.n, add(scale(frame.t1, -(h(step, 0) - h(-step, 0)) / (2 * step)), scale(frame.t2, -(h(0, step) - h(0, -step)) / (2 * step)))))
    const p = [x, y, 0.05]
    const near = dist([x, y, 1.2])
    const ao = 0.5 + 0.5 * smoothstep(0, 5, near)
    const s = ground.surface(x, y, 'top')
    return { colour: light(n, s, shadow(p), ao), emit: s.emit ?? null, tag: s.tag ?? null }
  }
  return (px, py) => {
    const z0 = top + 2
    const d = px - CX
    const s = 2 * (py - CY + z0 + 16)
    const origin = [(s + d) / 2, (s - d) / 2, z0]
    const end = z0 * ROOT3
    let t = 0
    for (let i = 0; i < 200 && t < end; i++) {
      const p = [origin[0] + RAY[0] * t, origin[1] + RAY[1] * t, origin[2] + RAY[2] * t]
      const dd = dist(p)
      if (dd < 0.03) {
        const e = 0.04
        const n = normalize([
          dist([p[0] + e, p[1], p[2]]) - dist([p[0] - e, p[1], p[2]]),
          dist([p[0], p[1] + e, p[2]]) - dist([p[0], p[1] - e, p[2]]),
          dist([p[0], p[1], p[2] + e]) - dist([p[0], p[1], p[2] - e]),
        ])
        const s = nearest(p).mat(p, n)
        const lift = [p[0] + n[0] * 0.15, p[1] + n[1] * 0.15, p[2] + n[2] * 0.15]
        return { colour: light(n, s, shadow(lift), occlusion(p, n)), emit: s.emit ?? null, tag: s.tag ?? null }
      }
      t += Math.max(dd * 0.85, 0.03)
    }
    return groundAt(origin[0] + RAY[0] * end, origin[1] + RAY[1] * end)
  }
}

// ---------- contact sheet ----------
// images: [{ id, bytes }] at OUT_W x OUT_H; drawn half size in rows of columns on a dark background.
export function writeSheet(file, images, columns = 8) {
  const w = OUT_W / 2
  const h = OUT_H / 2
  const rows = Math.ceil(images.length / columns)
  const W = w * Math.min(columns, images.length)
  const H = h * rows
  const out = new Uint8Array(W * H * 4)
  for (let i = 0; i < W * H; i++) out.set([18, 22, 26, 255], i * 4)
  images.forEach(({ bytes }, index) => {
    const ox = (index % columns) * w
    const oy = Math.floor(index / columns) * h
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const acc = [0, 0, 0, 0]
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const i = ((y * 2 + dy) * OUT_W + x * 2 + dx) * 4
          const a = bytes[i + 3] / 255
          for (let k = 0; k < 3; k++) acc[k] += bytes[i + k] * a
          acc[3] += a
        }
        const o = ((oy + y) * W + ox + x) * 4
        const a = acc[3] / 4
        for (let k = 0; k < 3; k++) out[o + k] = Math.round(acc[k] / 4 + out[o + k] * (1 - a))
      }
    }
  })
  fs.writeFileSync(file, encodePng(W, H, out))
}
