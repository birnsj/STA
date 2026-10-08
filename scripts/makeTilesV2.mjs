// v2 art for the Starship & Station tiles, written to their palette-group folder (engine.mjs outFile).
// Run with: node scripts/makeTilesV2.mjs   (existing files are kept unless --force is passed)
//
// A 64 x 96 design grid with the 64 x 32 floor diamond across the bottom (taller for walls, engine.mjs imageHeightFor),
// rendered RESOLUTION times larger with anti-aliasing; the map views draw every image at its design size, so the extra
// pixels become detail. Each surface is a small material: a height map (grooves, bevels,
// rivets, pipes, vents) that is lit by a key and fill light with specular highlights, plus an emission colour that
// gets a bloom pass. Light comes from the top left as in the original tiles.
import fs from 'node:fs'
import { encodePng } from './png.mjs'
import { fittingFeature, onPanelFace, panelScene, renderPanel, renderPanelLights, windowFeature } from './v2/panels.mjs'

import { RESOLUTION, OUT_W, OUT_H, outFile, layerFile, FORCE, rgb, mix, scale, clamp01, smoothstep, hash, noise, bevel, groove, dome, inside, iso, inUnit, floorScene, blockScene, imageHeightFor, render, renderBig, renderBigLights, renderLights, renderTile, renderTileLights } from './v2/engine.mjs'

// ---------- materials ----------
const STEEL = rgb('#9aa3aa')
const brushed = (u, v, seed, along = 'u') => (along === 'u' ? noise(u * 0.35, v * 5, seed) : noise(u * 5, v * 0.35, seed))

// Deck plating: one plate per tile with bevelled seams, an inset line, corner rivets and brushed, lightly worn metal.
// The alt tile alternates with the plain one in a checkerboard, so it differs only in tint and wear.
function deckPlating({ tint, seed }) {
  const rivets = [[3.2, 3.2], [28.8, 3.2], [3.2, 28.8], [28.8, 28.8]]
  return {
    height(u, v) {
      const e = inside(u, v, 0, 0, 32, 32)
      let h = bevel(e, 1.8, 1.4) + groove(e - 6.5, 0.55, 0.45)
      for (const [ru, rv] of rivets) h += dome(Math.hypot(u - ru, v - rv), 0.95, 0.55)
      return h
    },
    surface(u, v) {
      const e = inside(u, v, 0, 0, 32, 32)
      let albedo = scale(tint, 0.88 + brushed(u, v, seed) * 0.12 + noise(u / 7, v / 7, seed + 3) * 0.1)
      if (e < 1) albedo = scale(albedo, 0.45)
      else if (Math.abs(e - 6.5) < 0.45) albedo = scale(albedo, 0.65)
      if (rivets.some(([ru, rv]) => Math.hypot(u - ru, v - rv) < 0.95)) return { albedo: STEEL, spec: 0.7, shininess: 40 }
      return { albedo, spec: 0.3, shininess: 26 }
    },
  }
}

const AMBER = rgb('#f0b030')
function doorwayPlate() {
  const lights = [[16, 1.9], [30.1, 16], [16, 30.1], [1.9, 16]]
  return {
    height(u, v) {
      const e = inside(u, v, 0, 0, 32, 32)
      let h = bevel(e, 1.5, 1.2)
      if (e >= 3.5 && e < 7) h -= 0.6
      if (e >= 8.5) h += 0.35 + groove(((u % 2.6) + 2.6) % 2.6 - 1.3, 0.5, 0.3)
      return h
    },
    surface(u, v) {
      const e = inside(u, v, 0, 0, 32, 32)
      const lit = lights.find(([lu, lv]) => Math.hypot(u - lu, v - lv) < 1.1)
      if (lit) return { albedo: rgb('#fff0c0'), emit: scale(AMBER, 1.1) }
      if (e >= 3.5 && e < 7) {
        const stripe = Math.floor((u + v * 2) / 3.2) % 2 === 0
        return { albedo: stripe ? rgb('#d8a030') : rgb('#1e1e1c'), spec: 0.15, shininess: 18 }
      }
      const base = rgb('#4a5c66')
      return { albedo: scale(base, (e < 1 ? 0.5 : 1) * (0.9 + brushed(u, v, 51) * 0.1)), spec: 0.3, shininess: 26 }
    },
  }
}

