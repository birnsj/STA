// Floor materials for the v2 world tiles (height map + surface, as engine.mjs shade). Every texture wraps at the tile
// edge (kit.mjs tileNoise / cells), so a field of the same floor reads as one surface. alt: the tile's checkerboard
// partner (tiles.json altImage): the same ground slightly re-tinted with its own small details.
import { bevel, clamp01, dome, groove, hash, inside, mix, rgb, scale, smoothstep } from './engine.mjs'
import { cells, fbm, tileNoise } from './kit.mjs'

const TAU = Math.PI * 2

// Natural ground. base/dark/light: colours; rough: bump height; cellsAcross: size of the colour patches.
// Optional layers: flecks (small spots), pebbles (raised stones), blades (grass), cracks (dried / crusted ground),
// ripples (sand waves), glints (sparkles), glow (emissive flecks), wet (gloss).
export function ground(o) {
  const {
    base,
    dark = scale(base, 0.72),
    light = scale(base, 1.18),
    seed = 1,
    rough = 0.9,
    cellsAcross = 3,
    flecks = null,
    pebbles = null,
    blades = null,
    cracks = null,
    ripples = null,
    glints = null,
    glow = null,
    wet = 0,
    alt = false,
  } = o
  const tint = alt ? 0.95 : 1
  const local = alt ? seed + 500 : seed
  const pebbleAt = (u, v) => {
    if (!pebbles) return null
    const c = cells(u, v, pebbles.count, local + 40)
    return c.id < (pebbles.density ?? 0.6) ? c : null
  }
  const crackAt = (u, v) => (cracks ? cells(u, v, cracks.count, seed + 60).edge : 9)
  const bladeAt = (u, v) => (blades ? tileNoise(u, v, 32, local + 80) * 0.6 + tileNoise(u, v, 16, local + 81) * 0.4 : 0)
  const rippleAt = (u, v) => (ripples ? Math.sin((TAU * (ripples.n * u + ripples.m * v)) / 32 + fbm(tileNoise, u, v, 2, seed + 90, 2) * 5) : 0)
  return {
    height(u, v) {
      let h = (fbm(tileNoise, u, v, 4, seed, 4) - 0.5) * rough * 2
      const pebble = pebbleAt(u, v)
      if (pebble) h += dome(pebble.f1, pebbles.size, pebbles.height ?? 0.9)
      if (cracks) h += groove(crackAt(u, v), cracks.width ?? 0.35, cracks.depth ?? 0.8)
      if (blades) h += (bladeAt(u, v) - 0.4) * (blades.height ?? 1.4)
      if (ripples) h += rippleAt(u, v) * (ripples.height ?? 0.35)
      return h
    },
    surface(u, v) {
      const patch = fbm(tileNoise, u, v, cellsAcross, seed + 7, 3)
      const grain = tileNoise(u, v, 32, local + 9)
      let albedo = scale(mix(dark, light, smoothstep(0.25, 0.75, patch)), (0.9 + grain * 0.18) * tint)
      let spec = 0.1 + wet * 0.5
      let shininess = 14 + wet * 40
      if (ripples) albedo = scale(albedo, 0.94 + rippleAt(u, v) * 0.06)
      if (blades) {
        const b = bladeAt(u, v)
        albedo = mix(albedo, b > 0.55 ? blades.tip : blades.colour, smoothstep(0.3, 0.75, b) * (blades.cover ?? 0.85))
      }
      if (flecks) {
        for (const [i, fleck] of flecks.entries()) {
          if (tileNoise(u, v, fleck.cells ?? 16, local + 20 + i) > (fleck.threshold ?? 0.72)) albedo = mix(albedo, fleck.colour, fleck.amount ?? 0.8)
        }
      }
      if (cracks && crackAt(u, v) < (cracks.width ?? 0.35)) albedo = scale(cracks.colour ?? albedo, 1)
      const pebble = pebbleAt(u, v)
      if (pebble && pebble.f1 < pebbles.size) {
        const colours = pebbles.colours
        albedo = scale(colours[Math.floor(pebble.id * 97) % colours.length], 0.9 + grain * 0.15)
        spec = 0.2
        shininess = 24
      }
      if (glints && tileNoise(u, v, 32, local + 30) > glints.threshold) return { albedo: glints.colour, emit: scale(glints.colour, glints.strength ?? 0.4), spec: 0.9, shininess: 60 }
      if (glow) {
        const g = tileNoise(u, v, glow.cells ?? 16, local + 33)
        if (g > glow.threshold) return { albedo: glow.colour, emit: scale(glow.colour, (g - glow.threshold) / (1 - glow.threshold) * (glow.strength ?? 1.2)), tag: 'glow' }
      }
      return { albedo, spec, shininess }
    },
  }
}

