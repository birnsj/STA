// Starship floor / doorway / grating / prop materials for Template Pieces only.
// Look matches makeTilesV2 deck/doorway/grating/crate/machinery/eps — makeTilesV2 itself is not imported or changed.
import { bevel, dome, groove, hash, inside, mix, noise, rgb, scale, smoothstep } from './engine.mjs'

const STEEL = rgb('#9aa3aa')
const ORANGE = rgb('#ff6a30')
const SCREEN_BLUE = rgb('#5fd0ff')
const brushed = (u, v, seed, along = 'u') => (along === 'u' ? noise(u * 0.35, v * 5, seed) : noise(u * 5, v * 0.35, seed))

function deckPlating({ tint, seed }) {
  const rivets = [
    [3.2, 3.2],
    [28.8, 3.2],
    [3.2, 28.8],
    [28.8, 28.8],
  ]
  return {
    height(u, v, face) {
      if (face !== 'top') return bevel(Math.min(u, 32 - u, v, 4), 1.2, 0.8)
      const e = inside(u, v, 0, 0, 32, 32)
      let h = bevel(e, 1.8, 1.4) + groove(e - 6.5, 0.55, 0.45)
      for (const [ru, rv] of rivets) h += dome(Math.hypot(u - ru, v - rv), 0.95, 0.55)
      return h
    },
    surface(u, v, face) {
      if (face !== 'top') return { albedo: scale(tint, 0.7), spec: 0.25, shininess: 22 }
      const e = inside(u, v, 0, 0, 32, 32)
      let albedo = scale(tint, 0.88 + brushed(u, v, seed) * 0.12 + noise(u / 7, v / 7, seed + 3) * 0.1)
      if (e < 1) albedo = scale(albedo, 0.45)
      else if (Math.abs(e - 6.5) < 0.45) albedo = scale(albedo, 0.65)
      if (rivets.some(([ru, rv]) => Math.hypot(u - ru, v - rv) < 0.95)) return { albedo: STEEL, spec: 0.7, shininess: 40 }
      return { albedo, spec: 0.3, shininess: 26 }
    },
  }
}

function doorwayPlate() {
  const AMBER = rgb('#f0b030')
  const lights = [
    [16, 1.9],
    [30.1, 16],
    [16, 30.1],
    [1.9, 16],
  ]
  return {
    height(u, v, face) {
      if (face !== 'top') return bevel(Math.min(u, 32 - u, v, 4), 1.2, 0.8)
      const e = inside(u, v, 0, 0, 32, 32)
      let h = bevel(e, 1.5, 1.2)
      if (e >= 3.5 && e < 7) h -= 0.6
      if (e >= 8.5) h += 0.35 + groove(((u % 2.6) + 2.6) % 2.6 - 1.3, 0.5, 0.3)
      return h
    },
    surface(u, v, face) {
      if (face !== 'top') return { albedo: rgb('#4a5c66'), spec: 0.3, shininess: 26 }
      const e = inside(u, v, 0, 0, 32, 32)
      const lit = lights.find(([lu, lv]) => Math.hypot(u - lu, v - lv) < 1.1)
      if (lit) return { albedo: rgb('#fff0c0'), emit: scale(AMBER, 1.1), tag: 'lights' }
      if (e >= 3.5 && e < 7) {
        const stripe = Math.floor((u + v * 2) / 3.2) % 2 === 0
        return { albedo: stripe ? rgb('#d8a030') : rgb('#1e1e1c'), spec: 0.15, shininess: 18 }
      }
      return { albedo: scale(rgb('#4a5c66'), (e < 1 ? 0.5 : 1) * (0.9 + brushed(u, v, 51) * 0.1)), spec: 0.3, shininess: 26 }
    },
  }
}