function gratingPlate({ live }) {
  const barAt = (u, v) => {
    const along = Math.abs((((v - 1) % 4) + 4) % 4 - 2)
    return Math.min(along, Math.abs(u - 16) * 0.7)
  }
  return {
    height(u, v) {
      const e = inside(u, v, 0, 0, 32, 32)
      if (e < 4.5) return bevel(e, 1.4, 1.1) + groove(e - 4.5, 0.7, 0.8)
      const bar = barAt(u, v)
      return bar < 0.8 ? dome(bar, 0.8, 0.8) - 0.2 : -4
    },
    surface(u, v) {
      const e = inside(u, v, 0, 0, 32, 32)
      if (e < 4.5) return { albedo: scale(rgb('#5f5b4c'), 0.9 + brushed(u, v, 61) * 0.15), spec: 0.35, shininess: 30 }
      const bar = barAt(u, v)
      const r = clamp01(Math.hypot(u - 16, v - 16) / 13)
      if (bar < 0.8) return live ? { albedo: rgb('#2a2218'), spec: 0.9, shininess: 12 } : { albedo: rgb('#6e6852'), spec: 0.45, shininess: 30 }
      const glow = live ? mix(rgb('#fff4c8'), rgb('#ff7a1a'), smoothstep(0, 0.8, r)) : scale(rgb('#d0601a'), 0.45 * (1 - r))
      return { albedo: rgb('#0d0f10'), ao: 0.5, emit: scale(glow, live ? 1 - r * 0.3 : 1) }
    },
  }
}

