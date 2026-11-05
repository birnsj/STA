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
      if (lit) return { albedo: rgb('#fff0c0'), emit: scale(AMBER, 1.1) }
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
      return { albedo: rgb('#0d0f10'), ao: 0.5, emit: scale(scale(rgb('#d0601a'), 0.45 * (1 - r)), 1) }
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
        if (r < 5) return { albedo: rgb('#ffe0a0'), emit: mix(rgb('#fff6d0'), ORANGE, smoothstep(0, 5, r)) }
        if (r < 6) return { albedo: rgb('#1a0c08'), ao: 0.5 }
        if (r < 9.5) return { albedo: STEEL, spec: 0.6, shininess: 40 }
        return { albedo: scale(body, 0.92 + noise(u / 5, v / 5, 81) * 0.1), spec: 0.25, shininess: 22 }
      }
      const z = v
      const ao = 0.6 + 0.4 * smoothstep(0, 10, z)
      if (pipeAt(u) < 2.2 && z > 2 && z < H - 2) return { albedo: STEEL, spec: 0.75, shininess: 45, ao }
      if (face === 'left' && vent(u, z) > 0) {
        const slat = ((z % 2.6) + 2.6) % 2.6 < 1.2
        return slat ? { albedo: rgb('#3a2a24'), spec: 0.3, shininess: 20, ao } : { albedo: rgb('#200c06'), emit: scale(ORANGE, 0.9) }
      }
      if (face === 'right' && screen(u, z) > 0) {
        const cellU = Math.floor((u - 9) / 2.8)
        const cellZ = Math.floor((z - 18) / 2.6)
        const inCell = ((u - 9) % 2.8) < 1.4 && ((z - 18) % 2.6) < 1.2
        const state = hash(cellU, cellZ, 83)
        if (inCell && state > 0.45) return { albedo: rgb('#0a0a0a'), emit: state > 0.8 ? rgb('#60ff90') : state > 0.6 ? rgb('#ffb040') : rgb('#40a0ff') }
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
        if (r < 3.6) return { albedo: rgb('#d8f6ff'), emit: mix(rgb('#e8fbff'), SCREEN_BLUE, smoothstep(0, 3.6, r)) }
        if (r < 4.6) return { albedo: rgb('#0a1c2c'), emit: scale(SCREEN_BLUE, 0.25) }
        const bar = bars.find((item) => u > item.a[0] && u < item.a[1] && v > item.b[0] && v < item.b[1])
        if (bar) return { albedo: scale(bar.colour, 0.5), emit: scale(bar.colour, 0.75) }
        return { albedo: rgb('#08141f'), spec: 0.9, shininess: 70 }
      }
      const z = v
      const ao = 0.62 + 0.38 * smoothstep(0, 8, z)
      if (face === 'right' && Math.abs(z - 15) < 0.9 && u > 11 && u < 21) return { albedo: rgb('#402010'), emit: rgb('#ffa040') }
      return { albedo: scale(rgb('#2f4e70'), 0.9 + brushed(u, z, 101, 'v') * 0.12), spec: 0.35, shininess: 30, ao }
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
    case 'machinery':
      return machineryMaterial()
    case 'crate':
      return crateMaterial()
    case 'epsControl':
      return epsMaterial()
    default:
      return null
  }
}
