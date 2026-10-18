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

const PROPS = {
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