// Bulkhead: brushed panels with a recessed centre panel, a kick plate, a trim band with an accent stripe and a rounded
// front corner; a plain cap so a wall run reads as one continuous top.
// fitting: a wall variant (WALL_FITTINGS) built into the face in place of the plain centre panel, or null.
function bulkheadMaterial(drawnHeight, fitting = null) {
  const H = drawnHeight
  const sideHeight = (u, z, face) => {
    const fitted = fitting?.height(u, z, face)
    if (fitted != null) {
      const front = face === 'left' ? 32 - u : u
      return fitted + bevel(front, 2.2, 1.6) + groove(face === 'left' ? u : 32 - u, 0.35, 0.3)
    }
    let h = 0
    if (z < 7) h += 0.6 + groove(z - 7, 0.6, 0.6)
    if (z > H - 6) h += 0.5 + groove(z - (H - 6), 0.6, 0.5)
    const panel = inside(u, z, 2.5, 11, 29.5, H - 10)
    if (panel > 0) h -= 0.6 * smoothstep(0, 1.2, panel)
    if (H > 40) h += groove(z - H * 0.52, 0.5, 0.35)
    // Round the front corner, leave the joints between tiles as a fine seam.
    const front = face === 'left' ? 32 - u : u
    h += bevel(front, 2.2, 1.6)
    h += groove(face === 'left' ? u : 32 - u, 0.35, 0.3)
    return h
  }
  return {
    height(u, v, face) {
      if (face === 'top') return bevel(Math.min(32 - u, 32 - v), 1.6, 1.2)
      return sideHeight(u, v, face)
    },
    surface(u, v, face) {
      if (face === 'top') return { albedo: scale(rgb('#7d8a94'), 0.92 + noise(u / 6, v / 6, 71) * 0.1), spec: 0.25, shininess: 22 }
      const z = v
      const ao = 0.62 + 0.38 * smoothstep(0, 16, z)
      const fitted = fitting?.surface(u, z, face)
      if (fitted) return { ao, ...fitted }
      // Full-height walls carry a lit strip in the trim band and a dim guide light just above the kick plate.
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

// Star Trek wall fittings for bulkhead variants, in a wall face's drawn coordinates (u 0..32 along the face, z 0..92
// up it; the fittings stay between the guide light and the trim band). Each returns null outside its own area so the
// plain bulkhead shows round it. alt: the fitting's alternate light pattern, for its animated light layer; those
// lights are tagged 'lights' (and the conduit's core 'core').
const LCARS = { orange: rgb('#ff9c40'), peach: rgb('#ffcc66'), lilac: rgb('#c9a0dc'), blue: rgb('#99ccff'), red: rgb('#cc6666'), text: rgb('#a8c0ff') }
const GLASS = { albedo: rgb('#04070b'), spec: 0.9, shininess: 80 }
const glowing = (colour, strength = 0.9, tag = null) => ({ albedo: scale(colour, 0.5), emit: scale(colour, strength), tag })
const within = (value, from, to) => value >= from && value <= to

const WALL_FITTINGS = {
  // An LCARS wall display: the orange elbow frame, coloured bar segments and lines of readout.
  lcars: ({ alt = false } = {}) => ({
    height: (u, z) => {
      const d = inside(u, z, 3, 20, 29, 80)
      return d > 0 ? -0.8 * smoothstep(0, 1, d) : null
    },
    surface(u, z) {
      if (inside(u, z, 3, 20, 29, 80) <= 0) return null
      if (inside(u, z, 3, 20, 29, 80) < 0.7) return { albedo: rgb('#2a3036'), spec: 0.4, shininess: 30 }
      if (alt) {
        const row = Math.floor((z - 30) / 3.5)
        const length = 3 + hash(row, 7, 201) * 13
        if (within(z, 30, 64) && (z - 30) % 3.5 < 1.3 && within(u, 11, 11 + length)) return glowing(LCARS.text, 0.75, 'lights')
        return null
      }
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
  // A recessed EPS conduit: a glowing plasma channel between steel pipes and clamp bands, with a junction box.
  conduit: ({ alt = false } = {}) => {
    const channel = (u, z) => inside(u, z, 10.5, 10, 21.5, 84)
    const box = (u, z) => inside(u, z, 23, 38, 29, 52)
    const clamp = (z) => Math.abs((((z - 16) % 14) + 14) % 14 - 7) > 5.8
    const lights = [[26, 41.5, rgb('#60ff90')], [26, 45, rgb('#ffb040')], [26, 48.5, rgb('#ff5050')]]
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
          if (clamp(z)) return alt ? null : { albedo: STEEL, spec: 0.6, shininess: 40 }
          if (Math.abs(u - 16) < 1.4) return glowing(rgb('#6fc8ff'), alt ? 1 : 0.8, 'core')
          if (alt) return null
          if (Math.min(Math.abs(u - 13), Math.abs(u - 19)) < 1.4) return { albedo: STEEL, spec: 0.7, shininess: 45 }
          return { albedo: rgb('#101418'), ao: 0.5 }
        }
        if (box(u, z) > 0) {
          const light = lights.find(([lu, lz]) => Math.hypot(u - lu, z - lz) < 0.9)
          if (alt) return light && light[2] === lights[2][2] ? glowing(light[2], 1, 'lights') : null
          if (light) return glowing(light[2], light[2] === lights[2][2] ? 0.2 : 0.9)
          return { albedo: rgb('#59636b'), spec: 0.35, shininess: 30 }
        }
        return null
      },
    }
  },
  // A Jefferies tube access hatch: hazard-striped frame, handle and a section label with its light, and an LCARS
  // keypad above it.
  hatch: ({ alt = false } = {}) => {
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
          if (alt) return null
          if (d < 1.6) return Math.floor((u + z) / 1.8) % 2 === 0 ? { albedo: rgb('#e0b030'), spec: 0.2, shininess: 18 } : { albedo: rgb('#1c1c1a') }
          if (handle(u, z) < 0.9) return { albedo: STEEL, spec: 0.7, shininess: 45 }
          return { albedo: scale(rgb('#525c64'), Math.abs(z - 30) < 0.4 ? 0.6 : 1), spec: 0.3, shininess: 28 }
        }
        if (label(u, z) > 0) {
          if (Math.hypot(u - 20.5, z - 43) < 0.9) return alt ? glowing(rgb('#ff4040'), 1, 'lights') : glowing(rgb('#ff4040'), 0.25)
          if (alt) return null
          if (within(z, 42.4, 43.6) && within(u, 10.5, 17.5)) return glowing(LCARS.peach, 0.5)
          return { albedo: rgb('#15191d'), spec: 0.6, shininess: 50 }
        }
        if (pad(u, z) > 0) {
          if (alt) return null
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
  // A computer bank: shelved racks of small status lights.
  computer: ({ alt = false } = {}) => {
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
        if (shelf(z)) return alt ? null : { albedo: STEEL, spec: 0.6, shininess: 40 }
        const col = Math.floor((u - 5) / 3)
        const row = Math.floor((z - 14) / 2.6)
        const onCell = u >= 5 && u < 28 && (u - 5) % 3 < 1.7 && (z - 14) % 2.6 < 1.1
        if (onCell) {
          const state = hash(col, row, 211)
          const colour = colours[Math.floor(hash(col, row, 212) * colours.length)]
          if (alt) return state <= 0.5 && state > 0.15 ? glowing(colour, 1, 'lights') : null
          if (state > 0.5) return glowing(colour, 0.9)
        }
        return alt ? null : { albedo: rgb('#0a0d10'), spec: 0.5, shininess: 40, ao: 0.6 }
      },
    }
  },
}

const ORANGE = rgb('#ff6a30')
// blink: light the status cells that are dark in the base image instead (the blink light layer).
function machineryMaterial({ blink = false } = {}) {
  const H = 40
  const pipeAt = (u) => Math.min(Math.abs(u - 4.5), Math.abs(u - 27.5))
  const vent = (u, z) => inside(u, z, 9, 9, 23, 30)
  const screen = (u, z) => inside(u, z, 9, 18, 23, 31)
  const core = (u, v) => Math.hypot(u - 16, v - 16)
  return {
    height(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 0, 0, 32, 32)
        const r = core(u, v)
        let h = bevel(e, 1.6, 1.2)
        if (r < 6) h -= 1
        else if (r < 9.5) h += dome(r - 7.75, 1.75, 0.8)
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2
          h += dome(Math.hypot(u - 16 - Math.cos(angle) * 7.75, v - 16 - Math.sin(angle) * 7.75), 0.6, 0.4)
        }
        return h
      }
      const z = v
      let h = bevel(Math.min(u, 32 - u, z, H - z), 1.4, 1)
      const pipe = pipeAt(u)
      if (pipe < 2.2 && z > 2 && z < H - 2) h += dome(pipe, 2.2, 2)
      if (face === 'left' && vent(u, z) > 0) h -= 1.4 + (((z % 2.6) + 2.6) % 2.6 < 1.2 ? -1 : 0)
      if (face === 'right' && screen(u, z) > 0) h -= 0.6
      return h
    },
    surface(u, v, face) {
      const body = rgb('#7a3a2c')
      if (face === 'top') {
        const r = core(u, v)
        if (r < 5) return { albedo: rgb('#ffe0a0'), emit: mix(rgb('#fff6d0'), ORANGE, smoothstep(0, 5, r)), tag: 'core' }
        if (r < 6) return { albedo: rgb('#1a0c08'), ao: 0.5 }
        if (r < 9.5) return { albedo: STEEL, spec: 0.6, shininess: 40 }
        return { albedo: scale(body, 0.92 + noise(u / 5, v / 5, 81) * 0.1), spec: 0.25, shininess: 22 }
      }
      const z = v
      const ao = 0.6 + 0.4 * smoothstep(0, 10, z)
      if (pipeAt(u) < 2.2 && z > 2 && z < H - 2) return { albedo: STEEL, spec: 0.75, shininess: 45, ao }
      if (face === 'left' && vent(u, z) > 0) {
        const slat = ((z % 2.6) + 2.6) % 2.6 < 1.2
        return slat ? { albedo: rgb('#3a2a24'), spec: 0.3, shininess: 20, ao } : { albedo: rgb('#200c06'), emit: scale(ORANGE, 0.9), tag: 'vent' }
      }
      if (face === 'right' && screen(u, z) > 0) {
        const cellU = Math.floor((u - 9) / 2.8)
        const cellZ = Math.floor((z - 18) / 2.6)
        const inCell = ((u - 9) % 2.8) < 1.4 && ((z - 18) % 2.6) < 1.2
        const state = hash(cellU, cellZ, 83)
        const lit = blink ? state <= 0.45 && state > 0.12 : state > 0.45
        const tone = blink ? hash(cellU, cellZ, 85) : state
        if (inCell && lit) return { albedo: rgb('#0a0a0a'), emit: tone > 0.8 ? rgb('#60ff90') : tone > 0.6 ? rgb('#ffb040') : rgb('#40a0ff'), tag: 'panel' }
        return { albedo: rgb('#0c0f12'), spec: 0.8, shininess: 60 }
      }
      return { albedo: scale(body, 0.9 + brushed(u, z, 84, 'v') * 0.12), spec: 0.25, shininess: 22, ao }
    },
  }
}