function gratingPlate() {
  const barAt = (u, v) => {
    const along = Math.abs((((v - 1) % 4) + 4) % 4 - 2)
    return Math.min(along, Math.abs(u - 16) * 0.7)
  }
  return {
    height(u, v, face) {
      if (face !== 'top') return bevel(Math.min(u, 32 - u, v, 4), 1.2, 0.8)
      const e = inside(u, v, 0, 0, 32, 32)
      if (e < 4.5) return bevel(e, 1.4, 1.1) + groove(e - 4.5, 0.7, 0.8)
      const bar = barAt(u, v)
      return bar < 0.8 ? dome(bar, 0.8, 0.8) - 0.2 : -4
    },
    surface(u, v, face) {
      if (face !== 'top') return { albedo: rgb('#5f5b4c'), spec: 0.35, shininess: 30 }
      const e = inside(u, v, 0, 0, 32, 32)
      if (e < 4.5) return { albedo: scale(rgb('#5f5b4c'), 0.9 + brushed(u, v, 61) * 0.15), spec: 0.35, shininess: 30 }
      const bar = barAt(u, v)
      const r = Math.max(0, Math.min(1, Math.hypot(u - 16, v - 16) / 13))
      if (bar < 0.8) return { albedo: rgb('#6e6852'), spec: 0.45, shininess: 30 }
      return { albedo: rgb('#0d0f10'), ao: 0.5, emit: scale(scale(rgb('#d0601a'), 0.45 * (1 - r)), 1), tag: 'lights' }
    },
  }
}

// Corridor deck — centre stripe along v (runs with the long axis after yaw).
function corridorPlate() {
  const tint = rgb('#3c4853')
  return {
    height(u, v, face) {
      if (face !== 'top') return bevel(Math.min(u, 32 - u, v, 4), 1.2, 0.8)
      const e = inside(u, v, 0, 0, 32, 32)
      let h = bevel(e, 1.6, 1.2)
      if (Math.abs(u - 16) < 3.2) h -= 0.35
      return h
    },
    surface(u, v, face) {
      if (face !== 'top') return { albedo: scale(tint, 0.7), spec: 0.25, shininess: 22 }
      const e = inside(u, v, 0, 0, 32, 32)
      if (e < 1) return { albedo: scale(tint, 0.4), spec: 0.25, shininess: 22 }
      if (Math.abs(u - 16) < 1.1) return { albedo: rgb('#d8e0e8'), spec: 0.35, shininess: 28 }
      if (Math.abs(u - 16) < 3.2) return { albedo: rgb('#2a3440'), spec: 0.25, shininess: 22 }
      return { albedo: scale(tint, 0.9 + brushed(u, v, 281) * 0.1), spec: 0.3, shininess: 26 }
    },
  }
}

// Cargo bay — diagonal hazard chevrons.
function cargoPlate() {
  const tint = rgb('#3a4048')
  return {
    height(u, v, face) {
      if (face !== 'top') return bevel(Math.min(u, 32 - u, v, 4), 1.2, 0.8)
      const e = inside(u, v, 0, 0, 32, 32)
      let h = bevel(e, 1.5, 1.1)
      if (e > 4 && e < 10) h -= 0.25
      return h
    },
    surface(u, v, face) {
      if (face !== 'top') return { albedo: scale(tint, 0.7), spec: 0.25, shininess: 22 }
      const e = inside(u, v, 0, 0, 32, 32)
      if (e < 1.2) return { albedo: scale(tint, 0.4), spec: 0.25, shininess: 22 }
      if (e >= 4 && e < 10) {
        const stripe = Math.floor((u + v) / 3.5) % 2 === 0
        return { albedo: stripe ? rgb('#d8a030') : rgb('#1a1a18'), spec: 0.15, shininess: 16 }
      }
      // Panel seams.
      if (Math.abs(u - 16) < 0.35 || Math.abs(v - 16) < 0.35) return { albedo: scale(tint, 0.55), spec: 0.3, shininess: 24 }
      return { albedo: scale(tint, 0.88 + brushed(u, v, 291) * 0.1), spec: 0.28, shininess: 24 }
    },
  }
}

