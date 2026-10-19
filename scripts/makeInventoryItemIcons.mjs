// 32×32 transparent inventory icons for Technical Manual catalogue items (plan 2026-10-18).
// Distinct silhouette/colour per item. Does not overwrite existing gear icons unless --force.
// Run: node scripts/makeInventoryItemIcons.mjs [--force]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public/art/items')
fs.mkdirSync(OUT, { recursive: true })

const FORCE = process.argv.includes('--force')
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

function fillCircle(bytes, cx, cy, r, colour) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) setPixel(bytes, x, y, colour)
    }
  }
}

function inkOf() {
  return hex('#0a0e18')
}

function paddIcon() {
  const bytes = new Uint8Array(ICON * ICON * 4)
  const body = hex('#2a3848')
  const screen = hex('#6ad8ff')
  const trim = hex('#8aa0b4')
  const ink = inkOf()
  fillRect(bytes, 8, 5, 24, 27, body)
  outlineRect(bytes, 8, 5, 24, 27, ink)
  fillRect(bytes, 10, 7, 22, 20, screen)
  fillRect(bytes, 10, 22, 22, 25, trim)
  return bytes
}

function hypoIcon() {
  const bytes = new Uint8Array(ICON * ICON * 4)
  const body = hex('#c8d0d8')
  const tip = hex('#2a88a8')
  const band = hex('#e8f0f4')
  const ink = inkOf()
  fillRect(bytes, 13, 6, 19, 24, body)
  fillRect(bytes, 13, 4, 19, 7, tip)
  fillRect(bytes, 12, 14, 20, 17, band)
  outlineRect(bytes, 13, 4, 19, 24, ink)
  return bytes
}

function spannerIcon() {
  const bytes = new Uint8Array(ICON * ICON * 4)
  const metal = hex('#c9a024')
  const grip = hex('#2a3038')
  const ink = inkOf()
  fillCircle(bytes, 16, 9, 6, metal)
  fillCircle(bytes, 16, 9, 3, ink)
  fillRect(bytes, 14, 12, 18, 26, grip)
  outlineRect(bytes, 14, 14, 18, 26, ink)
  return bytes
}

function torchIcon() {
  const bytes = new Uint8Array(ICON * ICON * 4)
  const body = hex('#3a4048')
  const flame = hex('#ff9040')
  const band = hex('#c04020')
  const ink = inkOf()
  fillRect(bytes, 12, 10, 20, 26, body)
  fillRect(bytes, 13, 16, 19, 19, band)
  fillRect(bytes, 13, 4, 19, 11, flame)
  outlineRect(bytes, 12, 10, 20, 26, ink)
  return bytes
}

function tridentIcon() {
  const bytes = new Uint8Array(ICON * ICON * 4)
  const body = hex('#1e2830')
  const screen = hex('#50f0b0')
  const trim = hex('#70a0b8')
  const ink = inkOf()
  fillRect(bytes, 7, 8, 25, 24, body)
  outlineRect(bytes, 7, 8, 25, 24, ink)
  fillRect(bytes, 9, 10, 23, 18, screen)
  fillRect(bytes, 10, 20, 14, 22, trim)
  fillRect(bytes, 15, 20, 17, 22, trim)
  fillRect(bytes, 18, 20, 22, 22, trim)
  return bytes
}

function probeIcon() {
  const bytes = new Uint8Array(ICON * ICON * 4)
  const body = hex('#5a6878')
  const tip = hex('#4060a0')
  const ring = hex('#90b0e0')
  const ink = inkOf()
  fillRect(bytes, 14, 8, 18, 26, body)
  fillCircle(bytes, 16, 10, 5, ring)
  fillCircle(bytes, 16, 10, 2, tip)
  fillRect(bytes, 14, 4, 18, 8, tip)
  outlineRect(bytes, 14, 12, 18, 26, ink)
  return bytes
}