function crateMaterial() {
  const H = 16
  const khaki = rgb('#94805a')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 0, 0, 32, 32)
        let h = bevel(e, 1.2, 0.8)
        if (e > 3.2) h -= 0.4 * smoothstep(3.2, 4, e)
        const handle = Math.hypot(Math.max(0, Math.abs(u - 16) - 5), v - 16)
        h += dome(handle, 1.1, 1)
        return h
      }
      const z = v
      let h = bevel(Math.min(u, 32 - u, z, H - z), 1, 0.8)
      if (inside(u, z, 3.5, 3, 28.5, H - 3) > 0) h -= 0.5
      return h
    },
    surface(u, v, face) {
      if (face === 'top') {
        const handle = Math.hypot(Math.max(0, Math.abs(u - 16) - 5), v - 16)
        if (handle < 1.1) return { albedo: STEEL, spec: 0.6, shininess: 40 }
        return { albedo: scale(khaki, 0.92 + noise(u / 5, v / 5, 91) * 0.1), spec: 0.2, shininess: 20 }
      }
      const z = v
      const ao = 0.7 + 0.3 * smoothstep(0, 6, z)
      if (u < 3.5 || u > 28.5) return { albedo: rgb('#5a5242'), spec: 0.45, shininess: 30, ao }
      if (z > 6.5 && z < 9.5) return { albedo: rgb('#d08a34'), spec: 0.2, shininess: 20, ao }
      return { albedo: scale(khaki, 0.9 + brushed(u, z, 92) * 0.1), spec: 0.2, shininess: 20, ao }
    },
  }
}

