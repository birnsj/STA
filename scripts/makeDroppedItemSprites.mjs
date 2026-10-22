// Isometric world props for inventory items dropped in exploration (64×96 design grid, like makeTilesV2.mjs).
// Drawn at item.worldScale on the board so handheld gear stays smaller than characters (~40×64 frames).
// Writes to public/art/sprites/environment/items/. Inventory UI icons stay under public/art/items/.
//
// Run with: node scripts/makeDroppedItemSprites.mjs [--force]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'
import {
  FORCE,
  OUT_H,
  OUT_W,
  bevel,
  blockScene,
  dome,
  inside,
  noise,
  render,
  rgb,
  scale,
  smoothstep,
} from './v2/engine.mjs'

const OUT = fileURLToPath(new URL('../public/art/sprites/environment/items/', import.meta.url))
fs.mkdirSync(OUT, { recursive: true })

function brushed(u, z, seed) {
  return noise(u / 2.4, seed * 0.1, seed) * 0.5 + noise(u / 0.7, seed * 0.2, seed + 3) * 0.5
}

const STEEL = rgb('#8a96a2')

function caseMaterial({ H, body, trim, accent, topMark = null, screen = null }) {
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
        if (screen) {
          const r = Math.hypot(u - 16, v - 16)
          if (r < screen.r) return { albedo: scale(screen.colour, 0.55), emit: scale(screen.colour, 0.85), tag: 'screen' }
          if (r < screen.r + 1.2) return { albedo: rgb('#0a1218'), spec: 0.7, shininess: 50 }
        }
        if (topMark?.cross) {
          const onCross = Math.abs(u - 16) < 1.4 || Math.abs(v - 16) < 1.4
          const inBadge = Math.hypot(u - 16, v - 16) < topMark.r
          if (inBadge && onCross) return { albedo: rgb('#f2f2f2'), spec: 0.25, shininess: 22 }
          if (inBadge) return { albedo: topMark.colour, spec: 0.2, shininess: 20 }
        }
        if (topMark && !topMark.cross) {
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

function phaserMaterial() {
  const H = 8
  const body = rgb('#2a3038')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 4, 8, 28, 24)
        let h = bevel(e, 1, 0.7)
        if (e > 0) h += 0.6 * smoothstep(0, 2, e)
        return Math.max(0, h)
      }
      const z = v
      const e = Math.min(u - 4, 28 - u, z, H - z)
      return bevel(e, 0.9, 0.7)
    },
    surface(u, v, face) {
      if (face === 'top') {
        if (inside(u, v, 6, 10, 18, 22) > 0) return { albedo: rgb('#1a1e24'), spec: 0.55, shininess: 40 }
        if (inside(u, v, 18, 12, 26, 20) > 0) return { albedo: rgb('#3a424c'), spec: 0.4, shininess: 30 }
        return { albedo: body, spec: 0.3, shininess: 24 }
      }
      const z = v
      const ao = 0.7 + 0.3 * smoothstep(0, 5, z)
      if (face === 'right' && z > 2 && z < 6 && u > 10 && u < 22) {
        return { albedo: rgb('#402010'), emit: rgb('#ff9040'), tag: 'emitter' }
      }
      return { albedo: scale(body, 0.9 + brushed(u, z, 51) * 0.08), spec: 0.35, shininess: 28, ao }
    },
  }
}

function communicatorMaterial() {
  const H = 6
  const gold = rgb('#c9a24a')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 6, 8, 26, 24)
        let h = bevel(e, 1, 0.6)
        const hinge = Math.abs(v - 16)
        if (hinge < 0.8 && u > 8 && u < 24) h += 0.5
        return h
      }
      return bevel(Math.min(u - 6, 26 - u, v, H - v), 0.8, 0.6)
    },
    surface(u, v, face) {
      if (face === 'top') {
        if (Math.abs(v - 16) < 0.9 && u > 8 && u < 24) return { albedo: rgb('#6a5428'), spec: 0.5, shininess: 34 }
        if (v < 15 && inside(u, v, 9, 9, 23, 14) > 0) {
          const grill = ((u * 3) | 0) % 2 === 0
          return { albedo: grill ? rgb('#1a1814') : gold, spec: 0.35, shininess: 28 }
        }
        return { albedo: scale(gold, 0.92 + noise(u / 4, v / 4, 61) * 0.08), spec: 0.55, shininess: 40 }
      }
      const ao = 0.72 + 0.28 * smoothstep(0, 4, v)
      return { albedo: scale(gold, 0.88 + brushed(u, v, 62) * 0.1), spec: 0.5, shininess: 36, ao }
    },
  }
}