// Soft carpet / ready-room flooring.
function carpetPlate() {
  const pile = rgb('#2a3a4a')
  const trim = rgb('#4a5a6a')
  return {
    height(u, v, face) {
      if (face !== 'top') return bevel(Math.min(u, 32 - u, v, 4), 1.1, 0.7)
      const e = inside(u, v, 0, 0, 32, 32)
      let h = bevel(e, 1.2, 0.8)
      if (e > 2.5) h += 0.35 * smoothstep(2.5, 4, e)
      return h
    },
    surface(u, v, face) {
      if (face !== 'top') return { albedo: scale(trim, 0.75), spec: 0.2, shininess: 18 }
      const e = inside(u, v, 0, 0, 32, 32)
      if (e < 2.2) return { albedo: trim, spec: 0.25, shininess: 20 }
      const weave = noise(u * 2.2, v * 2.2, 301) * 0.12
      return { albedo: scale(pile, 0.92 + weave), spec: 0.08, shininess: 10 }
    },
  }
}

// Sickbay — light sterile deck with glowing edge markers.
function sickbayPlate() {
  const tint = rgb('#5a6a78')
  return {
    height(u, v, face) {
      if (face !== 'top') return bevel(Math.min(u, 32 - u, v, 4), 1.2, 0.8)
      const e = inside(u, v, 0, 0, 32, 32)
      return bevel(e, 1.4, 1) + (e > 3 ? 0.15 : 0)
    },
    surface(u, v, face) {
      if (face !== 'top') return { albedo: scale(tint, 0.75), spec: 0.3, shininess: 26 }
      const e = inside(u, v, 0, 0, 32, 32)
      if (e < 1) return { albedo: scale(tint, 0.5), spec: 0.3, shininess: 26 }
      // Soft cross markers at mid-edges.
      for (const [lu, lv] of [
        [16, 3],
        [16, 29],
        [3, 16],
        [29, 16],
      ]) {
        if (Math.hypot(u - lu, v - lv) < 1.4) {
          return { albedo: rgb('#d8f6ff'), emit: scale(SCREEN_BLUE, 0.75), tag: 'lights' }
        }
      }
      if (Math.abs(u - 16) < 0.3 || Math.abs(v - 16) < 0.3) return { albedo: scale(tint, 0.7), spec: 0.35, shininess: 28 }
      return { albedo: scale(tint, 0.94 + noise(u / 8, v / 8, 311) * 0.06), spec: 0.35, shininess: 30 }
    },
  }
}

function machineryMaterial() {
  const H = 40
  const pipeAt = (u) => Math.min(Math.abs(u - 4.5), Math.abs(u - 27.5))
  const vent = (u, z) => inside(u, z, 9, 9, 23, 30)
  const screen = (u, z) => inside(u, z, 9, 18, 23, 31)
  const core = (u, v) => Math.hypot(u - 16, v - 16)
  const body = rgb('#7a3a2c')
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
      if (face === 'top') {
        const r = core(u, v)
        if (r < 5) return { albedo: rgb('#ffe0a0'), emit: mix(rgb('#fff6d0'), ORANGE, smoothstep(0, 5, r)), tag: 'lights' }
        if (r < 6) return { albedo: rgb('#1a0c08'), ao: 0.5 }
        if (r < 9.5) return { albedo: STEEL, spec: 0.6, shininess: 40 }
        return { albedo: scale(body, 0.92 + noise(u / 5, v / 5, 81) * 0.1), spec: 0.25, shininess: 22 }
      }
      const z = v
      const ao = 0.6 + 0.4 * smoothstep(0, 10, z)
      if (pipeAt(u) < 2.2 && z > 2 && z < H - 2) return { albedo: STEEL, spec: 0.75, shininess: 45, ao }
      if (face === 'left' && vent(u, z) > 0) {
        const slat = ((z % 2.6) + 2.6) % 2.6 < 1.2
        return slat ? { albedo: rgb('#3a2a24'), spec: 0.3, shininess: 20, ao } : { albedo: rgb('#200c06'), emit: scale(ORANGE, 0.9), tag: 'lights' }
      }
      if (face === 'right' && screen(u, z) > 0) {
        const cellU = Math.floor((u - 9) / 2.8)
        const cellZ = Math.floor((z - 18) / 2.6)
        const inCell = ((u - 9) % 2.8) < 1.4 && ((z - 18) % 2.6) < 1.2
        const state = hash(cellU, cellZ, 83)
        if (inCell && state > 0.45) {
          return { albedo: rgb('#0a0a0a'), emit: state > 0.8 ? rgb('#60ff90') : state > 0.6 ? rgb('#ffb040') : rgb('#40a0ff'), tag: 'lights' }
        }
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
        if (r < 3.6) return { albedo: rgb('#d8f6ff'), emit: mix(rgb('#e8fbff'), SCREEN_BLUE, smoothstep(0, 3.6, r)), tag: 'lights' }
        if (r < 4.6) return { albedo: rgb('#0a1c2c'), emit: scale(SCREEN_BLUE, 0.25), tag: 'lights' }
        const bar = bars.find((item) => u > item.a[0] && u < item.a[1] && v > item.b[0] && v < item.b[1])
        if (bar) return { albedo: scale(bar.colour, 0.5), emit: scale(bar.colour, 0.75), tag: 'lights' }
        return { albedo: rgb('#08141f'), spec: 0.9, shininess: 70 }
      }
      const z = v
      const ao = 0.62 + 0.38 * smoothstep(0, 8, z)
      if (face === 'right' && Math.abs(z - 15) < 0.9 && u > 11 && u < 21) {
        return { albedo: rgb('#402010'), emit: rgb('#ffa040'), tag: 'lights' }
      }
      return { albedo: scale(rgb('#2f4e70'), 0.9 + brushed(u, z, 101, 'v') * 0.12), spec: 0.35, shininess: 30, ao }
    },
  }
}