// Planks along u: count planks across the tile, butt joints staggered per plank.
export function planks({ wood, dark = scale(wood, 0.6), count = 5, seed = 1, alt = false, gap = 0.35, worn = 0.1 }) {
  const width = 32 / count
  const plank = (v) => Math.floor(v / width)
  const jointAt = (u, v) => {
    const row = plank(v)
    const offset = hash(row, 1, seed) * 32
    return Math.abs(((((u + offset) % 32) + 32) % 32) - 16)
  }
  return {
    height(u, v) {
      const across = (((v % width) + width) % width) - width / 2
      let h = groove(Math.abs(across) - width / 2, gap, 0.8) + bevel(width / 2 - Math.abs(across), 0.6, 0.25)
      if (jointAt(u, v) > 15.6) h -= 0.6
      return h + (tileNoise(u, v, 16, seed + 3) - 0.5) * 0.2
    },
    surface(u, v) {
      const row = plank(v)
      const tone = 0.82 + hash(row, 2, seed + (alt ? 9 : 0)) * 0.3
      const grain = tileNoise(u * 0.25, v * 3, 32, seed + row) * 0.5 + tileNoise(u, v, 16, seed + 5) * 0.5
      const across = Math.abs((((v % width) + width) % width) - width / 2)
      if (across > width / 2 - gap || jointAt(u, v) > 15.6) return { albedo: dark, spec: 0.05 }
      const wornness = tileNoise(u, v, 4, seed + 11) * worn
      return { albedo: scale(mix(wood, scale(wood, 1.25), grain * 0.6 + wornness), tone), spec: 0.18, shininess: 22 }
    },
  }
}

// Irregular stones set in mortar (temple flagstones, garden paths).
export function flagstones({ stone, mortar, count = 3, seed = 1, alt = false, spread = 0.25, gap = 0.7, gold = null }) {
  return {
    height(u, v) {
      const c = cells(u, v, count, seed)
      return bevel(c.edge, gap + 1, 1.2) + (tileNoise(u, v, 8, seed + 3) - 0.5) * 0.5
    },
    surface(u, v) {
      const c = cells(u, v, count, seed)
      if (c.edge < gap) return { albedo: mortar, spec: 0.05 }
      const tone = 1 - spread / 2 + c.id * spread
      const wear = fbm(tileNoise, u, v, 4, seed + (alt ? 70 : 7), 3)
      if (gold && c.id > 0.82 && inside(u, v, 4, 4, 28, 28) > 0 && Math.abs(c.f1 - 2.6) < 0.45) return { albedo: gold, emit: scale(gold, 0.35), spec: 0.8, shininess: 40 }
      return { albedo: scale(stone, tone * (0.86 + wear * 0.28)), spec: 0.14, shininess: 20 }
    },
  }
}

// A grid of square slabs (concrete pads, pavement, lab tiles). count: slabs across.
export function slabs({ colour, seam, count = 2, seed = 1, alt = false, gloss = 0.15, stains = 0.12, gap = 0.35 }) {
  const size = 32 / count
  const edge = (u, v) => Math.min(((u % size) + size) % size, size - (((u % size) + size) % size), ((v % size) + size) % size, size - (((v % size) + size) % size))
  return {
    height(u, v) {
      return bevel(edge(u, v), 0.9, 0.7) + (tileNoise(u, v, 16, seed) - 0.5) * 0.15
    },
    surface(u, v) {
      if (edge(u, v) < gap) return { albedo: seam, spec: 0.05 }
      const slab = Math.floor(u / size) + Math.floor(v / size) * 7
      const tone = 0.95 + hash(slab, 3, seed) * 0.08
      const stain = fbm(tileNoise, u, v, 4, seed + (alt ? 40 : 4), 3)
      return { albedo: scale(colour, tone * (1 - stains / 2 + stain * stains) * (alt ? 0.97 : 1)), spec: gloss, shininess: 30 }
    },
  }
}