const SCREEN_BLUE = rgb('#5fd0ff')
function epsMaterial() {
  const H = 22
  const bars = [
    { a: [6, 9], b: [8, 22], colour: rgb('#f0a050') },
    { a: [23, 26], b: [8, 19], colour: rgb('#c8a0e0') },
    { a: [12, 22], b: [23.5, 25.5], colour: rgb('#9ab8ff') },
  ]
  return {
    height(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 0, 0, 32, 32)
        return bevel(e, 1.4, 1) - (e > 3.5 ? 0.5 * smoothstep(3.5, 4.3, e) : 0)
      }
      const z = v
      let h = bevel(Math.min(u, 32 - u, z, H - z), 1.2, 0.9)
      if (face === 'left' && inside(u, z, 7, 4, 25, 15) > 0 && ((u % 2.4) + 2.4) % 2.4 < 1.1) h -= 1
      return h
    },
    surface(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 0, 0, 32, 32)
        if (e < 3.5) return { albedo: rgb('#6888a8'), spec: 0.5, shininess: 34 }
        const r = Math.hypot(u - 16, v - 16)
        if (r < 3.6) return { albedo: rgb('#d8f6ff'), emit: mix(rgb('#e8fbff'), SCREEN_BLUE, smoothstep(0, 3.6, r)) }
        if (r < 4.6) return { albedo: rgb('#0a1c2c'), emit: scale(SCREEN_BLUE, 0.25) }
        const bar = bars.find((item) => u > item.a[0] && u < item.a[1] && v > item.b[0] && v < item.b[1])
        if (bar) return { albedo: scale(bar.colour, 0.5), emit: scale(bar.colour, 0.75), tag: 'screen' }
        return { albedo: rgb('#08141f'), spec: 0.9, shininess: 70 }
      }
      const z = v
      const ao = 0.62 + 0.38 * smoothstep(0, 8, z)
      if (face === 'right' && Math.abs(z - 15) < 0.9 && u > 11 && u < 21) return { albedo: rgb('#402010'), emit: rgb('#ffa040') }
      return { albedo: scale(rgb('#2f4e70'), 0.9 + brushed(u, z, 101, 'v') * 0.12), spec: 0.35, shininess: 30, ao }
    },
  }
}