function odnIcon() {
  const bytes = new Uint8Array(ICON * ICON * 4)
  const body = hex('#3a4850')
  const fibre = hex('#20a080')
  const glow = hex('#a0e0c0')
  const ink = inkOf()
  fillRect(bytes, 8, 10, 24, 22, body)
  outlineRect(bytes, 8, 10, 24, 22, ink)
  fillRect(bytes, 10, 13, 22, 15, fibre)
  fillRect(bytes, 10, 17, 22, 19, glow)
  return bytes
}

function fluxIcon() {
  const bytes = new Uint8Array(ICON * ICON * 4)
  const body = hex('#484058')
  const gold = hex('#e0c060')
  const trim = hex('#c09040')
  const ink = inkOf()
  fillRect(bytes, 9, 8, 23, 24, body)
  outlineRect(bytes, 9, 8, 23, 24, ink)
  fillRect(bytes, 11, 11, 21, 16, gold)
  fillRect(bytes, 12, 18, 20, 21, trim)
  return bytes
}

function sutureIcon() {
  const bytes = new Uint8Array(ICON * ICON * 4)
  const body = hex('#e8ece8')
  const tip = hex('#a02840')
  const band = hex('#60a080')
  const ink = inkOf()
  fillRect(bytes, 12, 6, 20, 24, body)
  fillRect(bytes, 12, 4, 20, 7, tip)
  fillRect(bytes, 11, 12, 21, 15, band)
  outlineRect(bytes, 12, 4, 20, 24, ink)
  return bytes
}

function osteoIcon() {
  const bytes = new Uint8Array(ICON * ICON * 4)
  const body = hex('#d0d8e0')
  const cross = hex('#4080a0')
  const trim = hex('#5080a0')
  const ink = inkOf()
  fillRect(bytes, 8, 7, 24, 25, body)
  outlineRect(bytes, 8, 7, 24, 25, ink)
  fillRect(bytes, 14, 10, 18, 22, cross)
  fillRect(bytes, 11, 14, 21, 18, cross)
  fillRect(bytes, 9, 8, 23, 10, trim)
  return bytes
}

function rifleIcon() {
  const bytes = new Uint8Array(ICON * ICON * 4)
  const body = hex('#2a3038')
  const stock = hex('#1a1e24')
  const emitter = hex('#ff9040')
  const ink = inkOf()
  fillRect(bytes, 4, 13, 12, 19, stock)
  fillRect(bytes, 10, 14, 26, 18, body)
  fillRect(bytes, 24, 13, 28, 19, emitter)
  outlineRect(bytes, 4, 13, 28, 19, ink)
  return bytes
}

function batlethIcon() {
  const bytes = new Uint8Array(ICON * ICON * 4)
  const steel = hex('#a0a8b0')
  const grip = hex('#4a3020')
  const ink = inkOf()
  // Crescent approx as two arcs of pixels
  for (let a = -110; a <= 110; a += 4) {
    const rad = (a * Math.PI) / 180
    const x = Math.round(16 + Math.cos(rad) * 11)
    const y = Math.round(16 + Math.sin(rad) * 11)
    fillCircle(bytes, x, y, 2, steel)
  }
  fillRect(bytes, 14, 12, 18, 20, grip)
  outlineRect(bytes, 14, 12, 18, 20, ink)
  return bytes
}

const ICONS = {
  starfleet_padd: paddIcon,
  hypospray: hypoIcon,
  hyperspanner: spannerIcon,
  plasma_torch: torchIcon,
  trident_scanner: tridentIcon,
  magnetic_probe: probeIcon,
  odn_recoupler: odnIcon,
  flux_coupler: fluxIcon,
  autosuture: sutureIcon,
  osteogenic_stimulator: osteoIcon,
  phaser_rifle: rifleIcon,
  klingon_batleth: batlethIcon,
}

for (const [id, draw] of Object.entries(ICONS)) {
  const file = path.join(OUT, `${id}.png`)
  if (fs.existsSync(file) && !FORCE) {
    console.log(`kept   items/${id}.png`)
    continue
  }
  fs.writeFileSync(file, encodePng(ICON, ICON, draw()))
  console.log(`wrote  items/${id}.png`)
}
