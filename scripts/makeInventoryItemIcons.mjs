// 32×32 transparent inventory icons for Technical Manual catalogue items (plan 2026-10-18 / batch-2).
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

function line(bytes, x0, y0, x1, y1, colour, w = 1) {
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0
  let y = y0
  for (;;) {
    for (let oy = -Math.floor(w / 2); oy <= Math.floor(w / 2); oy++) {
      for (let ox = -Math.floor(w / 2); ox <= Math.floor(w / 2); ox++) setPixel(bytes, x + ox, y + oy, colour)
    }
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
}

function blank() {
  return new Uint8Array(ICON * ICON * 4)
}

function inkOf() {
  return hex('#0a0e18')
}

function paddIcon() {
  const bytes = blank()
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
  const bytes = blank()
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
  const bytes = blank()
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
  const bytes = blank()
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
  const bytes = blank()
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
  const bytes = blank()
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
  const bytes = blank()
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
  const bytes = blank()
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
  const bytes = blank()
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
  const bytes = blank()
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
  const bytes = blank()
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
  const bytes = blank()
  const steel = hex('#a0a8b0')
  const grip = hex('#4a3020')
  const ink = inkOf()
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

// --- Batch 2 medical ---
function corticalInhibitorIcon() {
  const bytes = blank()
  const pad = hex('#c8d8e0')
  const node = hex('#60c0e8')
  const ink = inkOf()
  fillCircle(bytes, 16, 14, 8, pad)
  outlineRect(bytes, 10, 8, 22, 20, ink)
  fillCircle(bytes, 16, 14, 3, node)
  fillRect(bytes, 8, 20, 24, 24, hex('#8aa0b0'))
  return bytes
}

function corticalStimulatorIcon() {
  const bytes = blank()
  const body = hex('#e0e8f0')
  const spark = hex('#ffe060')
  const ink = inkOf()
  fillRect(bytes, 10, 8, 22, 20, body)
  outlineRect(bytes, 10, 8, 22, 20, ink)
  fillRect(bytes, 14, 4, 18, 9, spark)
  fillRect(bytes, 12, 21, 20, 26, hex('#5080a0'))
  fillCircle(bytes, 16, 14, 2, spark)
  return bytes
}

function cytoplasmicStimulatorIcon() {
  const bytes = blank()
  const body = hex('#b8e0c8')
  const vial = hex('#40a070')
  const ink = inkOf()
  fillRect(bytes, 11, 6, 21, 24, body)
  outlineRect(bytes, 11, 6, 21, 24, ink)
  fillCircle(bytes, 16, 14, 4, vial)
  fillRect(bytes, 14, 18, 18, 22, hex('#206048'))
  return bytes
}

function dermalStimulatorIcon() {
  const bytes = blank()
  const body = hex('#f0d0c0')
  const wave = hex('#e08060')
  const ink = inkOf()
  fillRect(bytes, 8, 10, 24, 22, body)
  outlineRect(bytes, 8, 10, 24, 22, ink)
  fillRect(bytes, 10, 13, 22, 15, wave)
  fillRect(bytes, 10, 17, 22, 19, wave)
  fillCircle(bytes, 16, 8, 3, hex('#ffb090'))
  return bytes
}

function detronalScannerIcon() {
  const bytes = blank()
  const body = hex('#203040')
  const screen = hex('#80ffe0')
  const ink = inkOf()
  fillRect(bytes, 7, 9, 25, 23, body)
  outlineRect(bytes, 7, 9, 25, 23, ink)
  fillRect(bytes, 9, 11, 18, 20, screen)
  fillRect(bytes, 19, 12, 23, 19, hex('#40a090'))
  fillCircle(bytes, 21, 15, 1, hex('#e0fff0'))
  return bytes
}

function neuralCalipersIcon() {
  const bytes = blank()
  const metal = hex('#a8b0b8')
  const tip = hex('#e0e8f0')
  const ink = inkOf()
  line(bytes, 8, 8, 14, 22, metal, 2)
  line(bytes, 24, 8, 18, 22, metal, 2)
  fillRect(bytes, 13, 20, 19, 26, hex('#304050'))
  fillCircle(bytes, 8, 8, 2, tip)
  fillCircle(bytes, 24, 8, 2, tip)
  outlineRect(bytes, 13, 20, 19, 26, ink)
  return bytes
}

function neuralStimulatorIcon() {
  const bytes = blank()
  const band = hex('#506878')
  const node = hex('#70e0ff')
  const ink = inkOf()
  fillRect(bytes, 6, 12, 26, 18, band)
  outlineRect(bytes, 6, 12, 26, 18, ink)
  fillCircle(bytes, 10, 15, 3, node)
  fillCircle(bytes, 16, 15, 3, node)
  fillCircle(bytes, 22, 15, 3, node)
  return bytes
}

function neuralTransducerIcon() {
  const bytes = blank()
  const body = hex('#687880')
  const cuff = hex('#90c0d0')
  const ink = inkOf()
  fillRect(bytes, 10, 6, 22, 14, body)
  outlineRect(bytes, 10, 6, 22, 14, ink)
  fillRect(bytes, 8, 14, 24, 26, cuff)
  outlineRect(bytes, 8, 14, 24, 26, ink)
  fillRect(bytes, 12, 18, 20, 22, hex('#40a0c0'))
  return bytes
}

function sonicSeparatorIcon() {
  const bytes = blank()
  const body = hex('#e8f0f8')
  const cone = hex('#60a0e0')
  const ink = inkOf()
  fillRect(bytes, 12, 14, 20, 26, body)
  outlineRect(bytes, 12, 14, 20, 26, ink)
  fillRect(bytes, 10, 6, 22, 14, cone)
  fillRect(bytes, 14, 4, 18, 8, hex('#a0d0ff'))
  return bytes
}

function vascularRegeneratorIcon() {
  const bytes = blank()
  const body = hex('#f0e8e8')
  const red = hex('#c03040')
  const ink = inkOf()
  fillRect(bytes, 9, 8, 23, 24, body)
  outlineRect(bytes, 9, 8, 23, 24, ink)
  fillRect(bytes, 12, 11, 14, 21, red)
  fillRect(bytes, 18, 11, 20, 21, red)
  fillRect(bytes, 12, 15, 20, 17, red)
  return bytes
}

function medicalShotgunIcon() {
  const bytes = blank()
  const body = hex('#d8e0e8')
  const stock = hex('#708090')
  const tip = hex('#40a080')
  const ink = inkOf()
  fillRect(bytes, 3, 14, 10, 20, stock)
  fillRect(bytes, 9, 13, 24, 19, body)
  fillRect(bytes, 22, 12, 28, 20, tip)
  outlineRect(bytes, 3, 12, 28, 20, ink)
  fillRect(bytes, 14, 10, 18, 13, hex('#a0c0b0'))
  return bytes
}

// --- Batch 2 engineering ---
function dualiticInverterIcon() {
  const bytes = blank()
  const body = hex('#405060')
  const arrow = hex('#f0c040')
  const ink = inkOf()
  fillRect(bytes, 8, 8, 24, 24, body)
  outlineRect(bytes, 8, 8, 24, 24, ink)
  fillRect(bytes, 11, 14, 21, 18, arrow)
  fillRect(bytes, 18, 11, 22, 21, arrow)
  fillRect(bytes, 10, 11, 14, 21, hex('#40c0e0'))
  return bytes
}

function focalAdjustmentSpannerIcon() {
  const bytes = blank()
  const metal = hex('#c0c8d0')
  const lens = hex('#60e0ff')
  const ink = inkOf()
  fillRect(bytes, 14, 10, 18, 26, hex('#303840'))
  fillCircle(bytes, 16, 9, 6, metal)
  fillCircle(bytes, 16, 9, 3, lens)
  outlineRect(bytes, 14, 14, 18, 26, ink)
  return bytes
}

function graviticCaliperIcon() {
  const bytes = blank()
  const body = hex('#586878')
  const field = hex('#a080e0')
  const ink = inkOf()
  fillRect(bytes, 13, 6, 19, 26, body)
  outlineRect(bytes, 13, 6, 19, 26, ink)
  fillCircle(bytes, 16, 10, 4, field)
  fillRect(bytes, 10, 18, 22, 21, hex('#8060c0'))
  return bytes
}

function ionicFlowRegulatorIcon() {
  const bytes = blank()
  const body = hex('#304850')
  const ion = hex('#40e0a0')
  const ink = inkOf()
  fillRect(bytes, 9, 7, 23, 25, body)
  outlineRect(bytes, 9, 7, 23, 25, ink)
  for (let i = 0; i < 4; i++) fillRect(bytes, 11 + i * 3, 10, 13 + i * 3, 22, ion)
  return bytes
}

function microResonatorIcon() {
  const bytes = blank()
  const body = hex('#808890')
  const tip = hex('#e0e8f0')
  const ink = inkOf()
  fillRect(bytes, 12, 8, 20, 24, body)
  outlineRect(bytes, 12, 8, 20, 24, ink)
  fillCircle(bytes, 16, 10, 4, tip)
  fillRect(bytes, 14, 14, 18, 16, hex('#40a0ff'))
  fillRect(bytes, 14, 18, 18, 20, hex('#40a0ff'))
  return bytes
}

function parametricScannerIcon() {
  const bytes = blank()
  const body = hex('#1a2830')
  const screen = hex('#ffb040')
  const ink = inkOf()
  fillRect(bytes, 6, 8, 26, 24, body)
  outlineRect(bytes, 6, 8, 26, 24, ink)
  fillRect(bytes, 8, 10, 20, 20, screen)
  fillRect(bytes, 21, 11, 24, 19, hex('#c08020'))
  return bytes
}

function phaseModulatorIcon() {
  const bytes = blank()
  const body = hex('#384050')
  const wave = hex('#80ffe0')
  const ink = inkOf()
  fillRect(bytes, 8, 9, 24, 23, body)
  outlineRect(bytes, 8, 9, 24, 23, ink)
  line(bytes, 10, 16, 14, 12, wave, 2)
  line(bytes, 14, 12, 18, 20, wave, 2)
  line(bytes, 18, 20, 22, 14, wave, 2)
  return bytes
}

function selfSealingStemBoltIcon() {
  const bytes = blank()
  const metal = hex('#b0b8c0')
  const head = hex('#d0d8e0')
  const seal = hex('#40a070')
  const ink = inkOf()
  fillRect(bytes, 13, 10, 19, 26, metal)
  fillRect(bytes, 10, 6, 22, 12, head)
  outlineRect(bytes, 10, 6, 22, 12, ink)
  fillRect(bytes, 14, 16, 18, 20, seal)
  return bytes
}

// --- Batch 2 weapons / data / Klingon art ---
function laserPistolIcon() {
  const bytes = blank()
  const body = hex('#c8a050')
  const grip = hex('#604830')
  const emitter = hex('#ff6040')
  const ink = inkOf()
  fillRect(bytes, 8, 16, 14, 26, grip)
  fillRect(bytes, 10, 12, 24, 18, body)
  fillRect(bytes, 22, 11, 27, 19, emitter)
  outlineRect(bytes, 8, 11, 27, 26, ink)
  return bytes
}

function gintakIcon() {
  const bytes = blank()
  const shaft = hex('#6a4a28')
  const blade = hex('#a8b0b8')
  const ink = inkOf()
  fillRect(bytes, 14, 6, 18, 26, shaft)
  fillRect(bytes, 10, 4, 22, 10, blade)
  fillRect(bytes, 12, 2, 20, 6, blade)
  outlineRect(bytes, 14, 10, 18, 26, ink)
  return bytes
}

function kurlethIcon() {
  const bytes = blank()
  const steel = hex('#9098a0')
  const grip = hex('#503020')
  const ink = inkOf()
  for (let a = -40; a <= 100; a += 5) {
    const rad = (a * Math.PI) / 180
    fillCircle(bytes, Math.round(10 + Math.cos(rad) * 10), Math.round(18 + Math.sin(rad) * 8), 2, steel)
  }
  fillRect(bytes, 8, 14, 14, 22, grip)
  fillRect(bytes, 18, 8, 22, 14, grip)
  outlineRect(bytes, 8, 14, 14, 22, ink)
  return bytes
}

function kutluchIcon() {
  const bytes = blank()
  const steel = hex('#b0b8c0')
  const grip = hex('#403020')
  const ink = inkOf()
  fillRect(bytes, 14, 4, 18, 18, steel)
  for (let y = 6; y < 16; y += 3) fillRect(bytes, 17, y, 20, y + 1, steel)
  fillRect(bytes, 13, 18, 19, 26, grip)
  outlineRect(bytes, 13, 18, 19, 26, ink)
  return bytes
}

function meklethIcon() {
  const bytes = blank()
  const steel = hex('#a8b0b8')
  const grip = hex('#4a3020')
  const ink = inkOf()
  for (let a = -90; a <= 90; a += 5) {
    const rad = (a * Math.PI) / 180
    fillCircle(bytes, Math.round(16 + Math.cos(rad) * 9), Math.round(14 + Math.sin(rad) * 7), 2, steel)
  }
  fillRect(bytes, 14, 12, 18, 22, grip)
  outlineRect(bytes, 14, 12, 18, 22, ink)
  return bytes
}

function ushaantorIcon() {
  const bytes = blank()
  const ice = hex('#a0d0e8')
  const grip = hex('#c0c8d0')
  const ink = inkOf()
  fillRect(bytes, 14, 12, 18, 26, grip)
  line(bytes, 8, 8, 16, 14, ice, 3)
  line(bytes, 24, 6, 16, 14, ice, 3)
  fillCircle(bytes, 16, 14, 2, hex('#e0f4ff'))
  outlineRect(bytes, 14, 16, 18, 26, ink)
  return bytes
}

function vulcanLirpaIcon() {
  const bytes = blank()
  const wood = hex('#8a6040')
  const blade = hex('#c0c8d0')
  const fan = hex('#a03030')
  const ink = inkOf()
  fillRect(bytes, 14, 6, 18, 26, wood)
  fillRect(bytes, 8, 4, 24, 10, blade)
  fillRect(bytes, 10, 22, 22, 28, fan)
  outlineRect(bytes, 14, 10, 18, 22, ink)
  return bytes
}

function phaserRifle2255Icon() {
  const bytes = blank()
  const body = hex('#3a4850')
  const stock = hex('#2a3038')
  const emitter = hex('#50c0ff')
  const ink = inkOf()
  fillRect(bytes, 3, 14, 9, 20, stock)
  fillRect(bytes, 8, 13, 22, 19, body)
  fillRect(bytes, 20, 12, 28, 20, emitter)
  fillRect(bytes, 12, 10, 16, 13, hex('#608090'))
  outlineRect(bytes, 3, 12, 28, 20, ink)
  return bytes
}

function isolinearOpticalChipIcon() {
  const bytes = blank()
  const crystal = hex('#60e0ff')
  const frame = hex('#204050')
  const ink = inkOf()
  fillRect(bytes, 10, 6, 22, 26, frame)
  outlineRect(bytes, 10, 6, 22, 26, ink)
  fillRect(bytes, 12, 8, 20, 24, crystal)
  fillRect(bytes, 13, 10, 15, 22, hex('#e0ffff'))
  fillRect(bytes, 17, 10, 19, 22, hex('#2080a0'))
  return bytes
}

function disruptorPistolIcon() {
  const bytes = blank()
  const body = hex('#4a3020')
  const accent = hex('#c04020')
  const emitter = hex('#ff2e1f')
  const ink = inkOf()
  fillRect(bytes, 8, 16, 14, 26, hex('#302018'))
  fillRect(bytes, 10, 11, 22, 18, body)
  fillRect(bytes, 14, 8, 20, 12, accent)
  fillRect(bytes, 20, 10, 27, 18, emitter)
  outlineRect(bytes, 8, 8, 27, 26, ink)
  return bytes
}

function dkTahgIcon() {
  const bytes = blank()
  const steel = hex('#b0b8c0')
  const grip = hex('#503828')
  const ink = inkOf()
  fillRect(bytes, 15, 4, 19, 18, steel)
  fillRect(bytes, 11, 10, 15, 14, steel)
  fillRect(bytes, 19, 10, 23, 14, steel)
  fillRect(bytes, 13, 18, 21, 26, grip)
  outlineRect(bytes, 13, 18, 21, 26, ink)
  return bytes
}

const ICONS = {
  // Batch 1
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
  // Batch 2 medical
  cortical_inhibitor: corticalInhibitorIcon,
  cortical_stimulator: corticalStimulatorIcon,
  cytoplasmic_stimulator: cytoplasmicStimulatorIcon,
  dermal_stimulator: dermalStimulatorIcon,
  detronal_scanner: detronalScannerIcon,
  neural_calipers: neuralCalipersIcon,
  neural_stimulator: neuralStimulatorIcon,
  neural_transducer: neuralTransducerIcon,
  sonic_separator: sonicSeparatorIcon,
  vascular_regenerator: vascularRegeneratorIcon,
  medical_shotgun: medicalShotgunIcon,
  // Batch 2 engineering
  dualitic_inverter: dualiticInverterIcon,
  focal_adjustment_spanner: focalAdjustmentSpannerIcon,
  gravitic_caliper: graviticCaliperIcon,
  ionic_flow_regulator: ionicFlowRegulatorIcon,
  micro_resonator: microResonatorIcon,
  parametric_scanner: parametricScannerIcon,
  phase_modulator: phaseModulatorIcon,
  self_sealing_stem_bolt: selfSealingStemBoltIcon,
  // Batch 2 weapons / data / Klingon art
  laser_pistol_2250: laserPistolIcon,
  gintak: gintakIcon,
  kurleth: kurlethIcon,
  kutluch: kutluchIcon,
  mekleth: meklethIcon,
  ushaantor: ushaantorIcon,
  vulcan_lirpa: vulcanLirpaIcon,
  phaser_rifle_2255: phaserRifle2255Icon,
  isolinear_optical_chip: isolinearOpticalChipIcon,
  disruptor_pistol: disruptorPistolIcon,
  dk_tahg: dkTahgIcon,
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
