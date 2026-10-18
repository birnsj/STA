// Placeholder inventory icons + world props for clothing items that previously all pointed at uniform.png
// (so swapping suits looked like the icon never changed). Does not overwrite uniform.png.
// Run: node scripts/makeClothingItemArt.mjs [--force]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'
import { FORCE, OUT_H, OUT_W, bevel, blockScene, dome, inside, noise, render, rgb, scale, smoothstep } from './v2/engine.mjs'

const STEEL = rgb('#8a96a2')
function brushed(u, z, seed) {
  return noise(u / 2.4, seed * 0.1, seed) * 0.5 + noise(u / 0.7, seed * 0.2, seed + 3) * 0.5
}
function caseMaterial({ H, body, trim, accent, topMark = null }) {
  return {
    height(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 1, 1, 31, 31)
        let h = bevel(e, 1.2, 0.9)
        if (e > 2.5) h -= 0.35 * smoothstep(2.5, 3.5, e)
        if (topMark) {
          const r = Math.hypot(u - 16, v - 16)
          if (r < topMark.r) h += dome(r, topMark.r, topMark.h)
        }
        return h
      }
      const z = v
      let h = bevel(Math.min(u, 32 - u, z, H - z), 1, 0.85)
      if (inside(u, z, 3, 2.5, 29, H - 2.5) > 0) h -= 0.4
      return h
    },
    surface(u, v, face) {
      if (face === 'top') {
        if (topMark) {
          const r = Math.hypot(u - 16, v - 16)
          if (r < topMark.r) return { albedo: STEEL, spec: 0.55, shininess: 36 }
        }
        return { albedo: scale(body, 0.92 + noise(u / 5, v / 5, 41) * 0.1), spec: 0.22, shininess: 22 }
      }
      const z = v
      const ao = 0.68 + 0.32 * smoothstep(0, 6, z)
      if (u < 3.2 || u > 28.8) return { albedo: trim, spec: 0.45, shininess: 30, ao }
      if (accent && z > H * 0.35 && z < H * 0.55) return { albedo: accent, spec: 0.25, shininess: 22, ao }
      return { albedo: scale(body, 0.9 + brushed(u, z, 44) * 0.1), spec: 0.22, shininess: 20, ao }
    },
  }
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ICON_OUT = path.join(ROOT, 'public/art/items')
const WORLD_OUT = path.join(ROOT, 'public/art/sprites/environment/items')
fs.mkdirSync(ICON_OUT, { recursive: true })
fs.mkdirSync(WORLD_OUT, { recursive: true })

const ICON = 32
const hex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16))

function setPixel(bytes, x, y, colour, alpha = 255) {
  if (x < 0 || y < 0 || x >= ICON || y >= ICON) return
  const i = (y * ICON + x) * 4
  bytes[i] = colour[0]
  bytes[i + 1] = colour[1]
  bytes[i + 2] = colour[2]
  bytes[i + 3] = alpha
}

function fillRect(bytes, x0, y0, x1, y1, colour) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) setPixel(bytes, x, y, colour)
}

function outlineRect(bytes, x0, y0, x1, y1, colour) {
  for (let x = x0; x < x1; x++) {
    setPixel(bytes, x, y0, colour)
    setPixel(bytes, x, y1 - 1, colour)
  }
  for (let y = y0; y < y1; y++) {
    setPixel(bytes, x0, y, colour)
    setPixel(bytes, x1 - 1, y, colour)
  }
}

