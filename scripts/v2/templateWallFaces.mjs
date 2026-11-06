// Starship wall face materials for Template Pieces only.
// Copied fitting look from makeTilesV2 WALL_FITTINGS / bulkhead faces — do not import makeTilesV2 (avoids touching tile gen).
import { windowFeature } from './panels.mjs'
import { bevel, dome, groove, hash, inside, noise, rgb, scale, smoothstep } from './engine.mjs'

const STEEL = rgb('#9aa3aa')
const brushed = (u, v, seed, along = 'u') => (along === 'u' ? noise(u * 0.35, v * 5, seed) : noise(u * 5, v * 0.35, seed))
const LCARS = { orange: rgb('#ff9c40'), peach: rgb('#ffcc66'), lilac: rgb('#c9a0dc'), blue: rgb('#99ccff'), red: rgb('#cc6666'), text: rgb('#a8c0ff') }
const GLASS = { albedo: rgb('#04070b'), spec: 0.9, shininess: 80 }
// tag 'lights' marks emission for animation overlays (paintPrismsLightsAA / makeTemplatePieces).
const glowing = (colour, strength = 0.9, tag = 'lights') => ({ albedo: scale(colour, 0.5), emit: scale(colour, strength), tag })
const within = (value, from, to) => value >= from && value <= to

