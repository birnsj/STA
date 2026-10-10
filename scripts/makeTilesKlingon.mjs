// v2 art for the Klingon ship and station tiles: dark gunmetal plating with ribbed, angular bulkheads, red light slits,
// amber-lit deck grates, a command chair on a glowing pedestal, consoles with amber light slits, plasma conduits and a
// red warp core. Same renderer and sizes as the other v2 art (engine.mjs: 256 x 384, walls and tall objects taller),
// written to the Klingon palette-group folder (engine.mjs outFile).
//
// The animated parts (tileEffects.json animations) are drawn dim in the tile's own image; their light layers (art-layers/,
// the lit parts alone at full strength) are what scripts/makeTileFrames.mjs fades in and out over it. Run that after
// this with --only=klingon so only these tiles' frames are baked.
//
// Run with: node scripts/makeTilesKlingon.mjs [--force] [--sheet] [--only=prefix,...]
//   existing files are kept unless --force; --sheet also writes .tmp-sheet.png (a contact sheet) for checking.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'
import { bevel, blockScene, dome, FORCE, floorScene, groove, hash, imageHeightFor, layerFile, mix, outFile, OUT_H, OUT_W, render, renderLights, renderTile, renderTileLights, rgb, scale, smoothstep } from './v2/engine.mjs'
import { box, cylinder, faceNoise, fbm, fbm3, objectScene, tileNoise, torus, writeSheet } from './v2/kit.mjs'

const hex = rgb
const C = 16
const mod = (x, n) => ((x % n) + n) % n
const part = (sdf, mat) => ({ sdf, mat })
const frontOf = (u, face) => (face === 'left' ? 32 - u : u)

// Wall and tall-object height (tiles.json), and the image height that holds it.
const WALL_H = 92
const TALL_IMAGE = imageHeightFor(WALL_H)
// How bright the animated lights are in a tile's own image; the light layers carry the rest.
const DIM = 0.4

// ---------- palette ----------
const GUNMETAL = hex('#3b3431')
const PLATE = hex('#4a3f3a')
const DARK = hex('#1c1817')
const BRONZE = hex('#6a5546')
const RED = hex('#ff3322')
const AMBER = hex('#ffa63a')
const ORANGE = hex('#ff5a1e')
const PEDESTAL = hex('#bfe6ff')
const SCREEN_GREEN = hex('#55f0a0')
const SCREEN_CYAN = hex('#5ad8ff')

// A lit part: full strength in a light layer (lit 1), DIM in the tile's own image.
const lightAt = (colour, strength, tag, lit) => ({ albedo: scale(colour, 0.6 + 0.4 * lit), emit: scale(colour, strength * lit), tag })
const grime = (u, v, seed) => 0.88 + fbm(faceNoise, u, v, 4, seed, 3) * 0.2

