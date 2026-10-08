// Wall materials for the v2 world tiles. Each maker returns (H) => material, H being the face height the material is
// designed at (the wall's height, tiles.json height). Faces use
// u 0..32 along the face (wrapping, so a run of walls joins up) and v = height above the floor; the top uses u, v 0..32.
import { bevel, clamp01, dome, groove, hash, mix, rgb, scale, smoothstep } from './engine.mjs'
import { cells, faceNoise, fbm, tileNoise } from './kit.mjs'

const frontOf = (u, face) => (face === 'left' ? 32 - u : u)
const sideOf = (u, face) => (face === 'left' ? u : 32 - u)
const mod = (x, n) => ((x % n) + n) % n

// extra(u, v, face, H): an optional feature over the wall ({ height?, surface? } or null) – timber, vines, stripes.
function withExtra(material, extra) {
  if (!extra) return material
  return {
    height(u, v, face) {
      const e = extra.height?.(u, v, face)
      return e ?? material.height(u, v, face)
    },
    surface(u, v, face) {
      return extra.surface?.(u, v, face) ?? material.surface(u, v, face)
    },
  }
}

// Natural rock: chunky facets, bumps, optional strata bands, column joints (basalt), a cap of another material on
// top (grass, snow, frost) that spills a little over the edge, and veins (glowing or plain).
export function rockWall({
  base,
  dark = scale(base, 0.7),
  light = scale(base, 1.2),
  seed = 1,
  facets = 3,
  strata = null,
  columns = 0,
  cap = null,
  veins = null,
  gloss = 0,
  extra = null,
}) {
  return (H) => {
    const capDepth = (u) => (cap ? cap.depth * (0.55 + faceNoise(u, 0, 8, seed + 77) * 0.9) : 0)
    const material = {
      height(u, v, face) {
        if (face === 'top') {
          let h = (fbm(tileNoise, u, v, 4, seed, 3) - 0.5) * 2 + bevel(Math.min(32 - u, 32 - v), 2, 1.6)
          if (columns) h += groove(cells(u, v, columns, seed + 5).edge, 0.4, 1)
          return h
        }
        const c = cells(u, v, facets, seed + 3, false)
        let h = bevel(c.edge, 1.6, 1.3) + (fbm(faceNoise, u, v, 4, seed + 1, 3) - 0.5) * 1.6
        if (strata) h += groove(mod(v + faceNoise(u, v, 2, seed + 9) * strata.wobble, strata.spacing) - strata.spacing / 2, 0.6, strata.depth ?? 0.8)
        if (columns) h += groove(mod(u, 32 / columns) - 16 / columns, 0.5, 1.2)
        h += bevel(frontOf(u, face), 2.6, 1.8) + bevel(H - v, 2, 1.4)
        return h
      },
      surface(u, v, face) {
        if (face === 'top') {
          const t = fbm(tileNoise, u, v, 4, seed + 2, 3)
          if (cap) return { albedo: scale(mix(cap.colour, cap.dark ?? scale(cap.colour, 0.8), t), 0.92 + tileNoise(u, v, 32, seed) * 0.14), spec: cap.spec ?? 0.1, shininess: 20 }
          return { albedo: scale(mix(dark, light, t), 1.05), spec: 0.12 + gloss, shininess: 18 + gloss * 60 }
        }
        const ao = 0.62 + 0.38 * smoothstep(0, 14, v)
        if (cap && v > H - capDepth(u, face)) return { albedo: scale(cap.colour, 0.9 + faceNoise(u, v, 32, seed) * 0.15), spec: cap.spec ?? 0.1, shininess: 20, ao }
        const c = cells(u, v, facets, seed + 3, false)
        const t = fbm(faceNoise, u, v, 3, seed + 4, 4)
        let albedo = scale(mix(dark, light, smoothstep(0.2, 0.8, t)), 0.86 + c.id * 0.24)
        if (strata) {
          const band = Math.floor((v + faceNoise(u, v, 2, seed + 9) * strata.wobble) / strata.spacing)
          albedo = mix(albedo, strata.colours[mod(band, strata.colours.length)], strata.amount ?? 0.45)
        }
        if (c.edge < 0.45) albedo = scale(albedo, 0.55)
        if (veins) {
          const vein = cells(u, v * 0.6, veins.count ?? 2, seed + 13, false).edge
          if (vein < (veins.width ?? 0.35)) return veins.emit ? { albedo: veins.colour, emit: scale(veins.colour, veins.emit), tag: 'glow', ao } : { albedo: veins.colour, spec: 0.5, shininess: 40, ao }
        }
        return { albedo, spec: 0.1 + gloss, shininess: 16 + gloss * 70, ao }
      },
    }
    return withExtra(material, extra?.(H, seed))
  }
}