// Stacking-test boxes. At worldScale 0.5 the floor diamond is 32px wide (four per tile).
// The block is 8px tall — under the 16px step to the cell behind — so that cell stays visible.
// stackSize.height matches that top.
function stackBoxMaterial(colour, stripe, H) {
  const body = rgb(colour)
  const band = rgb(stripe)
  return {
    height(u, v, face) {
      if (face === 'top') return bevel(inside(u, v, 0.4, 0.4, 31.6, 31.6), 1.4, 0.9)
      return bevel(Math.min(u, 32 - u, v, H - v), 1.1, 0.85)
    },
    surface(u, v, face) {
      if (face === 'top') {
        const cross = Math.abs(u - 16) < 1.6 || Math.abs(v - 16) < 1.6
        return { albedo: cross ? band : body, spec: 0.28, shininess: 20 }
      }
      const ao = 0.66 + 0.34 * smoothstep(0, 8, v)
      const mid = v > H * 0.42 && v < H * 0.58
      return { albedo: mid ? band : body, spec: 0.2, shininess: 16, ao }
    },
  }
}

const PROPS = {
  stackBoxRed: () => render(blockScene(16, stackBoxMaterial('#c4382c', '#f0d070', 16))),
  stackBoxBlue: () => render(blockScene(16, stackBoxMaterial('#2a6ec4', '#d8e8ff', 16))),
  stackBoxGreen: () => render(blockScene(16, stackBoxMaterial('#2e8a48', '#d8f0c8', 16))),
  stackBoxGold: () => render(blockScene(16, stackBoxMaterial('#d0a030', '#fff0c0', 16))),
  stackSlabWhite: () => render(blockScene(16, stackBoxMaterial('#e4e8ee', '#8aa0b8', 16))),
  stackSlabBlack: () => render(blockScene(16, stackBoxMaterial('#2a3038', '#c8a050', 16))),
  medkit: () =>
    render(
      blockScene(
        10,
        caseMaterial({
          H: 10,
          body: rgb('#a02828'),
          trim: rgb('#5a1818'),
          accent: rgb('#e8e8e8'),
          topMark: { r: 5.5, h: 0.4, colour: rgb('#b02020'), cross: true },
        }),
      ),
    ),
  phaser: () => render(blockScene(8, phaserMaterial()), { bloom: 1.05 }),
  tricorder: () =>
    render(
      blockScene(
        8,
        caseMaterial({
          H: 8,
          body: rgb('#1c222a'),
          trim: rgb('#6a7888'),
          accent: rgb('#3a90c0'),
          screen: { r: 5.2, colour: rgb('#5fd0ff') },
        }),
      ),
      { bloom: 1.1 },
    ),
  communicator: () => render(blockScene(6, communicatorMaterial())),
  toolkit: () =>
    render(
      blockScene(
        11,
        caseMaterial({
          H: 11,
          body: rgb('#c9a024'),
          trim: rgb('#2a2a2a'),
          accent: rgb('#1a1a1a'),
          topMark: { r: 2.2, h: 0.8 },
        }),
      ),
    ),
  missionObject: () =>
    render(
      blockScene(
        12,
        caseMaterial({
          H: 12,
          body: rgb('#1a3048'),
          trim: rgb('#6ad0e0'),
          accent: rgb('#40a0c0'),
          screen: { r: 4.5, colour: rgb('#80f0ff') },
          topMark: { r: 2, h: 1.2 },
        }),
      ),
      { bloom: 1.25 },
    ),

  // Technical Manual catalogue props (plan 2026-10-18) — unique silhouette/material each.
  starfleetPadd: () =>
    render(
      blockScene(
        5,
        caseMaterial({
          H: 5,
          body: rgb('#2a3848'),
          trim: rgb('#8aa0b4'),
          accent: rgb('#3a88c0'),
          screen: { r: 7.5, colour: rgb('#6ad8ff') },
        }),
      ),
      { bloom: 1.12 },
    ),
  hypospray: () => render(blockScene(7, cylinderToolMaterial({ body: rgb('#c8d0d8'), tip: rgb('#2a88a8'), band: rgb('#e8f0f4') }))),
  hyperspanner: () => render(blockScene(8, wrenchMaterial({ body: rgb('#c9a024'), grip: rgb('#2a3038') }))),
  plasmaTorch: () => render(blockScene(9, torchMaterial()), { bloom: 1.2 }),
  tridentScanner: () =>
    render(
      blockScene(
        8,
        caseMaterial({
          H: 8,
          body: rgb('#1e2830'),
          trim: rgb('#70a0b8'),
          accent: rgb('#40c090'),
          screen: { r: 4.2, colour: rgb('#50f0b0') },
          topMark: { r: 2.4, h: 0.9 },
        }),
      ),
      { bloom: 1.1 },
    ),
  magneticProbe: () => render(blockScene(7, probeMaterial({ body: rgb('#5a6878'), tip: rgb('#4060a0'), ring: rgb('#90b0e0') }))),
  odnRecoupler: () =>
    render(
      blockScene(
        7,
        caseMaterial({
          H: 7,
          body: rgb('#3a4850'),
          trim: rgb('#20a080'),
          accent: rgb('#a0e0c0'),
          topMark: { r: 3.5, h: 0.6 },
        }),
      ),
    ),
  fluxCoupler: () =>
    render(
      blockScene(
        8,
        caseMaterial({
          H: 8,
          body: rgb('#484058'),
          trim: rgb('#c09040'),
          accent: rgb('#e0c060'),
          screen: { r: 3.8, colour: rgb('#ffd060') },
        }),
      ),
      { bloom: 1.08 },
    ),
  autosuture: () => render(blockScene(6, cylinderToolMaterial({ body: rgb('#e8ece8'), tip: rgb('#a02840'), band: rgb('#60a080') }))),
  osteogenicStimulator: () =>
    render(
      blockScene(
        8,
        caseMaterial({
          H: 8,
          body: rgb('#d0d8e0'),
          trim: rgb('#5080a0'),
          accent: rgb('#80c0e0'),
          topMark: { r: 4.5, h: 0.5, colour: rgb('#4080a0'), cross: true },
        }),
      ),
    ),
  phaserRifle: () => render(blockScene(10, rifleMaterial()), { bloom: 1.08 }),
  klingonBatleth: () => render(blockScene(9, batlethMaterial())),

  // Batch 2 (plan 2026-10-18 equipment expansion)
  corticalInhibitor: () =>
    render(blockScene(6, caseMaterial({ H: 6, body: rgb('#c8d8e0'), trim: rgb('#8aa0b0'), accent: rgb('#60c0e8'), topMark: { r: 3.2, h: 0.7 } })), {
      bloom: 1.08,
    }),
  corticalStimulator: () =>
    render(blockScene(7, caseMaterial({ H: 7, body: rgb('#e0e8f0'), trim: rgb('#5080a0'), accent: rgb('#ffe060'), screen: { r: 3.5, colour: rgb('#ffe060') } })), {
      bloom: 1.12,
    }),
  cytoplasmicStimulator: () =>
    render(blockScene(7, cylinderToolMaterial({ body: rgb('#b8e0c8'), tip: rgb('#40a070'), band: rgb('#206048') }))),
  dermalStimulator: () =>
    render(blockScene(6, caseMaterial({ H: 6, body: rgb('#f0d0c0'), trim: rgb('#e08060'), accent: rgb('#ffb090'), topMark: { r: 3, h: 0.5 } }))),
  detronalScanner: () =>
    render(
      blockScene(8, caseMaterial({ H: 8, body: rgb('#203040'), trim: rgb('#40a090'), accent: rgb('#80ffe0'), screen: { r: 5, colour: rgb('#80ffe0') } })),
      { bloom: 1.1 },
    ),
  neuralCalipers: () => render(blockScene(7, caliperMaterial())),
  neuralStimulator: () =>
    render(blockScene(5, caseMaterial({ H: 5, body: rgb('#506878'), trim: rgb('#70e0ff'), accent: rgb('#70e0ff'), topMark: { r: 2.5, h: 0.4 } })), {
      bloom: 1.08,
    }),
  neuralTransducer: () =>
    render(blockScene(8, caseMaterial({ H: 8, body: rgb('#687880'), trim: rgb('#90c0d0'), accent: rgb('#40a0c0'), topMark: { r: 3.5, h: 0.6 } }))),
  sonicSeparator: () => render(blockScene(8, coneToolMaterial({ body: rgb('#e8f0f8'), cone: rgb('#60a0e0'), tip: rgb('#a0d0ff') })), { bloom: 1.1 }),
  vascularRegenerator: () =>
    render(blockScene(7, caseMaterial({ H: 7, body: rgb('#f0e8e8'), trim: rgb('#c03040'), accent: rgb('#c03040'), topMark: { r: 3, h: 0.5, colour: rgb('#c03040') } }))),
  medicalShotgun: () => render(blockScene(10, shotgunMaterial()), { bloom: 1.06 }),
  dualiticInverter: () =>
    render(blockScene(8, caseMaterial({ H: 8, body: rgb('#405060'), trim: rgb('#f0c040'), accent: rgb('#40c0e0'), screen: { r: 3.5, colour: rgb('#f0c040') } }))),
  focalAdjustmentSpanner: () => render(blockScene(8, wrenchMaterial({ body: rgb('#c0c8d0'), grip: rgb('#303840') })), { bloom: 1.05 }),
  graviticCaliper: () => render(blockScene(7, probeMaterial({ body: rgb('#586878'), tip: rgb('#a080e0'), ring: rgb('#8060c0') })), { bloom: 1.1 }),
  ionicFlowRegulator: () =>
    render(blockScene(8, caseMaterial({ H: 8, body: rgb('#304850'), trim: rgb('#40e0a0'), accent: rgb('#40e0a0'), screen: { r: 4, colour: rgb('#40e0a0') } })), {
      bloom: 1.08,
    }),
  microResonator: () => render(blockScene(7, probeMaterial({ body: rgb('#808890'), tip: rgb('#e0e8f0'), ring: rgb('#40a0ff') }))),
  parametricScanner: () =>
    render(
      blockScene(8, caseMaterial({ H: 8, body: rgb('#1a2830'), trim: rgb('#c08020'), accent: rgb('#ffb040'), screen: { r: 5, colour: rgb('#ffb040') } })),
      { bloom: 1.1 },
    ),
  phaseModulator: () =>
    render(blockScene(7, caseMaterial({ H: 7, body: rgb('#384050'), trim: rgb('#80ffe0'), accent: rgb('#80ffe0'), screen: { r: 3.8, colour: rgb('#80ffe0') } })), {
      bloom: 1.1,
    }),
  selfSealingStemBolt: () => render(blockScene(6, boltMaterial())),
  laserPistol2250: () => render(blockScene(8, laserPistolMaterial()), { bloom: 1.08 }),
  gintak: () => render(blockScene(11, spearMaterial())),
  kurleth: () => render(blockScene(9, curvedBladeMaterial({ large: true }))),
  kutluch: () => render(blockScene(7, daggerMaterial({ serrated: true }))),
  mekleth: () => render(blockScene(8, curvedBladeMaterial({ large: false }))),
  ushaantor: () => render(blockScene(8, ushaanMaterial())),
  vulcanLirpa: () => render(blockScene(11, lirpaMaterial())),
  phaserRifle2255: () => render(blockScene(10, rifle2255Material()), { bloom: 1.1 }),
  isolinearOpticalChip: () =>
    render(blockScene(4, caseMaterial({ H: 4, body: rgb('#204050'), trim: rgb('#60e0ff'), accent: rgb('#e0ffff'), screen: { r: 4.5, colour: rgb('#60e0ff') } })), {
      bloom: 1.2,
    }),
  disruptorPistol: () => render(blockScene(8, disruptorPistolMaterial()), { bloom: 1.08 }),
  dkTahg: () => render(blockScene(7, daggerMaterial({ serrated: false }))),
}