// Metal deck plating (derelict, brig, alien vessel): one plate per tile with seams, bolts, wear and optional soot,
// rust or glowing inlay lines.
export function plating({ tint, seed = 1, alt = false, soot = 0, rust = 0, cracks = 0, inlay = null, rivets = true, ribs = 0 }) {
  const bolts = [[3, 3], [29, 3], [3, 29], [29, 29]]
  return {
    height(u, v) {
      const e = inside(u, v, 0, 0, 32, 32)
      let h = bevel(e, 1.6, 1.2) + groove(e - 6, 0.5, 0.4)
      if (rivets) for (const [bu, bv] of bolts) h += dome(Math.hypot(u - bu, v - bv), 0.9, 0.5)
      if (ribs) h += groove(((u % (32 / ribs)) + 32 / ribs) % (32 / ribs) - 16 / ribs, 0.5, 0.4)
      if (cracks) h += groove(cells(u, v, 3, seed + 9).edge, 0.25, 0.7) * smoothstep(cracks, 0, tileNoise(u, v, 3, seed + 10))
      return h
    },
    surface(u, v) {
      const e = inside(u, v, 0, 0, 32, 32)
      const wear = fbm(tileNoise, u, v, 4, seed + (alt ? 50 : 5), 4)
      let albedo = scale(tint, 0.86 + tileNoise(u * 0.3, v * 4, 32, seed) * 0.1 + wear * 0.12)
      if (e < 1) albedo = scale(albedo, 0.45)
      else if (Math.abs(e - 6) < 0.4) albedo = scale(albedo, 0.65)
      if (rivets && bolts.some(([bu, bv]) => Math.hypot(u - bu, v - bv) < 0.9)) return { albedo: rgb('#8a939a'), spec: 0.6, shininess: 40 }
      if (inlay && Math.abs(e - 6) < 0.35) return { albedo: inlay, emit: scale(inlay, 0.6), tag: 'glow' }
      if (soot) albedo = scale(albedo, 1 - soot * smoothstep(0.35, 0.8, fbm(tileNoise, u, v, 2, seed + 20, 4)))
      if (rust) albedo = mix(albedo, rgb('#7a4424'), rust * smoothstep(0.55, 0.85, fbm(tileNoise, u, v, 4, seed + 30, 4)))
      if (cracks && cells(u, v, 3, seed + 9).edge < 0.25 && tileNoise(u, v, 3, seed + 10) < cracks) return { albedo: rgb('#06080a') }
      return { albedo, spec: 0.3, shininess: 26 }
    },
  }
}

// Liquid: a glossy surface with slow swells. emit: a glowing liquid (lava, acid); crust: dark floating plates with
// glowing cracks between them (lava).
export function liquid({ deep, shallow, seed = 1, emit = 0, crust = null, gloss = 0.9, foam = null }) {
  return {
    height(u, v) {
      if (crust) {
        const c = cells(u, v, crust.count, seed)
        return c.edge > crust.gap ? 0.6 + (tileNoise(u, v, 8, seed + 2) - 0.5) * 1.2 : -0.4
      }
      return (fbm(tileNoise, u, v, 2, seed, 3) - 0.5) * 0.9
    },
    surface(u, v) {
      const t = fbm(tileNoise, u, v, 2, seed + 5, 3)
      const colour = mix(deep, shallow, smoothstep(0.3, 0.75, t))
      if (crust) {
        const c = cells(u, v, crust.count, seed)
        if (c.edge > crust.gap) return { albedo: scale(crust.colour, 0.8 + tileNoise(u, v, 16, seed + 3) * 0.4), spec: 0.15, shininess: 18, ao: 1 }
        const heat = 1 - clamp01(c.edge / crust.gap)
        return { albedo: colour, emit: scale(mix(deep, shallow, heat), emit), tag: 'glow' }
      }
      if (foam && tileNoise(u, v, 16, seed + 8) > foam.threshold) return { albedo: foam.colour, spec: 0.3 }
      return emit ? { albedo: colour, emit: scale(colour, emit * (0.6 + t * 0.6)), tag: 'glow' } : { albedo: colour, spec: gloss, shininess: 70 }
    },
  }
}

// A floor material with a shape laid over it (pool rims, markings): over(u, v) returns a surface override (with an
// optional height) or null.
export function overlay(material, over) {
  return {
    height(u, v, face) {
      const o = over(u, v)
      return o?.height ?? material.height(u, v, face)
    },
    surface(u, v, face) {
      const o = over(u, v)
      return o?.surface ?? material.surface(u, v, face)
    },
  }
}