// Built walls. kind:
//   panels  – metal or composite panels: seams, bolts, a kick plate and a cap band, optional accent stripe
//   boards  – timber boards (horizontal, or vertical: barn)
//   blocks  – courses of dressed stone or brick, staggered
//   stucco  – smooth plaster over brick, cracked
export function builtWall({
  kind,
  colour,
  dark = scale(colour, 0.6),
  trim = scale(colour, 0.8),
  seed = 1,
  across = 1,
  boardWidth = 4.2,
  vertical = false,
  course = 7,
  blockLength = 12,
  mortar = scale(colour, 0.5),
  stripe = null,
  cap = null,
  gloss = 0.25,
  extra = null,
}) {
  return (H) => {
    const panelWidth = 32 / across
    const kick = Math.min(6, H * 0.14)
    const capBand = Math.min(5, H * 0.1)
    const blockAt = (u, v) => {
      const row = Math.floor(v / course)
      const offset = row % 2 ? blockLength / 2 : 0
      const col = Math.floor((u + offset) / blockLength)
      return { row, col, e: Math.min(mod(u + offset, blockLength), blockLength - mod(u + offset, blockLength), mod(v, course), course - mod(v, course)) }
    }
    const sideHeight = (u, v, face) => {
      let h = bevel(frontOf(u, face), 2, 1.5) + groove(sideOf(u, face), 0.35, 0.3)
      if (kind === 'panels') {
        if (v < kick) h += 0.6 + groove(v - kick, 0.5, 0.5)
        if (v > H - capBand) h += 0.5 + groove(v - (H - capBand), 0.5, 0.5)
        const pu = mod(u, panelWidth)
        h += groove(Math.min(pu, panelWidth - pu), 0.4, 0.5) + groove(v - H * 0.5, 0.4, 0.35)
        for (const bu of [2.2, panelWidth - 2.2]) for (const bv of [kick + 2.2, H - capBand - 2.2]) h += dome(Math.hypot(pu - bu, v - bv), 0.7, 0.4)
      } else if (kind === 'boards') {
        const along = vertical ? u : v
        const w = mod(along, boardWidth)
        h += groove(Math.min(w, boardWidth - w), 0.45, 0.7) + bevel(Math.min(w, boardWidth - w), 0.8, 0.25)
        h += (faceNoise(vertical ? u * 3 : u * 0.3, vertical ? v * 0.3 : v * 3, 32, seed) - 0.5) * 0.3
      } else if (kind === 'blocks') {
        const b = blockAt(u, v)
        h += bevel(b.e, 1.2, 1) + (faceNoise(u, v, 16, seed) - 0.5) * 0.6
      } else if (kind === 'stucco') {
        h += (fbm(faceNoise, u, v, 4, seed, 3) - 0.5) * 0.8 + groove(cells(u, v, 3, seed + 3, false).edge, 0.2, 0.5) * smoothstep(0.6, 0.75, faceNoise(u, v, 2, seed + 4))
      }
      return h
    }
    const material = {
      height(u, v, face) {
        if (face === 'top') return bevel(Math.min(32 - u, 32 - v), 1.6, 1.2) + (tileNoise(u, v, 8, seed) - 0.5) * 0.3
        return sideHeight(u, v, face)
      },
      surface(u, v, face) {
        if (face === 'top') {
          if (cap) return { albedo: scale(cap.colour, 0.92 + tileNoise(u, v, 16, seed) * 0.1), spec: 0.2, shininess: 20 }
          return { albedo: scale(trim, 0.95 + tileNoise(u, v, 8, seed + 1) * 0.1), spec: gloss, shininess: 24 }
        }
        const ao = 0.62 + 0.38 * smoothstep(0, 14, v)
        if (cap && v > H - cap.depth * (0.5 + faceNoise(u, 0, 8, seed + 7))) return { albedo: cap.colour, spec: 0.2, shininess: 20, ao }
        if (stripe && Math.abs(v - stripe.at * H) < stripe.width) {
          if (stripe.hazard) return { albedo: Math.floor((u + v) / 2.2) % 2 ? rgb('#1c1c1a') : rgb('#e0b030'), spec: 0.2, ao }
          return stripe.emit ? { albedo: stripe.colour, emit: scale(stripe.colour, stripe.emit), tag: 'glow' } : { albedo: stripe.colour, spec: 0.3, shininess: 24, ao }
        }
        const wear = fbm(faceNoise, u, v, 4, seed + 2, 3)
        if (kind === 'panels') {
          if (v < kick) return { albedo: scale(dark, 0.9 + wear * 0.15), spec: 0.3, shininess: 28, ao }
          if (v > H - capBand) return { albedo: trim, spec: 0.35, shininess: 28, ao }
          const pu = mod(u, panelWidth)
          const panel = Math.floor(u / panelWidth) + Math.floor(v / (H / 2)) * 3
          return { albedo: scale(colour, (0.9 + hash(panel, 1, seed) * 0.08) * (0.92 + wear * 0.12) * (pu < 0.4 || pu > panelWidth - 0.4 ? 0.6 : 1)), spec: gloss, shininess: 28, ao }
        }
        if (kind === 'boards') {
          const along = vertical ? u : v
          const board = Math.floor(along / boardWidth)
          const w = mod(along, boardWidth)
          if (Math.min(w, boardWidth - w) < 0.4) return { albedo: dark, ao }
          const grain = faceNoise(vertical ? u * 3 : u * 0.25, vertical ? v * 0.25 : v * 3, 32, seed + board)
          return { albedo: scale(mix(colour, scale(colour, 1.2), grain * 0.6), 0.85 + hash(board, 2, seed) * 0.25), spec: 0.15, shininess: 20, ao }
        }
        if (kind === 'blocks') {
          const b = blockAt(u, v)
          if (b.e < 0.5) return { albedo: mortar, ao }
          return { albedo: scale(colour, (0.84 + hash(b.col, b.row, seed) * 0.26) * (0.9 + wear * 0.15)), spec: 0.12, shininess: 18, ao }
        }
        const crack = cells(u, v, 3, seed + 3, false).edge < 0.2 && faceNoise(u, v, 2, seed + 4) > 0.6
        return { albedo: crack ? dark : scale(colour, 0.9 + wear * 0.16), spec: 0.08, shininess: 14, ao }
      },
    }
    return withExtra(material, extra?.(H, seed))
  }
}