// ---------- floors ----------
// Octagonal deck plates on a 16-texel grid with small raised diamonds where four plates meet, brushed along a diagonal.
// The alternate deck has diagonal tread on two of its four plates.
const treadPlate = (u, v, alt) => alt && (Math.floor(u / 16) + Math.floor(v / 16)) % 2 === 0
function deckHeight(u, v, alt = false) {
  const x = mod(u, 16) - 8
  const y = mod(v, 16) - 8
  const oct = Math.max(Math.abs(x), Math.abs(y), (Math.abs(x) + Math.abs(y)) * 0.7)
  const corner = Math.abs(8 - Math.abs(x)) + Math.abs(8 - Math.abs(y))
  if (corner < 2.4) return 0.35 + bevel(2.4 - corner, 0.6, 0.3)
  const tread = treadPlate(u, v, alt) && oct < 5.2 ? groove(mod(u - v, 2) - 0.35, 0.3, 0.25) : 0
  return groove(7.3 - oct, 0.55, 0.8) + groove(5.4 - oct, 0.25, 0.12) + tread
}
function deckSurface(u, v, seed, alt) {
  const x = mod(u, 16) - 8
  const y = mod(v, 16) - 8
  const oct = Math.max(Math.abs(x), Math.abs(y), (Math.abs(x) + Math.abs(y)) * 0.7)
  const corner = Math.abs(8 - Math.abs(x)) + Math.abs(8 - Math.abs(y))
  if (corner < 2.4) return { albedo: scale(BRONZE, 0.85 + tileNoise(u, v, 16, seed) * 0.2), spec: 0.6, shininess: 50 }
  if (oct > 7.0) return { albedo: scale(DARK, 0.7), spec: 0.2, shininess: 20 }
  const plate = hash(Math.floor(u / 16), Math.floor(v / 16), seed + (alt ? 7 : 0))
  const brushed = (tileNoise(u + v, (u - v) * 0.08, 32, seed + 2) - 0.5) * 0.08
  const wear = (fbm(tileNoise, u, v, 4, seed + 3, 3) - 0.5) * 0.16
  if (treadPlate(u, v, alt) && oct < 5.2 && mod(u - v, 2) < 0.7) return { albedo: scale(DARK, 1.3), spec: 0.4, shininess: 36 }
  return { albedo: scale(PLATE, 0.82 + plate * 0.14 + brushed + wear), spec: 0.35, shininess: 34 }
}
const deck = (alt) => ({
  height: (u, v) => deckHeight(u, v, alt),
  surface: (u, v) => deckSurface(u, v, alt ? 113 : 111, alt),
})

// A perforated grate set into a deck frame, amber light glowing up through the holes.
const grate = (lit) => {
  const inGrate = (u, v) => Math.max(Math.abs(u - 16), Math.abs(v - 16)) < 12
  const hole = (u, v) => Math.hypot(mod(u, 2.4) - 1.2, mod(v, 2.4) - 1.2)
  return {
    height(u, v) {
      const edge = 12 - Math.max(Math.abs(u - 16), Math.abs(v - 16))
      if (edge < 0) return deckHeight(u, v)
      if (edge < 1.4) return 0.5 + bevel(edge, 0.6, 0.4)
      return hole(u, v) < 0.75 ? -0.9 : 0
    },
    surface(u, v) {
      if (!inGrate(u, v)) return deckSurface(u, v, 115, false)
      const edge = 12 - Math.max(Math.abs(u - 16), Math.abs(v - 16))
      if (edge < 1.4) return { albedo: scale(BRONZE, 0.8), spec: 0.55, shininess: 44 }
      if (hole(u, v) < 0.75) return lightAt(AMBER, 0.9, 'glow', lit)
      return { albedo: scale(GUNMETAL, 0.75 + tileNoise(u, v, 16, 116) * 0.15), spec: 0.45, shininess: 40 }
    },
  }
}