// Soft Federation furniture shell — works on multi-prism chairs/benches/lockers (per-prism UV 0–32).
function furnitureShell({ body, accent, seed, padded = false }) {
  return {
    height(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 0, 0, 32, 32)
        let h = bevel(e, 1.4, 1)
        if (padded && e > 2.5) h += 0.45 * smoothstep(2.5, 4, e)
        return h
      }
      const z = v
      let h = bevel(Math.min(u, 32 - u, z, 4), 1.1, 0.85)
      if (inside(u, z, 3, 4, 29, 28) > 0) h -= padded ? 0.35 : 0.55
      return h
    },
    surface(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 0, 0, 32, 32)
        let albedo = scale(padded ? accent : body, 0.9 + brushed(u, v, seed) * 0.1)
        if (e < 1.2) albedo = scale(body, 0.55)
        return { albedo, spec: padded ? 0.18 : 0.35, shininess: padded ? 16 : 28 }
      }
      const z = v
      const ao = 0.65 + 0.35 * smoothstep(0, 10, z)
      if (Math.abs(z - 10) < 0.7 && u > 6 && u < 26) return { albedo: accent, spec: 0.25, shininess: 22, ao }
      if (inside(u, z, 3, 4, 29, 28) > 0) {
        return { albedo: scale(padded ? accent : body, 0.88 + brushed(u, z, seed + 2, 'v') * 0.1), spec: 0.22, shininess: 20, ao }
      }
      return { albedo: scale(body, 0.92 + brushed(u, z, seed + 1, 'v') * 0.1), spec: 0.3, shininess: 26, ao }
    },
  }
}