// Same fittings as makeTilesV2 WALL_FITTINGS (base image, not light-layer alt).
const WALL_FITTINGS = {
  lcars: () => ({
    height: (u, z) => {
      const d = inside(u, z, 3, 20, 29, 80)
      return d > 0 ? -0.8 * smoothstep(0, 1, d) : null
    },
    surface(u, z) {
      if (inside(u, z, 3, 20, 29, 80) <= 0) return null
      if (inside(u, z, 3, 20, 29, 80) < 0.7) return { albedo: rgb('#2a3036'), spec: 0.4, shininess: 30 }
      if (within(u, 5, 9) && within(z, 24, 74)) return glowing(LCARS.orange)
      if (within(z, 70, 74)) {
        if (within(u, 5, 18)) return glowing(LCARS.orange)
        if (within(u, 19, 23)) return glowing(LCARS.lilac)
        if (within(u, 24, 27)) return glowing(LCARS.blue)
      }
      if (within(z, 24, 27)) {
        if (within(u, 11, 19)) return glowing(LCARS.peach)
        if (within(u, 20, 27)) return glowing(LCARS.red)
      }
      if (within(u, 21, 27) && within(z, 50, 64)) return glowing(rgb('#335588'), 0.5)
      const row = Math.floor((z - 30) / 3.5)
      const length = 3 + hash(row, 3, 200) * 8
      if (within(z, 30, 64) && (z - 30) % 3.5 < 1.3 && within(u, 11, 11 + length)) return glowing(LCARS.text, 0.6)
      return GLASS
    },
  }),
  conduit: () => {
    const channel = (u, z) => inside(u, z, 10.5, 10, 21.5, 84)
    const box = (u, z) => inside(u, z, 23, 38, 29, 52)
    const clamp = (z) => Math.abs((((z - 16) % 14) + 14) % 14 - 7) > 5.8
    const lights = [
      [26, 41.5, rgb('#60ff90')],
      [26, 45, rgb('#ffb040')],
      [26, 48.5, rgb('#ff5050')],
    ]
    return {
      height(u, z) {
        if (channel(u, z) > 0) {
          if (clamp(z)) return 0.6
          const pipe = Math.min(Math.abs(u - 13), Math.abs(u - 19))
          return pipe < 1.4 ? dome(pipe, 1.4, 1.2) - 1.2 : -1.6
        }
        if (box(u, z) > 0) return 0.8 * smoothstep(0, 0.8, box(u, z))
        return null
      },
      surface(u, z) {
        if (channel(u, z) > 0) {
          if (clamp(z)) return { albedo: STEEL, spec: 0.6, shininess: 40 }
          if (Math.abs(u - 16) < 1.4) return glowing(rgb('#6fc8ff'), 0.8)
          if (Math.min(Math.abs(u - 13), Math.abs(u - 19)) < 1.4) return { albedo: STEEL, spec: 0.7, shininess: 45 }
          return { albedo: rgb('#101418'), ao: 0.5 }
        }
        if (box(u, z) > 0) {
          const light = lights.find(([lu, lz]) => Math.hypot(u - lu, z - lz) < 0.9)
          if (light) return glowing(light[2], light[2] === lights[2][2] ? 0.2 : 0.9)
          return { albedo: rgb('#59636b'), spec: 0.35, shininess: 30 }
        }
        return null
      },
    }
  },
  hatch: () => {
    const hatch = (u, z) => inside(u, z, 7, 11, 25, 37)
    const label = (u, z) => inside(u, z, 9, 41, 23, 45)
    const pad = (u, z) => inside(u, z, 10, 54, 22, 68)
    const handle = (u, z) => Math.hypot(Math.max(0, Math.abs(u - 16) - 4), z - 24)
    const keyColours = [LCARS.orange, LCARS.lilac, LCARS.blue, LCARS.peach]
    return {
      height(u, z) {
        const d = hatch(u, z)
        if (d > 0) return d < 1.6 ? 0.3 : -0.6 + dome(handle(u, z), 0.9, 1.4)
        if (label(u, z) > 0 || pad(u, z) > 0) return 0.4
        return null
      },
      surface(u, z) {
        const d = hatch(u, z)
        if (d > 0) {
          if (d < 1.6) return Math.floor((u + z) / 1.8) % 2 === 0 ? { albedo: rgb('#e0b030'), spec: 0.2, shininess: 18 } : { albedo: rgb('#1c1c1a') }
          if (handle(u, z) < 0.9) return { albedo: STEEL, spec: 0.7, shininess: 45 }
          return { albedo: scale(rgb('#525c64'), Math.abs(z - 30) < 0.4 ? 0.6 : 1), spec: 0.3, shininess: 28 }
        }
        if (label(u, z) > 0) {
          if (Math.hypot(u - 20.5, z - 43) < 0.9) return glowing(rgb('#ff4040'), 0.25)
          if (within(z, 42.4, 43.6) && within(u, 10.5, 17.5)) return glowing(LCARS.peach, 0.5)
          return { albedo: rgb('#15191d'), spec: 0.6, shininess: 50 }
        }
        if (pad(u, z) > 0) {
          const col = Math.floor((u - 11) / 3.6)
          const row = Math.floor((z - 55.5) / 3.6)
          const onKey = col >= 0 && col < 3 && row >= 0 && row < 3 && (u - 11) % 3.6 < 2.6 && (z - 55.5) % 3.6 < 2.4
          if (onKey) return glowing(keyColours[(col + row * 2) % keyColours.length], 0.65)
          return GLASS
        }
        return null
      },
    }
  },
  computer: () => {
    const bank = (u, z) => inside(u, z, 3, 12, 29, 82)
    const shelf = (z) => Math.abs((((z - 12) % 17.5) + 17.5) % 17.5) < 1
    const colours = [rgb('#60ff90'), rgb('#ffb040'), rgb('#40a0ff'), rgb('#ff6060')]
    return {
      height(u, z) {
        const d = bank(u, z)
        if (d <= 0) return null
        return shelf(z) ? 0.4 : -1 * smoothstep(0, 0.8, d)
      },
      surface(u, z) {
        if (bank(u, z) <= 0) return null
        if (shelf(z)) return { albedo: STEEL, spec: 0.6, shininess: 40 }
        const col = Math.floor((u - 5) / 3)
        const row = Math.floor((z - 14) / 2.6)
        const onCell = u >= 5 && u < 28 && (u - 5) % 3 < 1.7 && (z - 14) % 2.6 < 1.1
        if (onCell) {
          const state = hash(col, row, 211)
          const colour = colours[Math.floor(hash(col, row, 212) * colours.length)]
          if (state > 0.5) return glowing(colour, 0.9)
        }
        return { albedo: rgb('#0a0d10'), spec: 0.5, shininess: 40, ao: 0.6 }
      },
    }
  },
}