// ---------- walls ----------
// The Klingon bulkhead: heavy ribs every 16 texels (buttressed at the foot and flared at the top), recessed angular
// panels between them with fine horizontal ribbing, a red light slit under each panel's angled top, a vented kick plate
// and a saw-toothed cap. feature(u, v, face, H, lit): { height?, surface? } over a panel, or null for the plain wall.
function klingonWall({ seed, feature = null }) {
  return (H, lit) => {
    const ribHalf = (v) => 1.8 + Math.max(0, 18 - v) * 0.07 + Math.max(0, v - (H - 16)) * 0.1
    const panelTop = H - 16
    const panelBottom = 9
    const at = (u, v) => {
      const lu = mod(u, 16) - 8
      const fromSeam = 8 - Math.abs(lu)
      const half = 8 - ribHalf(v) - 1
      const chamfer = Math.max(0, v - (panelTop - 6)) * 0.9 + Math.max(0, panelBottom + 4 - v) * 0.9
      const inPanel = v > panelBottom && v < panelTop && Math.abs(lu) < half - chamfer
      return { lu, fromSeam, rib: fromSeam < ribHalf(v), inPanel, panelEdge: half - chamfer - Math.abs(lu) }
    }
    const slit = (u, v) => {
      const { lu, rib } = at(u, v)
      return !rib && Math.abs(v - (panelTop - 9)) < 0.55 && Math.abs(lu) < 3.2
    }
    const base = {
      height(u, v, face) {
        if (face === 'top') return bevel(Math.min(32 - u, 32 - v), 1.6, 1.2) + groove(mod(u + v, 8) - 4, 0.4, 0.4)
        const f = feature?.(u, v, face, H, lit)
        if (f?.height) {
          const h = f.height()
          if (h != null) return h
        }
        let h = bevel(frontOf(u, face), 2, 1.5)
        const { rib, inPanel, panelEdge, fromSeam } = at(u, v)
        if (v > H - 6) h += 0.9 + (mod(u, 4) < 2 ? 0.4 : 0) - groove(v - (H - 6), 0.5, 0.5)
        else if (rib) h += 1.4 + groove(fromSeam, 0.35, 0.6)
        else if (v < 7) h += 0.5 + (Math.abs(mod(v, 2.2) - 1.1) < 0.35 && Math.abs(mod(u, 16) - 8) < 4 ? -0.6 : 0)
        else if (inPanel) h += -0.9 + bevel(panelEdge, 0.8, -0.5) + groove(mod(v, 3) - 1.5, 0.3, 0.15)
        if (slit(u, v)) h -= 0.4
        return h
      },
      surface(u, v, face) {
        if (face === 'top') return { albedo: scale(DARK, 1.1 + tileNoise(u, v, 8, seed) * 0.15), spec: 0.3, shininess: 28 }
        const f = feature?.(u, v, face, H, lit)
        const s = f?.surface?.()
        if (s) return s
        const ao = 0.6 + 0.4 * smoothstep(0, 16, v)
        const g = grime(u, v, seed)
        if (slit(u, v)) return lightAt(RED, 1, 'lights', lit)
        const { rib, inPanel } = at(u, v)
        if (v > H - 6) return { albedo: scale(DARK, 1.2 * g), spec: 0.4, shininess: 34, ao }
        if (rib) return { albedo: scale(BRONZE, 0.62 * g), spec: 0.5, shininess: 40, ao }
        if (v < 7) return { albedo: scale(DARK, g), spec: 0.3, shininess: 26, ao }
        if (inPanel) return { albedo: scale(GUNMETAL, 0.8 * g), spec: 0.35, shininess: 30, ao }
        return { albedo: scale(GUNMETAL, g), spec: 0.4, shininess: 32, ao }
      },
    }
    return base
  }
}

// A Klingon tactical display: angular screen in the upper middle of each panel, a starburst sight or columns of
// readout in green and cyan.
const displayFeature = (u, v, face, H, lit) => {
  const lu = mod(u, 16) - 8
  const panel = Math.floor(mod(u, 32) / 16) + (face === 'left' ? 0 : 2)
  const [v0, v1] = [H * 0.42, H * 0.7]
  const half = 5.2 - Math.max(0, v - (v1 - 3)) * 0.8 - Math.max(0, v0 + 3 - v) * 0.8
  if (v < v0 || v > v1 || Math.abs(lu) > half + 0.9) return null
  const inScreen = Math.abs(lu) < half
  return {
    height: () => (inScreen ? -1.1 : 0.6),
    surface() {
      if (!inScreen) return { albedo: scale(BRONZE, 0.55), spec: 0.5, shininess: 40 }
      const x = lu / 5.2
      const y = ((v - v0) / (v1 - v0)) * 2 - 1
      const hue = panel % 2 ? SCREEN_CYAN : SCREEN_GREEN
      let on = false
      if (panel % 3 === 0) {
        const r = Math.hypot(x, y * 0.9)
        const angle = Math.atan2(y, x)
        on = Math.abs(r - 0.55) < 0.05 || (r < 0.8 && Math.abs(mod(angle + 0.2, Math.PI / 4) - Math.PI / 8) < 0.04) || r < 0.08
      } else if (panel % 3 === 1) {
        on = mod(y * 6, 1) < 0.35 && Math.abs(x) < 0.8 && hash(Math.floor(y * 6), Math.floor((x + 1) * 3), panel) > 0.35
      } else {
        on = Math.abs(y + 0.2 - Math.sin(x * 6 + panel) * 0.35) < 0.07 || Math.abs(y - 0.6) < 0.04
      }
      return on ? lightAt(hue, 0.85, 'screen', lit) : { albedo: hex('#030806'), emit: scale(hue, 0.06 * lit), spec: 0.9, shininess: 90, tag: 'screen' }
    },
  }
}