function cylinderToolMaterial({ body, tip, band }) {
  const H = 7
  return {
    height(u, v, face) {
      if (face === 'top') {
        const r = Math.hypot(u - 16, v - 16)
        return r < 5.5 ? bevel(5.5 - r, 1, 0.8) : 0
      }
      const z = v
      const r = Math.abs(u - 16)
      if (r > 5.5) return 0
      return bevel(Math.min(5.5 - r, z, H - z), 0.8, 0.7)
    },
    surface(u, v, face) {
      if (face === 'top') {
        const r = Math.hypot(u - 16, v - 16)
        if (r < 2.2) return { albedo: tip, spec: 0.55, shininess: 40 }
        if (r < 4) return { albedo: band, spec: 0.35, shininess: 28 }
        return { albedo: body, spec: 0.4, shininess: 32 }
      }
      const z = v
      const ao = 0.7 + 0.3 * smoothstep(0, 4, z)
      if (z > H * 0.7) return { albedo: tip, spec: 0.5, shininess: 36, ao }
      if (z > H * 0.45 && z < H * 0.58) return { albedo: band, spec: 0.3, shininess: 24, ao }
      return { albedo: scale(body, 0.9 + brushed(u, z, 71) * 0.1), spec: 0.35, shininess: 28, ao }
    },
  }
}