// Flat front-view outfit icon (same silhouette as uniform.png): tunic + trousers, distinct colours per suit.
function clothingIcon({ tunic, trousers, cuff, accent = null, vest = false }) {
  const bytes = new Uint8Array(ICON * ICON * 4)
  const ink = hex('#0a0e18')
  const tunicRgb = hex(tunic)
  const trousersRgb = hex(trousers)
  const cuffRgb = hex(cuff)
  const accentRgb = accent ? hex(accent) : null
  // Trousers
  fillRect(bytes, 11, 20, 21, 28, trousersRgb)
  fillRect(bytes, 11, 27, 15, 29, trousersRgb)
  fillRect(bytes, 17, 27, 21, 29, trousersRgb)
  // Tunic / vest
  if (vest) {
    fillRect(bytes, 10, 8, 22, 21, tunicRgb)
    if (accentRgb) fillRect(bytes, 14, 10, 18, 18, accentRgb)
  } else {
    fillRect(bytes, 9, 7, 23, 21, tunicRgb)
    fillRect(bytes, 6, 9, 10, 18, tunicRgb)
    fillRect(bytes, 22, 9, 26, 18, tunicRgb)
    fillRect(bytes, 6, 17, 9, 19, cuffRgb)
    fillRect(bytes, 23, 17, 26, 19, cuffRgb)
    if (accentRgb) fillRect(bytes, 9, 12, 23, 15, accentRgb)
  }
  // Neck
  fillRect(bytes, 14, 6, 18, 8, cuffRgb)
  // Outline
  outlineRect(bytes, 9, 7, 23, 21, ink)
  outlineRect(bytes, 11, 20, 21, 28, ink)
  setPixel(bytes, 15, 6, ink)
  setPixel(bytes, 16, 6, ink)
  return bytes
}

const ICONS = {
  environment_suit: () => clothingIcon({ tunic: '#c8d4e0', trousers: '#3a4554', cuff: '#1a222c', accent: '#5fd0ff' }),
  thermal_suit: () => clothingIcon({ tunic: '#e07030', trousers: '#3a2818', cuff: '#1a120c', accent: '#ffc060' }),
  armoured_vest: () => clothingIcon({ tunic: '#5a6470', trousers: '#2a3038', cuff: '#12161c', accent: '#8a949e', vest: true }),
}

function writeIcon(id, draw) {
  const file = path.join(ICON_OUT, `${id}.png`)
  if (fs.existsSync(file) && !FORCE) {
    console.log(`kept   items/${id}.png`)
    return
  }
  fs.writeFileSync(file, encodePng(ICON, ICON, draw()))
  console.log(`wrote  items/${id}.png`)
}

for (const [id, draw] of Object.entries(ICONS)) writeIcon(id, draw)

// World props: folded gear cases in category colours (inventory still uses the flat icons above).
const WORLD = {
  environmentSuit: () =>
    render(
      blockScene(
        10,
        caseMaterial({
          H: 10,
          body: rgb('#c8d4e0'),
          trim: rgb('#3a4554'),
          accent: rgb('#5fd0ff'),
          topMark: { r: 3, h: 0.6 },
        }),
      ),
    ),
  thermalSuit: () =>
    render(
      blockScene(
        10,
        caseMaterial({
          H: 10,
          body: rgb('#e07030'),
          trim: rgb('#3a2818'),
          accent: rgb('#ffc060'),
          topMark: { r: 3, h: 0.6 },
        }),
      ),
    ),
  armouredVest: () =>
    render(
      blockScene(
        9,
        caseMaterial({
          H: 9,
          body: rgb('#5a6470'),
          trim: rgb('#12161c'),
          accent: rgb('#8a949e'),
          topMark: { r: 2.5, h: 0.5 },
        }),
      ),
    ),
  clothing: () =>
    render(
      blockScene(
        9,
        caseMaterial({
          H: 9,
          body: rgb('#f2b52c'),
          trim: rgb('#2a3038'),
          accent: rgb('#1a222c'),
          topMark: { r: 2.5, h: 0.5 },
        }),
      ),
    ),
}

for (const [id, draw] of Object.entries(WORLD)) {
  const file = path.join(WORLD_OUT, `${id}.png`)
  if (fs.existsSync(file) && !FORCE) {
    console.log(`kept   sprites/items/${id}.png`)
    continue
  }
  fs.writeFileSync(file, encodePng(OUT_W, OUT_H, draw()))
  console.log(`wrote  sprites/items/${id}.png`)
}