// Plasma conduits: two glowing tubes running the length of the wall (neighbours join), honeycombed, held by dark rings.
const conduitFeature = (u, v, face, H, lit) => {
  for (const c of [H * 0.32, H * 0.56]) {
    const d = Math.abs(v - c)
    if (d > 4.6) continue
    const ring = mod(u, 8) < 1.6
    return {
      height: () => 1.6 + dome(d, 4.6, ring ? 3.6 : 3),
      surface() {
        if (ring) return { albedo: scale(BRONZE, 0.55), spec: 0.6, shininess: 46 }
        const comb = Math.min(mod(u, 1.6), mod(v + (Math.floor(u / 1.6) % 2) * 0.8, 1.6)) < 0.18
        const core = 1 - d / 4.6
        const colour = mix(ORANGE, hex('#ffd0a0'), core * core * 0.6)
        return comb ? { albedo: scale(ORANGE, 0.3), emit: scale(ORANGE, 0.25 * lit), tag: 'core' } : lightAt(colour, 1, 'core', lit)
      },
    }
  }
  return null
}

// A heavy angular door across the face's middle, split on a diagonal, in a raised frame with amber slits; a red
// warning light above.
const doorFeature = (u, v, face, H, lit) => {
  const x = Math.abs(u - 16)
  const top = H * 0.74
  const half = (vv) => 10 - Math.max(0, vv - (top - 9)) * 0.9
  const inDoor = v < top && x < half(v)
  const inFrame = v < top + 2.4 && x < half(v) + 2.4 && !inDoor
  const warn = Math.abs(v - (top + 6)) < 1.6 && x < 3.4 - Math.abs(v - (top + 6)) * 0.6
  if (warn) return { height: () => 1.2, surface: () => lightAt(RED, 1.1, 'warn', lit) }
  if (inFrame) {
    const slit = Math.abs(x - (half(v) + 1.2)) < 0.4 && v > 8 && v < top - 12
    return {
      height: () => (slit ? 0.9 : 1.6),
      surface: () => (slit ? lightAt(AMBER, 0.9, 'lights', lit) : { albedo: scale(BRONZE, 0.6 * grime(u, v, 7)), spec: 0.5, shininess: 40 }),
    }
  }
  if (!inDoor) return null
  const seam = Math.abs(v - H * 0.36 - (u - 16) * 0.55) < 0.4
  const chevron = Math.abs(mod(v - x * 0.6, 7) - 3.5) < 0.8
  return {
    height: () => (seam ? -0.8 : chevron ? 0.35 : 0),
    surface: () => (seam ? { albedo: hex('#080606') } : { albedo: scale(GUNMETAL, (chevron ? 0.95 : 0.78) * grime(u, v, 9)), spec: 0.45, shininess: 34 }),
  }
}

const bulkhead = klingonWall({ seed: 121 })
const displayWall = klingonWall({ seed: 122, feature: displayFeature })
const conduitWall = klingonWall({ seed: 123, feature: conduitFeature })
const doorWall = klingonWall({ seed: 124, feature: doorFeature })