function wrenchMaterial({ body, grip }) {
  const H = 8
  return {
    height(u, v, face) {
      if (face === 'top') {
        const shaft = inside(u, v, 13, 4, 19, 28)
        const head = Math.hypot(u - 16, v - 8) < 7 ? 1 : 0
        let h = 0
        if (shaft > 0) h = bevel(shaft, 1, 0.7)
        if (head) h = Math.max(h, bevel(7 - Math.hypot(u - 16, v - 8), 1.2, 0.8))
        return h
      }
      const z = v
      const onShaft = u > 13 && u < 19
      const onHead = Math.hypot(u - 16, 0) < 7 && z < 4
      if (!onShaft && !onHead) return 0
      return bevel(Math.min(onHead ? 7 - Math.abs(u - 16) : Math.min(u - 13, 19 - u), z, H - z), 0.8, 0.7)
    },
    surface(u, v, face) {
      if (face === 'top') {
        if (v > 20) return { albedo: grip, spec: 0.25, shininess: 18 }
        return { albedo: scale(body, 0.92 + brushed(u, v, 81) * 0.08), spec: 0.5, shininess: 36 }
      }
      const ao = 0.7 + 0.3 * smoothstep(0, 5, v)
      if (v > 5) return { albedo: grip, spec: 0.2, shininess: 16, ao }
      return { albedo: body, spec: 0.45, shininess: 32, ao }
    },
  }
}