// epsControl's warning light (a light layer, blended normally): only the light and its glow are opaque.
function epsLitScene(px, py) {
  const point = iso(px, py, 22)
  if (!inUnit(point)) return null
  const r = Math.hypot(point.a * 32 - 16, point.b * 32 - 16)
  if (r > 9) return null
  return { colour: mix(rgb('#ffffff'), SCREEN_BLUE, smoothstep(0, 9, r)), emit: null, alpha: 1 - smoothstep(2, 9, r) }
}

// A scene whose results carry their own alpha (a light layer) rather than coverage only.
function renderOverlay(scene) {
  const bytes = new Uint8Array(OUT_W * OUT_H * 4)
  for (let oy = 0; oy < OUT_H; oy++) {
    for (let ox = 0; ox < OUT_W; ox++) {
      const result = scene((ox + 0.5) / RESOLUTION, (oy + 0.5) / RESOLUTION)
      if (!result) continue
      const i = (oy * OUT_W + ox) * 4
      for (let k = 0; k < 3; k++) bytes[i + k] = Math.round(clamp01(result.colour[k]) * 255)
      bytes[i + 3] = Math.round(clamp01(result.alpha) * 255)
    }
  }
  return bytes
}

// Bulkheads are as tall as tiles.json says, in an image tall enough to hold them (engine.mjs imageHeightFor).
const WALL_H = 92
const WALL_IMAGE = imageHeightFor(WALL_H)
const wallScene = (fitting = null) => blockScene(WALL_H, bulkheadMaterial(WALL_H, fitting))

// A full-height bulkhead panel along axis with a feature (v2/panels.mjs) built into the face it runs along.
const bulkheadPanel = (axis, feature) => panelScene(axis, (half) => wallScene(onPanelFace(axis, half, feature)), WALL_IMAGE)

// Machinery is a big object (tiles.json big): a 2x2 square of it is drawn from its -big images.
const machinery = (options) => blockScene(40, machineryMaterial(options))