// ---------- objects ----------
const darkMetal = (colour, seed, { spec = 0.5, shininess = 40 } = {}) => (p) => ({
  albedo: scale(colour, 0.8 + fbm3(p[0] * 0.3, p[1] * 0.3, p[2] * 0.3, seed) * 0.32),
  spec,
  shininess,
})
// An octagonal prism round (C, C): its radius at height z, cut off below z0 and above z1.
const octagon = (p, radius, z0, z1) => {
  const dx = Math.abs(p[0] - C)
  const dy = Math.abs(p[1] - C)
  const side = Math.max(dx, dy, (dx + dy) * Math.SQRT1_2) - radius(p[2])
  return Math.max(side * 0.9, z0 - p[2], p[2] - z1)
}

// A support strut: an octagonal column on a plinth, ribbed, flaring into a capital, with red light slits up the faces
// that face the viewer.
function strut(lit) {
  const plinth = (p) => octagon(p, () => 10, 0, 6)
  const shaft = (p) => octagon(p, (z) => 6.6 - (z - 6) * 0.018, 6, 70)
  const capital = (p) => octagon(p, (z) => 5.4 + (z - 70) * 0.28, 70, 86)
  const cap = (p) => octagon(p, () => 10, 86, WALL_H)
  const metal = darkMetal(GUNMETAL, 131)
  const shaftMat = (p, n) => {
    const facing = n[0] > 0.8 ? p[1] - C : n[1] > 0.8 ? p[0] - C : null
    if (facing !== null && Math.abs(facing) < 0.7 && p[2] > 20 && p[2] < 62) return lightAt(RED, 1, 'lights', lit)
    if (facing !== null && Math.abs(Math.abs(facing) - 3) < 0.45) return { albedo: scale(DARK, 0.9), spec: 0.3 }
    return metal(p, n)
  }
  return objectScene({
    ground: deck(false),
    top: WALL_H,
    parts: [part(plinth, darkMetal(BRONZE, 132)), part(shaft, shaftMat), part(capital, darkMetal(BRONZE, 133)), part(cap, darkMetal(DARK, 134))],
  })
}

// The command chair, facing +y (rotated: +x), towards the viewer: a tall pointed back padded in dark red, angular arms
// with button pads, on a round pedestal whose rim glows blue-white.
function commandChair(lit) {
  const back = (p) => Math.max(box(p, [C, C - 7, 22], [9, 2, 15], 0.8), Math.abs(p[0] - C) * 1.2 + p[2] - 38)
  const seat = (p) => Math.min(box(p, [C, C - 1, 10], [8, 7, 1.8], 1), cylinder(p, C, C - 1, 3, 3, 9))
  const arms = (p) => Math.min(box(p, [C - 9.4, C, 14], [1.6, 6.5, 1.3], 0.5), box(p, [C + 9.4, C, 14], [1.6, 6.5, 1.3], 0.5))
  const fins = (p) => Math.min(box(p, [C - 9.4, C + 5, 11], [1.2, 1.2, 3.2], 0.4), box(p, [C + 9.4, C + 5, 11], [1.2, 1.2, 3.2], 0.4))
  const pedestal = (p) => cylinder(p, C, C, 14, 0, 3.2, 0.6)
  const metal = darkMetal(DARK, 141, { spec: 0.55, shininess: 44 })
  const padded = (p, n) => (n[1] > 0.6 && Math.abs(p[0] - C) < 6.4 && p[2] > 12 && p[2] < 32 - Math.abs(p[0] - C)) || (n[2] > 0.7 && p[2] < 12.5 && Math.abs(p[0] - C) < 6.5)
  const padding = (p, n) => (padded(p, n) ? { albedo: scale(hex('#6a1a14'), 0.85 + fbm3(p[0], p[1], p[2], 142) * 0.3), spec: 0.3, shininess: 24 } : metal(p, n))
  const armPads = (p, n) => (n[2] > 0.7 && p[1] > C + 2 ? (mod(p[1], 1.6) < 0.7 ? { albedo: RED, emit: scale(RED, 0.5), tag: 'buttons' } : { albedo: hex('#151112') }) : metal(p, n))
  const pedestalMat = (p, n) => {
    if (Math.abs(n[2]) < 0.6 && p[2] > 0.9 && p[2] < 2.3) return lightAt(PEDESTAL, 1.2, 'glow', lit)
    if (n[2] > 0.7 && Math.abs(Math.hypot(p[0] - C, p[1] - C) - 11.5) < 0.5) return lightAt(PEDESTAL, 0.7, 'glow', lit)
    return darkMetal(BRONZE, 143)(p, n)
  }
  return objectScene({
    ground: deck(false),
    top: 39,
    parts: [part(pedestal, pedestalMat), part(seat, padding), part(back, padding), part(arms, armPads), part(fins, metal)],
  })
}