function windowFitting(drawnHeight) {
  const win = windowFeature(drawnHeight)
  // windowFeature is laid out in panel P 0..64; map single-face u 0..32 across that span.
  return {
    height: (u, z) => win.height(u * 2, z),
    surface(u, z) {
      const sample = win.surface(u * 2, z)
      if (!sample?.emit) return sample
      return { ...sample, tag: 'lights' }
    },
  }
}

// 32-thick Starship wall face: thin-wall top/ends + bulkhead-style long faces, optional fitting (null = plain).
export function starshipWallMaterial(drawnHeight, fitting = null) {
  const H = Math.max(8, drawnHeight)
  return {
    height(u, v, face) {
      if (face === 'top') {
        const edge = Math.min(u, 32 - u)
        return bevel(edge, 1.4, 1.1) + groove(edge - 0.9, 0.35, 0.25)
      }
      if (face === 'end') {
        const e = Math.min(u, 32 - u, v, H - v)
        return bevel(e, 1.2, 0.9)
      }
      const fitted = fitting?.height?.(u, v, face) ?? fitting?.height?.(u, v)
      if (fitted != null) {
        const front = face === 'left' ? 32 - u : u
        return fitted + bevel(front, 2.2, 1.6) + groove(face === 'left' ? u : 32 - u, 0.35, 0.3)
      }
      let h = 0
      if (v < 7) h += 0.6 + groove(v - 7, 0.6, 0.6)
      if (v > H - 6) h += 0.5 + groove(v - (H - 6), 0.6, 0.5)
      const panel = inside(u, v, 2.5, 11, 29.5, H - 10)
      if (panel > 0) h -= 0.6 * smoothstep(0, 1.2, panel)
      if (H > 40) h += groove(v - H * 0.52, 0.5, 0.35)
      h += groove(u, 0.35, 0.3) + groove(32 - u, 0.35, 0.3)
      return h
    },
    surface(u, v, face) {
      if (face === 'top') return { albedo: scale(rgb('#7d8a94'), 0.92 + noise(u / 6, v / 6, 71) * 0.1), spec: 0.25, shininess: 22 }
      // Brush across the thickness (along u), not up the wall — vertical grain looked like a stretched front edge.
      if (face === 'end') return { albedo: scale(rgb('#6a767f'), 0.9 + brushed(u, v, 74, 'u') * 0.1), spec: 0.28, shininess: 26 }
      const z = v
      const ao = 0.62 + 0.38 * smoothstep(0, 16, z)
      const fitted = fitting?.surface?.(u, z, face) ?? fitting?.surface?.(u, z)
      if (fitted) return { ao, ...fitted }
      if (H > 40 && Math.abs(z - (H - 3.4)) < 0.9) return { albedo: rgb('#dff0ff'), emit: scale(rgb('#bfe2ff'), 0.55) }
      if (H > 40 && Math.abs(z - 8.6) < 0.55) return { albedo: rgb('#9fd0ff'), emit: scale(rgb('#7fc0ff'), 0.4) }
      if (z < 7) return { albedo: rgb('#3c444b'), spec: 0.3, shininess: 30, ao }
      if (z > H - 6) return { albedo: rgb('#8d99a2'), spec: 0.35, shininess: 30, ao }
      if (H > 40 && Math.abs(z - (H - 8.5)) < 1) return { albedo: rgb('#c8883a'), spec: 0.2, shininess: 20, ao }
      const base = inside(u, z, 2.5, 11, 29.5, H - 10) > 0 ? rgb('#66747f') : rgb('#717f8a')
      return { albedo: scale(base, 0.9 + brushed(u, z, face === 'left' ? 72 : 73, 'v') * 0.12), spec: 0.3, shininess: 28, ao }
    },
  }
}

/** @returns {null | object} fitting for a Starship wall face id */
export function fittingForFace(face, height) {
  if (!face || face === 'plain') return null
  if (face === 'window') return windowFitting(height)
  const make = WALL_FITTINGS[face]
  return make ? make() : null
}

export const STARSHIP_WALL_FACES = ['plain', 'window', 'lcars', 'conduit', 'hatch', 'computer']