function biobedMaterial() {
  const shell = rgb('#4a5a6a')
  const pad = rgb('#6a8aaa')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 0, 0, 32, 32)
        let h = bevel(e, 1.5, 1.1)
        if (e > 3) h += 0.5 * smoothstep(3, 5, e)
        // Pillow / monitor strip at the head.
        if (v < 7 && u > 4 && u < 28) h += 1.2
        return h
      }
      const z = v
      let h = bevel(Math.min(u, 32 - u, z, 4), 1.1, 0.8)
      if (inside(u, z, 4, 3, 28, 20) > 0) h -= 0.4
      return h
    },
    surface(u, v, face) {
      if (face === 'top') {
        if (v < 7 && u > 4 && u < 28) {
          const lit = Math.abs(u - 16) < 3 && v > 2 && v < 5
          if (lit) return { albedo: rgb('#d8f6ff'), emit: scale(SCREEN_BLUE, 0.85), tag: 'lights' }
          return { albedo: scale(pad, 1.05), spec: 0.15, shininess: 14 }
        }
        const e = inside(u, v, 0, 0, 32, 32)
        if (e < 2) return { albedo: scale(shell, 0.7), spec: 0.4, shininess: 30 }
        return { albedo: scale(pad, 0.92 + noise(u / 6, v / 6, 111) * 0.08), spec: 0.15, shininess: 14 }
      }
      const z = v
      const ao = 0.65 + 0.35 * smoothstep(0, 8, z)
      if (face === 'left' && Math.abs(z - 12) < 0.8 && u > 8 && u < 24) {
        return { albedo: rgb('#c8f0ff'), emit: scale(SCREEN_BLUE, 0.55), tag: 'lights' }
      }
      return { albedo: scale(shell, 0.9 + brushed(u, z, 112, 'v') * 0.1), spec: 0.3, shininess: 26, ao }
    },
  }
}

function consoleDeskMaterial() {
  const body = rgb('#3e4c58')
  const top = rgb('#5a6a78')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 0, 0, 32, 32)
        let h = bevel(e, 1.3, 1)
        if (e > 3.5) h -= 0.35 * smoothstep(3.5, 5, e)
        // Soft key wells.
        for (const [ku, kv] of [
          [8, 10],
          [16, 10],
          [24, 10],
          [8, 18],
          [16, 18],
          [24, 18],
        ]) {
          h -= 0.35 * smoothstep(1.4, 0.4, Math.hypot(u - ku, v - kv))
        }
        return h
      }
      return bevel(Math.min(u, 32 - u, v, 4), 1.1, 0.85)
    },
    surface(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 0, 0, 32, 32)
        if (e < 1.5) return { albedo: scale(body, 0.55), spec: 0.4, shininess: 30 }
        for (const [ku, kv] of [
          [8, 10],
          [16, 10],
          [24, 10],
          [8, 18],
          [16, 18],
          [24, 18],
        ]) {
          if (Math.hypot(u - ku, v - kv) < 1.2) {
            return { albedo: rgb('#1a2430'), emit: scale(rgb('#7fc8ff'), 0.35), tag: 'lights' }
          }
        }
        return { albedo: scale(top, 0.9 + brushed(u, v, 121) * 0.1), spec: 0.45, shininess: 34 }
      }
      const z = v
      const ao = 0.62 + 0.38 * smoothstep(0, 8, z)
      if (Math.abs(z - 9) < 0.55 && u > 10 && u < 22) return { albedo: rgb('#ffb060'), emit: scale(ORANGE, 0.4), tag: 'lights' }
      return { albedo: scale(body, 0.9 + brushed(u, z, 122, 'v') * 0.1), spec: 0.3, shininess: 26, ao }
    },
  }
}

function consoleScreenMaterial() {
  return {
    height(u, v, face) {
      if (face === 'top') return bevel(inside(u, v, 0, 0, 32, 32), 1.2, 0.9)
      const z = v
      let h = bevel(Math.min(u, 32 - u, z, 4), 1, 0.7)
      if (face !== 'end' && inside(u, z, 2.5, 3, 29.5, 28) > 0) h -= 0.9
      return h
    },
    surface(u, v, face) {
      if (face === 'top') return { albedo: rgb('#2a3440'), spec: 0.4, shininess: 30 }
      if (face === 'end') return { albedo: rgb('#2a3440'), spec: 0.35, shininess: 28 }
      const z = v
      const ao = 0.7 + 0.3 * smoothstep(0, 8, z)
      const panel = inside(u, z, 2.5, 3, 29.5, 28)
      if (panel <= 0) return { albedo: rgb('#3a4654'), spec: 0.35, shininess: 28, ao }
      // LCARS-style cells.
      const cellU = Math.floor((u - 2.5) / 5.2)
      const cellZ = Math.floor((z - 3) / 4.8)
      const inCell = ((u - 2.5) % 5.2) > 0.55 && ((z - 3) % 4.8) > 0.45
      const state = hash(cellU, cellZ, 131)
      if (inCell) {
        if (state > 0.72) return { albedo: rgb('#ffe8a0'), emit: scale(rgb('#ffd070'), 1.1), tag: 'lights' }
        if (state > 0.45) return { albedo: rgb('#a8c8ff'), emit: scale(rgb('#7aa8ff'), 0.95), tag: 'lights' }
        if (state > 0.22) return { albedo: rgb('#4060a0'), emit: scale(rgb('#3060c0'), 0.45), tag: 'lights' }
        return { albedo: rgb('#0a1220'), spec: 0.85, shininess: 60 }
      }
      return { albedo: rgb('#081018'), spec: 0.7, shininess: 50, ao }
    },
  }
}