// A console running along x (neighbours join into one): an angular body, its sloped top facing +y lined with amber
// light slits and a few red keys, and a raised readout behind.
function klingonConsole(lit) {
  const body = (p) => Math.max(box(p, [C, C - 1, 9], [16, 7, 9], 0.8), p[2] - 18 + (p[1] - (C - 1)) * 0.6)
  const kick = (p) => box(p, [C, C + 4.5, 2], [16, 2.2, 2], 0.3)
  const hood = (p) => Math.max(box(p, [C, C - 7, 21], [16, 1.6, 3.4], 0.5), p[2] - 24 + (p[1] - (C - 7)) * 0.5)
  const metal = darkMetal(GUNMETAL, 151)
  const topMat = (p, n) => {
    if (n[2] < 0.5) return metal(p, n)
    const row = Math.floor(p[1] / 2.2)
    const inSlit = mod(p[1], 2.2) < 0.7 && mod(p[0] + row * 1.7, 6) < 4.2
    if (!inSlit) return { albedo: scale(DARK, 1.1), spec: 0.5, shininess: 44 }
    const key = Math.floor((p[0] + row * 1.7) / 6)
    if (hash(key, row, 152) > 0.82) return { albedo: RED, emit: scale(RED, 0.6), tag: 'keys' }
    return hash(key, row, 153) > 0.25 ? lightAt(AMBER, 0.95, 'lights', lit) : { albedo: hex('#241a12') }
  }
  const hoodMat = (p, n) => {
    if (n[1] > 0.4 && p[2] > 18.5 && p[2] < 23) {
      const x = mod(p[0], 8) / 8
      const y = (p[2] - 18.5) / 4.5
      const on = Math.abs(y - 0.5 - Math.sin(x * 9 + Math.floor(p[0] / 8)) * 0.25) < 0.09 || (mod(x * 8, 1) < 0.15 && y < 0.3)
      return on ? { albedo: SCREEN_GREEN, emit: scale(SCREEN_GREEN, 0.7), tag: 'screen' } : { albedo: hex('#040806'), spec: 0.9, shininess: 80 }
    }
    return metal(p, n)
  }
  return objectScene({
    ground: deck(false),
    top: 25,
    parts: [part(body, topMat), part(kick, darkMetal(DARK, 154)), part(hood, hoodMat)],
  })
}