function torchMaterial() {
  const H = 9
  const body = rgb('#3a4048')
  const nozzle = rgb('#8a9098')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const shaft = inside(u, v, 12, 6, 20, 26)
        let h = bevel(shaft, 1, 0.7)
        if (inside(u, v, 13, 4, 19, 8) > 0) h += 0.8
        return Math.max(0, h)
      }
      const z = v
      if (u < 12 || u > 20) return 0
      return bevel(Math.min(u - 12, 20 - u, z, H - z), 0.9, 0.7)
    },
    surface(u, v, face) {
      if (face === 'top') {
        if (v < 8) return { albedo: nozzle, emit: rgb('#ff9040'), tag: 'emitter', spec: 0.4, shininess: 30 }
        if (v > 18 && v < 22) return { albedo: rgb('#c04020'), spec: 0.3, shininess: 22 }
        return { albedo: body, spec: 0.35, shininess: 26 }
      }
      const ao = 0.68 + 0.32 * smoothstep(0, 5, v)
      if (v > 6.5) return { albedo: nozzle, emit: rgb('#ff7030'), tag: 'emitter', spec: 0.4, shininess: 28, ao }
      return { albedo: scale(body, 0.9 + brushed(u, v, 91) * 0.08), spec: 0.3, shininess: 24, ao }
    },
  }
}

function probeMaterial({ body, tip, ring }) {
  const H = 7
  return {
    height(u, v, face) {
      if (face === 'top') {
        const shaft = inside(u, v, 14, 5, 18, 27)
        const disc = Math.hypot(u - 16, v - 10) < 6 ? 1 : 0
        let h = 0
        if (shaft > 0) h = bevel(shaft, 0.8, 0.6)
        if (disc) h = Math.max(h, bevel(6 - Math.hypot(u - 16, v - 10), 1, 0.7) * 0.7)
        return h
      }
      const z = v
      if (u < 14 || u > 18) {
        if (Math.hypot(u - 16, 0) < 6 && z < 3) return bevel(6 - Math.abs(u - 16), 0.8, 0.6)
        return 0
      }
      return bevel(Math.min(u - 14, 18 - u, z, H - z), 0.7, 0.6)
    },
    surface(u, v, face) {
      if (face === 'top') {
        if (Math.hypot(u - 16, v - 10) < 5) return { albedo: ring, spec: 0.55, shininess: 40 }
        if (v < 8) return { albedo: tip, emit: scale(tip, 0.4), tag: 'emitter', spec: 0.4, shininess: 30 }
        return { albedo: body, spec: 0.35, shininess: 26 }
      }
      const ao = 0.7 + 0.3 * smoothstep(0, 4, v)
      if (v > 5) return { albedo: tip, spec: 0.45, shininess: 34, ao }
      return { albedo: body, spec: 0.3, shininess: 24, ao }
    },
  }
}

function rifleMaterial() {
  const H = 10
  const body = rgb('#2a3038')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const barrel = inside(u, v, 6, 12, 28, 20)
        const stock = inside(u, v, 2, 11, 10, 21)
        let h = 0
        if (barrel > 0) h = bevel(barrel, 1, 0.7) + 0.4 * smoothstep(0, 2, barrel)
        if (stock > 0) h = Math.max(h, bevel(stock, 1, 0.7))
        return Math.max(0, h)
      }
      const z = v
      const onBarrel = u > 6 && u < 28 && z > 2 && z < H - 2
      const onStock = u > 2 && u < 10
      if (!onBarrel && !onStock) return 0
      return bevel(Math.min(onStock ? Math.min(u - 2, 10 - u) : Math.min(u - 6, 28 - u), z, H - z), 0.9, 0.7)
    },
    surface(u, v, face) {
      if (face === 'top') {
        if (inside(u, v, 22, 13, 27, 19) > 0) return { albedo: rgb('#402010'), emit: rgb('#ff9040'), tag: 'emitter' }
        if (u < 10) return { albedo: rgb('#1a1e24'), spec: 0.4, shininess: 28 }
        return { albedo: body, spec: 0.35, shininess: 26 }
      }
      const ao = 0.7 + 0.3 * smoothstep(0, 5, v)
      if (face === 'right' && u > 20) return { albedo: rgb('#402010'), emit: rgb('#ff8040'), tag: 'emitter', ao }
      return { albedo: scale(body, 0.9 + brushed(u, v, 101) * 0.08), spec: 0.35, shininess: 28, ao }
    },
  }
}