function lockerMaterial() {
  const body = rgb('#5a6570')
  return {
    height(u, v, face) {
      if (face === 'top') return bevel(inside(u, v, 0, 0, 32, 32), 1.3, 1)
      const z = v
      let h = bevel(Math.min(u, 32 - u, z, 4), 1.1, 0.85)
      // Door seam down the middle + recessed panels.
      h += groove(u - 16, 0.4, 0.55)
      if (inside(u, z, 3, 6, 14.5, 40) > 0 || inside(u, z, 17.5, 6, 29, 40) > 0) h -= 0.7
      return h
    },
    surface(u, v, face) {
      if (face === 'top') return { albedo: scale(body, 0.95), spec: 0.35, shininess: 28 }
      const z = v
      const ao = 0.6 + 0.4 * smoothstep(0, 12, z)
      if (Math.abs(u - 16) < 0.55) return { albedo: rgb('#2a3038'), spec: 0.4, shininess: 30, ao }
      // Latch.
      if (Math.abs(u - 16) < 2.2 && z > 22 && z < 30) return { albedo: STEEL, spec: 0.7, shininess: 42, ao }
      if (inside(u, z, 3, 6, 14.5, 40) > 0 || inside(u, z, 17.5, 6, 29, 40) > 0) {
        return { albedo: scale(body, 0.82 + brushed(u, z, 141, 'v') * 0.1), spec: 0.28, shininess: 24, ao }
      }
      return { albedo: scale(body, 0.92 + brushed(u, z, 142, 'v') * 0.1), spec: 0.32, shininess: 26, ao }
    },
  }
}

function shelfMaterial() {
  const frame = rgb('#6a5a48')
  const board = rgb('#8a7a62')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 0, 0, 32, 32)
        return bevel(e, 1.2, 0.9) + (e > 2 ? 0.25 : 0)
      }
      return bevel(Math.min(u, 32 - u, v, 3), 1, 0.7)
    },
    surface(u, v, face) {
      if (face === 'top') {
        return { albedo: scale(board, 0.9 + brushed(u, v, 151) * 0.12), spec: 0.22, shininess: 18 }
      }
      const z = v
      const ao = 0.7 + 0.3 * smoothstep(0, 8, z)
      return { albedo: scale(frame, 0.9 + brushed(u, z, 152, 'v') * 0.1), spec: 0.25, shininess: 22, ao }
    },
  }
}