// ---------- extras ----------
// Vertical posts and a beam near the top (shoring timber, root ribs).
export const timbers = ({ colour, posts = [3, 27], width = 2.6, beam = true }) => (H) => ({
  height(u, v, face) {
    if (face === 'top') return null
    const post = posts.some((p) => Math.abs(u - p) < width / 2)
    if (post) return 1.4 + (faceNoise(u * 3, v * 0.3, 32, 5) - 0.5) * 0.4
    if (beam && Math.abs(v - (H - 7)) < 2) return 1.2
    return null
  },
  surface(u, v, face) {
    if (face === 'top') return null
    const post = posts.some((p) => Math.abs(u - p) < width / 2)
    if (post || (beam && Math.abs(v - (H - 7)) < 2)) {
      const grain = faceNoise(post ? u * 3 : u * 0.3, post ? v * 0.3 : v * 3, 32, 6)
      return { albedo: scale(colour, 0.8 + grain * 0.35), spec: 0.12, shininess: 18 }
    }
    return null
  },
})

// Wandering vertical strands (vines, roots, glowing root veins). emit: glowing strands.
export const strands = ({ colour, count = 4, width = 1.1, emit = 0, leaves = null, from = 0, seed = 3 }) => () => {
  const at = (u, v) => {
    if (v < from) return null
    for (let i = 0; i < count; i++) {
      const x = ((i + 0.5) / count) * 32 + Math.sin(v * 0.12 + i * 2.1) * 2.4 + (faceNoise(i * 8, v, 8, seed) - 0.5) * 3
      const d = Math.abs(mod(u - x + 16, 32) - 16)
      if (d < width) return d
    }
    return null
  }
  const leaf = (u, v) => leaves && v > from && faceNoise(u, v, 16, seed + 9) > leaves.threshold && at(u, v) == null && faceNoise(u, v, 4, seed + 10) > 0.45
  return {
    height(u, v, face) {
      if (face === 'top') return null
      const d = at(u, v)
      if (d != null) return dome(d, width, 1.2) + 0.5
      if (leaf(u, v)) return 0.9
      return null
    },
    surface(u, v, face) {
      if (face === 'top') return null
      if (at(u, v) != null) return emit ? { albedo: colour, emit: scale(colour, emit), tag: 'glow' } : { albedo: scale(colour, 0.85 + faceNoise(u, v, 32, seed) * 0.3), spec: 0.2, shininess: 20 }
      if (leaf(u, v)) return { albedo: scale(leaves.colour, 0.8 + faceNoise(u, v, 32, seed + 11) * 0.4), spec: 0.15, shininess: 18 }
      return null
    },
  }
}