function batlethMaterial() {
  const H = 9
  const steel = rgb('#a0a8b0')
  const grip = rgb('#4a3020')
  return {
    height(u, v, face) {
      if (face === 'top') {
        // Crescent blade: thick arc with a central grip bar.
        const dx = u - 16
        const dy = v - 16
        const r = Math.hypot(dx, dy)
        const ang = Math.atan2(dy, dx)
        const onArc = r > 8 && r < 14 && ang > -2.4 && ang < 2.4
        const onGrip = Math.abs(dx) < 2.2 && Math.abs(dy) < 6
        let h = 0
        if (onArc) h = bevel(Math.min(r - 8, 14 - r), 1.2, 0.85)
        if (onGrip) h = Math.max(h, bevel(Math.min(2.2 - Math.abs(dx), 6 - Math.abs(dy)), 0.8, 0.7))
        return h
      }
      const z = v
      const dx = u - 16
      const onGrip = Math.abs(dx) < 2.5
      const onBlade = Math.abs(dx) > 4 && Math.abs(dx) < 14
      if (!onGrip && !onBlade) return 0
      return bevel(Math.min(onGrip ? 2.5 - Math.abs(dx) : 14 - Math.abs(dx), z, H - z), 0.8, 0.7)
    },
    surface(u, v, face) {
      if (face === 'top') {
        if (Math.abs(u - 16) < 2.2 && Math.abs(v - 16) < 6) return { albedo: grip, spec: 0.2, shininess: 16 }
        return { albedo: scale(steel, 0.9 + brushed(u, v, 111) * 0.12), spec: 0.6, shininess: 42 }
      }
      const ao = 0.68 + 0.32 * smoothstep(0, 5, v)
      if (Math.abs(u - 16) < 2.5) return { albedo: grip, spec: 0.2, shininess: 14, ao }
      return { albedo: steel, spec: 0.55, shininess: 38, ao }
    },
  }
}

function caliperMaterial() {
  const H = 7
  const metal = rgb('#a8b0b8')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const left = Math.abs(u - 10) < 1.5 && v > 6 && v < 24
        const right = Math.abs(u - 22) < 1.5 && v > 6 && v < 24
        const base = inside(u, v, 12, 20, 20, 26)
        let h = 0
        if (left || right) h = 0.9
        if (base > 0) h = Math.max(h, bevel(base, 0.8, 0.6))
        return h
      }
      return bevel(Math.min(Math.abs(u - 16) < 8 ? 3 : 0, v, H - v), 0.7, 0.6)
    },
    surface(u, v, face) {
      if (face === 'top' && v > 20) return { albedo: rgb('#304050'), spec: 0.3, shininess: 22 }
      return { albedo: metal, spec: 0.55, shininess: 36 }
    },
  }
}

function coneToolMaterial({ body, cone, tip }) {
  const H = 8
  return {
    height(u, v, face) {
      if (face === 'top') {
        const shaft = inside(u, v, 12, 14, 20, 26)
        const head = inside(u, v, 10, 4, 22, 14)
        let h = 0
        if (shaft > 0) h = bevel(shaft, 1, 0.7)
        if (head > 0) h = Math.max(h, bevel(head, 1.2, 0.8))
        return h
      }
      if (u < 10 || u > 22) return 0
      return bevel(Math.min(u - 10, 22 - u, v, H - v), 0.8, 0.7)
    },
    surface(u, v, face) {
      if (face === 'top') {
        if (v < 8) return { albedo: tip, emit: scale(tip, 0.35), tag: 'emitter', spec: 0.4, shininess: 30 }
        if (v < 14) return { albedo: cone, spec: 0.45, shininess: 32 }
        return { albedo: body, spec: 0.35, shininess: 26 }
      }
      return { albedo: body, spec: 0.3, shininess: 24, ao: 0.75 }
    },
  }
}

function shotgunMaterial() {
  const H = 10
  const body = rgb('#d8e0e8')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const barrel = inside(u, v, 8, 12, 28, 20)
        const stock = inside(u, v, 2, 13, 10, 21)
        let h = 0
        if (barrel > 0) h = bevel(barrel, 1, 0.7)
        if (stock > 0) h = Math.max(h, bevel(stock, 1, 0.7))
        return h
      }
      const on = (u > 2 && u < 28 && v > 1 && v < H - 1)
      return on ? bevel(Math.min(u - 2, 28 - u, v, H - v), 0.9, 0.7) : 0
    },
    surface(u, v, face) {
      if (face === 'top') {
        if (u > 22) return { albedo: rgb('#40a080'), emit: rgb('#60c0a0'), tag: 'emitter', spec: 0.4, shininess: 30 }
        if (u < 10) return { albedo: rgb('#708090'), spec: 0.35, shininess: 26 }
        return { albedo: body, spec: 0.4, shininess: 28 }
      }
      return { albedo: body, spec: 0.35, shininess: 26, ao: 0.72 }
    },
  }
}