// Structural support column — works on tall posts (v up the full height).
function pillarMaterial() {
  const body = rgb('#4a5562')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 0, 0, 32, 32)
        const r = Math.hypot(u - 16, v - 16)
        return bevel(e, 1.4, 1) + (r < 5 ? -0.6 : 0)
      }
      const z = v
      let h = bevel(Math.min(u, 32 - u, z, 4), 1.1, 0.85)
      if (inside(u, z, 4, 10, 28, 82) > 0) h -= 0.5
      // Flange rings.
      if (Math.abs(z - 20) < 1.2 || Math.abs(z - 72) < 1.2) h += 0.7
      return h
    },
    surface(u, v, face) {
      if (face === 'top') {
        const r = Math.hypot(u - 16, v - 16)
        if (r < 4) return { albedo: rgb('#c8e8ff'), emit: scale(SCREEN_BLUE, 0.7), tag: 'lights' }
        return { albedo: scale(body, 0.95), spec: 0.35, shininess: 28 }
      }
      const z = v
      const ao = 0.6 + 0.4 * smoothstep(0, 14, z)
      if (Math.abs(z - 20) < 1.2 || Math.abs(z - 72) < 1.2) return { albedo: STEEL, spec: 0.6, shininess: 40, ao }
      if (Math.abs(z - 46) < 1.1 && u > 6 && u < 26) return { albedo: rgb('#ffe0a0'), emit: scale(ORANGE, 0.65), tag: 'lights' }
      if (inside(u, z, 4, 10, 28, 82) > 0) {
        return { albedo: scale(body, 0.85 + brushed(u, z, 241, 'v') * 0.1), spec: 0.28, shininess: 24, ao }
      }
      return { albedo: scale(body, 0.92 + brushed(u, z, 242, 'v') * 0.1), spec: 0.3, shininess: 26, ao }
    },
  }
}

function warpCoilMaterial() {
  const shell = rgb('#3a4a5a')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const r = Math.hypot(u - 16, v - 16)
        let h = bevel(inside(u, v, 0, 0, 32, 32), 1.3, 1)
        if (r < 8) h -= 1.2
        else if (r < 12) h += dome(r - 10, 2, 0.9)
        return h
      }
      const z = v
      let h = bevel(Math.min(u, 32 - u, z, 4), 1.1, 0.8)
      // Coil banding.
      const band = ((z % 10) + 10) % 10
      if (band < 2.2) h += 0.9
      if (inside(u, z, 6, 4, 26, 50) > 0) h -= 0.35
      return h
    },
    surface(u, v, face) {
      if (face === 'top') {
        const r = Math.hypot(u - 16, v - 16)
        if (r < 7) return { albedo: rgb('#d0f8ff'), emit: mix(rgb('#e8fbff'), SCREEN_BLUE, smoothstep(0, 7, r)), tag: 'lights' }
        if (r < 12) return { albedo: STEEL, spec: 0.65, shininess: 42 }
        return { albedo: scale(shell, 0.92), spec: 0.3, shininess: 26 }
      }
      const z = v
      const ao = 0.62 + 0.38 * smoothstep(0, 10, z)
      const band = ((z % 10) + 10) % 10
      if (band < 2.2) return { albedo: rgb('#a8e8ff'), emit: scale(SCREEN_BLUE, 0.95), tag: 'lights' }
      if (inside(u, z, 6, 4, 26, 50) > 0) {
        return { albedo: rgb('#102030'), emit: scale(rgb('#306090'), 0.35), tag: 'lights', ao }
      }
      return { albedo: scale(shell, 0.9 + brushed(u, z, 251, 'v') * 0.1), spec: 0.32, shininess: 28, ao }
    },
  }
}

function pipeRiserMaterial() {
  const body = rgb('#5a6570')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 0, 0, 32, 32)
        const r = Math.hypot(u - 16, v - 16)
        return bevel(e, 1.2, 0.9) + (r < 10 ? dome(r, 10, 0.6) : 0)
      }
      const z = v
      let h = bevel(Math.min(u, 32 - u, z, 4), 1, 0.75)
      // Vertical pipe ridges.
      for (const pu of [8, 16, 24]) h += dome(Math.abs(u - pu), 2.2, 1.6)
      if (Math.abs(z - 30) < 1.5 || Math.abs(z - 55) < 1.5) h += 0.5
      return h
    },
    surface(u, v, face) {
      if (face === 'top') {
        return { albedo: STEEL, spec: 0.55, shininess: 36 }
      }
      const z = v
      const ao = 0.65 + 0.35 * smoothstep(0, 12, z)
      for (const pu of [8, 16, 24]) {
        if (Math.abs(u - pu) < 2.2) {
          if (Math.abs(z - 40) < 1.2) return { albedo: rgb('#60ff90'), emit: scale(rgb('#60ff90'), 0.8), tag: 'lights' }
          return { albedo: STEEL, spec: 0.7, shininess: 45, ao }
        }
      }
      if (Math.abs(z - 30) < 1.5 || Math.abs(z - 55) < 1.5) return { albedo: rgb('#3a444e'), spec: 0.4, shininess: 30, ao }
      return { albedo: scale(body, 0.9 + brushed(u, z, 261, 'v') * 0.1), spec: 0.28, shininess: 24, ao }
    },
  }
}