const TILES = {
  floor: () => render(floorScene(deckPlating({ tint: rgb('#3c4853'), seed: 1 }))),
  'floor-alt': () => render(floorScene(deckPlating({ tint: rgb('#3f4b56'), seed: 2 }))),
  doorway: () => render(floorScene(doorwayPlate())),
  grating: () => render(floorScene(gratingPlate({ live: false }))),
  'grating-live': () => render(floorScene(gratingPlate({ live: true })), { bloom: 1.2 }),
  bulkhead: () => renderTile(wallScene(), WALL_IMAGE),
  machinery: () => render(machinery()),
  'machinery-big': () => renderBig(machinery()),
  crate: () => render(blockScene(16, crateMaterial())),
  epsControl: () => render(blockScene(22, epsMaterial())),
  'epsControl-lit': () => renderOverlay(epsLitScene),
  // Bulkheads with Star Trek wall fittings (lcarsWall etc.), each with its light layer.
  ...Object.fromEntries(
    Object.entries(WALL_FITTINGS).flatMap(([name, fitting]) => {
      const scene = (alt) => wallScene(fitting({ alt }))
      return [
        [`bulkhead-${name}`, () => renderTile(scene(false), WALL_IMAGE)],
        [`bulkhead-${name}-lights`, () => renderTileLights(scene(true), ['lights'], WALL_IMAGE, { gain: 1.2 })],
      ]
    }),
  ),
  // Two-tile panels (tiles.json panelImages, v2/panels.mjs), one per direction: the bulkhead's window panel, and the long
  // wall fittings with their light layers.
  ...Object.fromEntries(
    ['x', 'y'].flatMap((axis) => [
      [`bulkhead-window-${axis}`, () => renderPanel(bulkheadPanel(axis, windowFeature(WALL_H)), WALL_IMAGE)],
      ...['lcars', 'conduit', 'hatch', 'computer'].flatMap((kind) => [
        [`${kind}Panel-${axis}`, () => renderPanel(bulkheadPanel(axis, fittingFeature(kind, WALL_H)), WALL_IMAGE)],
        [`${kind}Panel-${axis}-lights`, () => renderPanelLights(bulkheadPanel(axis, fittingFeature(kind, WALL_H, { lights: true })), ['lights'], WALL_IMAGE, { gain: 1.2 })],
      ]),
    ]),
  ),
  'bulkhead-conduit-core': () => renderTileLights(wallScene(WALL_FITTINGS.conduit({ alt: true })), ['core'], WALL_IMAGE, { gain: 1.1 }),
  'machinery-glow': () => renderLights(machinery(), ['core', 'vent'], { gain: 1.2 }),
  'machinery-blink': () => renderLights(machinery({ blink: true }), ['panel'], { gain: 1.3 }),
  'machinery-glow-big': () => renderBigLights(machinery(), ['core', 'vent'], { gain: 1.2 }),
  'machinery-blink-big': () => renderBigLights(machinery({ blink: true }), ['panel'], { gain: 1.3 }),
  'epsControl-screen': () => renderLights(blockScene(22, epsMaterial()), ['screen'], { gain: 1.2 }),
}

// Light layers (engine.mjs layerFile): the lit parts only, never drawn by the game; scripts/makeTileFrames.mjs bakes
// them into the tiles' animation frames, so run it after this.
const isLayer = (id) => /-(lights|core|glow|blink|screen|lit|live)(-big)?$/.test(id)

for (const [id, draw] of Object.entries(TILES)) {
  const file = isLayer(id) ? layerFile(`${id}.png`) : outFile(`${id}.png`)
  if (fs.existsSync(file) && !FORCE) {
    console.log(`kept   ${id}.png (already exists)`)
    continue
  }
  // A draw returns a tile image's bytes, or { width, height, bytes } for a larger one (a two-tile panel).
  const drawn = draw()
  const { width = OUT_W, height = OUT_H, bytes = drawn } = drawn.bytes ? drawn : {}
  fs.writeFileSync(file, encodePng(width, height, bytes))
  console.log(`wrote  ${id}.png`)
}