function boltMaterial() {
  const H = 6
  const metal = rgb('#b0b8c0')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const shaft = inside(u, v, 13, 10, 19, 26)
        const head = inside(u, v, 10, 6, 22, 12)
        let h = 0
        if (shaft > 0) h = bevel(shaft, 0.8, 0.6)
        if (head > 0) h = Math.max(h, bevel(head, 1, 0.7))
        return h
      }
      if (u < 10 || u > 22) return 0
      return bevel(Math.min(u - 10, 22 - u, v, H - v), 0.7, 0.6)
    },
    surface(u, v, face) {
      if (face === 'top' && v < 12) return { albedo: rgb('#d0d8e0'), spec: 0.55, shininess: 38 }
      if (face === 'top' && Math.abs(u - 16) < 2 && v > 15 && v < 20) return { albedo: rgb('#40a070'), spec: 0.3, shininess: 22 }
      return { albedo: metal, spec: 0.5, shininess: 34 }
    },
  }
}

function laserPistolMaterial() {
  const H = 8
  const body = rgb('#c8a050')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const barrel = inside(u, v, 10, 10, 26, 20)
        const grip = inside(u, v, 8, 16, 14, 26)
        let h = 0
        if (barrel > 0) h = bevel(barrel, 1, 0.7)
        if (grip > 0) h = Math.max(h, bevel(grip, 0.9, 0.7))
        return h
      }
      return bevel(Math.min(u - 8, 26 - u, v, H - v), 0.8, 0.7)
    },
    surface(u, v, face) {
      if (face === 'top') {
        if (u > 22) return { albedo: rgb('#ff6040'), emit: rgb('#ff8040'), tag: 'emitter' }
        if (v > 18) return { albedo: rgb('#604830'), spec: 0.25, shininess: 18 }
        return { albedo: body, spec: 0.5, shininess: 36 }
      }
      return { albedo: body, spec: 0.45, shininess: 32, ao: 0.72 }
    },
  }
}

function spearMaterial() {
  const H = 11
  const shaft = rgb('#6a4a28')
  const blade = rgb('#a8b0b8')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const pole = inside(u, v, 14, 8, 18, 28)
        const tip = inside(u, v, 10, 2, 22, 10)
        let h = 0
        if (pole > 0) h = bevel(pole, 0.8, 0.6)
        if (tip > 0) h = Math.max(h, bevel(tip, 1.1, 0.8))
        return h
      }
      if (Math.abs(u - 16) > 6) return 0
      return bevel(Math.min(6 - Math.abs(u - 16), v, H - v), 0.8, 0.7)
    },
    surface(u, v, face) {
      if (face === 'top' && v < 10) return { albedo: blade, spec: 0.6, shininess: 40 }
      return { albedo: shaft, spec: 0.25, shininess: 18 }
    },
  }
}

function curvedBladeMaterial({ large }) {
  const H = large ? 9 : 8
  const steel = rgb('#9098a0')
  const grip = rgb('#503020')
  const radius = large ? 11 : 9
  return {
    height(u, v, face) {
      if (face === 'top') {
        const dx = u - (large ? 12 : 14)
        const dy = v - 16
        const r = Math.hypot(dx, dy)
        const ang = Math.atan2(dy, dx)
        const onArc = r > radius - 3 && r < radius + 2 && ang > -1.2 && ang < 2
        const onGrip = Math.abs(u - 12) < 2.5 && Math.abs(v - 16) < 5
        let h = 0
        if (onArc) h = bevel(2.5 - Math.abs(r - radius), 1, 0.8)
        if (onGrip) h = Math.max(h, 0.9)
        return h
      }
      return bevel(Math.min(8 - Math.abs(u - 16), v, H - v), 0.8, 0.7)
    },
    surface(u, v, face) {
      if (face === 'top' && Math.abs(u - 12) < 2.5 && Math.abs(v - 16) < 5) return { albedo: grip, spec: 0.2, shininess: 16 }
      return { albedo: scale(steel, 0.92 + brushed(u, v, 121) * 0.1), spec: 0.55, shininess: 38 }
    },
  }
}

function daggerMaterial({ serrated }) {
  const H = 7
  const steel = rgb('#b0b8c0')
  const grip = rgb('#503828')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const blade = inside(u, v, 14, 4, 18, 18)
        const guard = serrated ? inside(u, v, 11, 10, 21, 14) : inside(u, v, 12, 10, 20, 14)
        const hilt = inside(u, v, 13, 18, 19, 26)
        let h = 0
        if (blade > 0) h = bevel(blade, 0.9, 0.7)
        if (guard > 0) h = Math.max(h, bevel(guard, 0.8, 0.6))
        if (hilt > 0) h = Math.max(h, bevel(hilt, 0.8, 0.6))
        return h
      }
      if (u < 11 || u > 21) return 0
      return bevel(Math.min(u - 11, 21 - u, v, H - v), 0.7, 0.6)
    },
    surface(u, v, face) {
      if (face === 'top' && v > 18) return { albedo: grip, spec: 0.2, shininess: 16 }
      if (serrated && face === 'top' && u > 17 && v > 6 && v < 16) return { albedo: rgb('#9098a0'), spec: 0.5, shininess: 34 }
      return { albedo: steel, spec: 0.55, shininess: 38 }
    },
  }
}