// The warp core: stepped bronze tiers at the foot and head, a slim glowing column between them in bright bands, a
// collar halfway up, and glowing rims where the column meets the tiers.
function warpCore(lit) {
  const tiers = [
    [0, 5, 13],
    [5, 10, 11],
    [10, 16, 8.5],
    [72, 77, 8.5],
    [77, 84, 11],
    [84, WALL_H, 13],
  ]
  const tierSdf = (p) => Math.min(...tiers.map(([z0, z1, r]) => cylinder(p, C, C, r, z0, z1, 0.6)))
  const column = (p) => cylinder(p, C, C, 2.8, 16, 72)
  const collar = (p) => Math.min(torus(p, C, C, 44, 4.4, 1.1), torus(p, C, C, 30, 4, 0.8), torus(p, C, C, 58, 4, 0.8))
  const struts = (p) => Math.min(...[0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    return box(p, [C + Math.cos(a) * 6.5, C + Math.sin(a) * 6.5, 44], [0.8, 0.8, 28], 0.3)
  }))
  const tierMat = (p, n) => {
    const r = Math.hypot(p[0] - C, p[1] - C)
    if (n[2] > 0.7 && r < 4.2 && (p[2] > 15 && p[2] < 17)) return lightAt(ORANGE, 1.2, 'core', lit)
    if (n[2] < -0.7 && r < 4.2) return lightAt(ORANGE, 1.2, 'core', lit)
    if (Math.abs(n[2]) < 0.5 && Math.abs(mod(p[2], 2.5) - 1.25) < 0.25) return { albedo: scale(DARK, 0.9), spec: 0.3 }
    if (Math.abs(n[2]) < 0.5 && mod(Math.atan2(p[1] - C, p[0] - C) * 4, Math.PI) < 0.35 && p[2] < 10) return lightAt(RED, 0.7, 'core', lit)
    return darkMetal(BRONZE, 161, { spec: 0.6, shininess: 48 })(p, n)
  }
  const columnMat = (p) => {
    const band = Math.abs(mod(p[2], 6) - 3)
    const colour = band < 0.9 ? hex('#ffe6c0') : mix(ORANGE, RED, 0.35)
    return lightAt(colour, band < 0.9 ? 1.5 : 1.1, 'core', lit)
  }
  return objectScene({
    ground: deck(false),
    top: WALL_H,
    parts: [part(tierSdf, tierMat), part(column, columnMat), part(collar, darkMetal(DARK, 162)), part(struts, darkMetal(GUNMETAL, 163))],
  })
}

// An armoured cargo container: chamfered dark bronze box with raised bands, a painted three-bladed mark on its faces
// and a small red status light.
function cargoContainer() {
  const shell = (p) => Math.max(box(p, [C, C, 8.5], [11.5, 9.5, 8.5], 1.2), Math.abs(p[0] - C) + p[2] - 26, Math.abs(p[1] - C) + p[2] - 24)
  const bands = (p) => Math.min(box(p, [C - 6.5, C, 8], [1, 10, 8.2], 0.4), box(p, [C + 6.5, C, 8], [1, 10, 8.2], 0.4))
  const lamp = (p) => box(p, [C + 9, C + 7.5, 15.4], [1, 0.6, 0.5], 0.2)
  const metal = darkMetal(hex('#4a3a2e'), 171)
  const mark = (a, b) => {
    const r = Math.hypot(a, b)
    if (r < 1.2 || r > 4.6) return false
    const angle = Math.atan2(b, a)
    return [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 - (2 * Math.PI) / 3].some((blade) => Math.abs(Math.atan2(Math.sin(angle - blade), Math.cos(angle - blade))) < 0.3 * (1 - (r - 1.2) / 5))
  }
  const shellMat = (p, n) => {
    if (n[1] > 0.8 && mark(p[0] - C, p[2] - 8)) return { albedo: hex('#8a1e16'), spec: 0.25, shininess: 20 }
    if (n[0] > 0.8 && mark(C - p[1], p[2] - 8)) return { albedo: hex('#8a1e16'), spec: 0.25, shininess: 20 }
    return metal(p, n)
  }
  return objectScene({
    ground: deck(false),
    top: 19,
    parts: [part(shell, shellMat), part(bands, darkMetal(DARK, 172)), part(lamp, () => ({ albedo: RED, emit: scale(RED, 0.9), tag: 'status' }))],
  })
}