function junctionBoxMaterial() {
  const body = rgb('#4a5560')
  return {
    height(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 0, 0, 32, 32)
        let h = bevel(e, 1.3, 1)
        if (e > 3) h -= 0.4 * smoothstep(3, 4.5, e)
        return h
      }
      const z = v
      let h = bevel(Math.min(u, 32 - u, z, 4), 1.1, 0.85)
      if (inside(u, z, 4, 5, 28, 24) > 0) h -= 0.7
      return h
    },
    surface(u, v, face) {
      if (face === 'top') {
        const e = inside(u, v, 0, 0, 32, 32)
        if (e < 2) return { albedo: scale(body, 0.6), spec: 0.4, shininess: 30 }
        // Status LEDs on lid.
        for (const [lu, lv, c] of [
          [10, 12, rgb('#60ff90')],
          [16, 12, rgb('#ffb040')],
          [22, 12, rgb('#ff5050')],
          [16, 20, SCREEN_BLUE],
        ]) {
          if (Math.hypot(u - lu, v - lv) < 1.3) return { albedo: c, emit: scale(c, 0.95), tag: 'lights' }
        }
        return { albedo: scale(body, 0.92 + brushed(u, v, 271) * 0.08), spec: 0.35, shininess: 28 }
      }
      const z = v
      const ao = 0.65 + 0.35 * smoothstep(0, 8, z)
      if (inside(u, z, 4, 5, 28, 24) > 0) {
        const cell = hash(Math.floor(u / 4), Math.floor(z / 4), 272)
        if (cell > 0.7) return { albedo: rgb('#40a0ff'), emit: scale(rgb('#40a0ff'), 0.7), tag: 'lights' }
        return { albedo: rgb('#1a222c'), spec: 0.5, shininess: 40, ao }
      }
      return { albedo: scale(body, 0.9 + brushed(u, z, 273, 'v') * 0.1), spec: 0.3, shininess: 26, ao }
    },
  }
}

export function materialForKind(kind) {
  switch (kind) {
    case 'floor':
      return deckPlating({ tint: rgb('#3c4853'), seed: 1 })
    case 'doorway':
      return doorwayPlate()
    case 'grating':
      return gratingPlate()
    case 'floorCorridor':
      return corridorPlate()
    case 'floorCargo':
      return cargoPlate()
    case 'floorCarpet':
      return carpetPlate()
    case 'floorSickbay':
      return sickbayPlate()
    case 'machinery':
      return machineryMaterial()
    case 'crate':
      return crateMaterial()
    case 'epsControl':
      return epsMaterial()
    case 'chair':
      return furnitureShell({ body: rgb('#3a4550'), accent: rgb('#4a6a7a'), seed: 161, padded: true })
    case 'stool':
      return furnitureShell({ body: rgb('#4a545e'), accent: rgb('#c8883a'), seed: 162, padded: true })
    case 'bench':
      return furnitureShell({ body: rgb('#3e4a54'), accent: rgb('#5a7080'), seed: 163, padded: true })
    case 'table':
      return furnitureShell({ body: rgb('#4a5560'), accent: rgb('#6a7888'), seed: 164, padded: false })
    case 'bed':
      return biobedMaterial()
    case 'console':
      return consoleDeskMaterial()
    case 'consoleScreen':
      return consoleScreenMaterial()
    case 'locker':
      return lockerMaterial()
    case 'shelf':
      return shelfMaterial()
    case 'pillar':
      return pillarMaterial()
    case 'warpCoil':
      return warpCoilMaterial()
    case 'pipeRiser':
      return pipeRiserMaterial()
    case 'junctionBox':
      return junctionBoxMaterial()
    default:
      return null
  }
}