function ushaanMaterial() {
  const H = 8
  const ice = rgb('#a0d0e8')
  const grip = rgb('#c0c8d0')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const hilt = inside(u, v, 14, 14, 18, 26)
        const left = Math.abs((u - 10) + (v - 10)) < 2 && u < 16 && v < 16
        const right = Math.abs((u - 22) - (v - 8)) < 2 && u > 16 && v < 16
        let h = 0
        if (hilt > 0) h = bevel(hilt, 0.8, 0.6)
        if (left || right) h = Math.max(h, 1)
        return h
      }
      return bevel(Math.min(6 - Math.abs(u - 16), v, H - v), 0.8, 0.7)
    },
    surface(u, v, face) {
      if (face === 'top' && v > 16) return { albedo: grip, spec: 0.35, shininess: 26 }
      return { albedo: ice, emit: scale(ice, 0.2), tag: 'emitter', spec: 0.5, shininess: 36 }
    },
  }
}

function lirpaMaterial() {
  const H = 11
  const wood = rgb('#8a6040')
  const blade = rgb('#c0c8d0')
  const fan = rgb('#a03030')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const pole = inside(u, v, 14, 6, 18, 26)
        const top = inside(u, v, 8, 2, 24, 10)
        const bottom = inside(u, v, 10, 22, 22, 28)
        let h = 0
        if (pole > 0) h = bevel(pole, 0.8, 0.6)
        if (top > 0) h = Math.max(h, bevel(top, 1, 0.7))
        if (bottom > 0) h = Math.max(h, bevel(bottom, 1, 0.7))
        return h
      }
      if (Math.abs(u - 16) > 8) return 0
      return bevel(Math.min(8 - Math.abs(u - 16), v, H - v), 0.8, 0.7)
    },
    surface(u, v, face) {
      if (face === 'top' && v < 10) return { albedo: blade, spec: 0.55, shininess: 38 }
      if (face === 'top' && v > 22) return { albedo: fan, spec: 0.3, shininess: 22 }
      return { albedo: wood, spec: 0.25, shininess: 18 }
    },
  }
}

function rifle2255Material() {
  const H = 10
  const body = rgb('#3a4850')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const barrel = inside(u, v, 8, 12, 28, 20)
        const stock = inside(u, v, 2, 13, 10, 21)
        const sight = inside(u, v, 12, 9, 16, 13)
        let h = 0
        if (barrel > 0) h = bevel(barrel, 1, 0.7)
        if (stock > 0) h = Math.max(h, bevel(stock, 1, 0.7))
        if (sight > 0) h = Math.max(h, 1.1)
        return h
      }
      const on = u > 2 && u < 28
      return on ? bevel(Math.min(u - 2, 28 - u, v, H - v), 0.9, 0.7) : 0
    },
    surface(u, v, face) {
      if (face === 'top') {
        if (u > 22) return { albedo: rgb('#206080'), emit: rgb('#50c0ff'), tag: 'emitter' }
        if (u < 10) return { albedo: rgb('#2a3038'), spec: 0.35, shininess: 26 }
        return { albedo: body, spec: 0.4, shininess: 28 }
      }
      return { albedo: body, spec: 0.35, shininess: 26, ao: 0.72 }
    },
  }
}

function disruptorPistolMaterial() {
  const H = 8
  const body = rgb('#4a3020')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const barrel = inside(u, v, 10, 10, 26, 18)
        const grip = inside(u, v, 8, 16, 14, 26)
        const hood = inside(u, v, 14, 7, 20, 12)
        let h = 0
        if (barrel > 0) h = bevel(barrel, 1, 0.7)
        if (grip > 0) h = Math.max(h, bevel(grip, 0.9, 0.7))
        if (hood > 0) h = Math.max(h, 1.1)
        return h
      }
      return bevel(Math.min(u - 8, 26 - u, v, H - v), 0.8, 0.7)
    },
    surface(u, v, face) {
      if (face === 'top') {
        if (u > 20) return { albedo: rgb('#ff2e1f'), emit: rgb('#ff4a32'), tag: 'emitter' }
        if (v < 12) return { albedo: rgb('#c04020'), spec: 0.4, shininess: 28 }
        if (v > 18) return { albedo: rgb('#302018'), spec: 0.25, shininess: 18 }
        return { albedo: body, spec: 0.35, shininess: 26 }
      }
      return { albedo: body, spec: 0.3, shininess: 24, ao: 0.72 }
    },
  }
}

for (const [id, draw] of Object.entries(PROPS)) {
  const file = path.join(OUT, `${id}.png`)
  if (fs.existsSync(file) && !FORCE) {
    console.log(`kept   items/${id}.png`)
    continue
  }
  const bytes = draw()
  fs.writeFileSync(file, encodePng(OUT_W, OUT_H, bytes))
  console.log(`wrote  items/${id}.png`)
}