// Shelf fungi sticking out of the face.
export const shelves = ({ colour, gills, count = 4, seed = 9 }) => (H) => {
  const spots = Array.from({ length: count }, (_, i) => [4 + hash(i, 1, seed) * 24, H * 0.2 + hash(i, 2, seed) * H * 0.65, 2.5 + hash(i, 3, seed) * 2])
  const find = (u, v) => spots.find(([su, sv, r]) => Math.hypot((u - su) * 0.7, (v - sv) * 1.6) < r)
  return {
    height(u, v, face) {
      if (face === 'top') return null
      const s = find(u, v)
      return s ? 1.6 + dome(Math.hypot((u - s[0]) * 0.7, (v - s[1]) * 1.6), s[2], 1.6) : null
    },
    surface(u, v, face) {
      if (face === 'top') return null
      const s = find(u, v)
      if (!s) return null
      return v < s[1] - 0.3 ? { albedo: gills, ao: 0.7 } : { albedo: scale(colour, 0.85 + faceNoise(u, v, 32, seed) * 0.3), spec: 0.3, shininess: 30 }
    },
  }
}

// Drips running down from the top (acid, mineral staining).
export const drips = ({ colour, emit = 0, count = 6, seed = 5 }) => (H) => ({
  height: () => null,
  surface(u, v, face) {
    if (face === 'top') return null
    for (let i = 0; i < count; i++) {
      const x = hash(i, 1, seed) * 32
      const length = H * (0.25 + hash(i, 2, seed) * 0.6)
      const width = 0.7 + hash(i, 3, seed) * 0.8 * (1 - clamp01((H - v) / length))
      if (Math.abs(u - x) < width && v > H - length) return emit ? { albedo: colour, emit: scale(colour, emit), tag: 'glow' } : { albedo: colour, spec: 0.6, shininess: 40 }
    }
    return null
  },
})

// A breach blown through the left face: a jagged hole with glowing, buckled edges.
export const breach = () => (H) => {
  const hole = (u, v) => Math.hypot((u - 15) / 7, (v - H * 0.45) / (H * 0.17)) - 1 + (faceNoise(u, v, 8, 21) - 0.5) * 0.5
  return {
    height(u, v, face) {
      if (face !== 'left') return null
      const d = hole(u, v)
      if (d < 0) return -3
      if (d < 0.25) return 1.2
      return null
    },
    surface(u, v, face) {
      if (face !== 'left') return null
      const d = hole(u, v)
      if (d < -0.1) return { albedo: rgb('#030405') }
      if (d < 0.08) return { albedo: rgb('#ff8a3a'), emit: scale(rgb('#ff6a20'), 0.9), tag: 'glow' }
      if (d < 0.5) return { albedo: rgb('#1a1412'), spec: 0.4, shininess: 30 }
      return null
    },
  }
}

// Stacked supply crates with a lashed tarp across the top course (a camp barricade).
export const crateStack = () => (H) => ({
  height(u, v, face) {
    if (face === 'top') return null
    const w = mod(u, 16)
    const row = mod(v, H / 2)
    return bevel(Math.min(w, 16 - w, row, H / 2 - row), 1, 1.2) + (Math.abs(row - H / 4) < 0.8 ? 0.6 : 0)
  },
  surface(u, v, face) {
    if (face === 'top') return null
    const w = mod(u, 16)
    const row = mod(v, H / 2)
    const box = Math.floor(u / 16) + Math.floor(v / (H / 2)) * 2
    if (Math.min(w, 16 - w, row, H / 2 - row) < 1) return { albedo: rgb('#2c2c18'), spec: 0.3 }
    if (Math.abs(row - H / 4) < 0.8) return { albedo: rgb('#8a8a8a'), spec: 0.6, shininess: 40 }
    if (Math.abs(w - 8) < 2.4 && Math.abs(row - H / 4 - 3) < 1.4 && hash(box, 1, 4) > 0.5) return { albedo: rgb('#e8e0c0') }
    return { albedo: scale(rgb('#6a6c3a'), 0.85 + hash(box, 2, 4) * 0.25 + faceNoise(u, v, 16, 3) * 0.08), spec: 0.2, shininess: 20 }
  },
})