// ---------- jobs ----------
// A job draws the tile at a light level (DIM for its own image, 1 for a light layer).
const wall = (material) => (lit) => blockScene(WALL_H, material(WALL_H, lit))
const tileImage = (scene, options) => () => renderTile(scene(DIM), TALL_IMAGE, options)
const tileLayer = (scene, tags, options) => () => renderTileLights(scene(1), tags, TALL_IMAGE, { gain: 1.2, ...options })
const object = (scene) => () => render(scene(DIM), { subsamples: 2 })
const objectLayer = (scene, tags) => () => renderLights(scene(1), tags, { gain: 1.2 })
const JOBS = [
  ['klingonDeck.png', () => render(floorScene(deck(false)))],
  ['klingonDeck-alt.png', () => render(floorScene(deck(true)))],
  ['klingonGrate.png', () => render(floorScene(grate(DIM)))],
  ['klingonBulkhead.png', tileImage(wall(bulkhead))],
  ['klingonDisplayWall.png', tileImage(wall(displayWall))],
  ['klingonConduitWall.png', tileImage(wall(conduitWall))],
  ['klingonDoor.png', tileImage(wall(doorWall))],
  ['klingonStrut.png', tileImage(strut, { subsamples: 2 })],
  ['klingonChair.png', object(commandChair)],
  ['klingonConsole.png', object(klingonConsole)],
  ['klingonWarpCore.png', tileImage(warpCore, { subsamples: 2 })],
  ['klingonCrate.png', () => render(cargoContainer(), { subsamples: 2 })],
]
// Light layers (engine.mjs layerFile): the lit parts only, never drawn by the game.
const LAYER_JOBS = [
  ['klingonGrate-glow.png', () => renderLights(floorScene(grate(1)), ['glow'], { gain: 1.1 })],
  ['klingonBulkhead-lights.png', tileLayer(wall(bulkhead), ['lights'])],
  ['klingonDisplayWall-lights.png', tileLayer(wall(displayWall), ['lights'])],
  ['klingonDisplayWall-screen.png', tileLayer(wall(displayWall), ['screen'])],
  ['klingonConduitWall-lights.png', tileLayer(wall(conduitWall), ['lights'])],
  ['klingonConduitWall-core.png', tileLayer(wall(conduitWall), ['core'], { gain: 1.1 })],
  ['klingonDoor-lights.png', tileLayer(wall(doorWall), ['lights'])],
  ['klingonDoor-warn.png', tileLayer(wall(doorWall), ['warn'], { gain: 1.3 })],
  ['klingonStrut-lights.png', tileLayer(strut, ['lights'])],
  ['klingonChair-glow.png', objectLayer(commandChair, ['glow'])],
  ['klingonConsole-lights.png', objectLayer(klingonConsole, ['lights'])],
  ['klingonWarpCore-core.png', tileLayer(warpCore, ['core'], { gain: 1.1 })],
]

const sheet = process.argv.includes('--sheet')
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7).split(',')
const rendered = []
for (const [file, draw, layer] of [...JOBS, ...LAYER_JOBS.map(([file, draw]) => [file, draw, true])]) {
  if (only && !only.some((prefix) => file.startsWith(prefix))) continue
  const target = layer ? layerFile(file) : outFile(file)
  if (fs.existsSync(target) && !FORCE) {
    console.log(`kept   ${file} (already exists)`)
    continue
  }
  // A draw returns a tile image's bytes, or { width, height, bytes } for a taller one (a wall or tall object).
  const drawn = draw()
  const { width = OUT_W, height = OUT_H, bytes = drawn } = drawn.bytes ? drawn : {}
  fs.writeFileSync(target, encodePng(width, height, bytes))
  if (!layer) rendered.push({ id: file, bytes, width, height })
  console.log(`wrote  ${file}`)
}
if (sheet && rendered.length) writeSheet(fileURLToPath(new URL('../.tmp-sheet.png', import.meta.url)), rendered, 6)
