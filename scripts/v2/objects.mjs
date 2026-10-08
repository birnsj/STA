// Object tiles for the v2 world art: props, plants and boulders as distance-field scenes (kit.mjs objectScene) standing
// on their ground. Each maker takes the ground material and returns { ground, parts, top }. Sizes follow the original
// placeholder tiles: heights are the tile's height in design pixels, the tile spans 0..32 texels across.
import { clamp01, hash, mix, rgb, scale, smoothstep } from './engine.mjs'
import { box, capsule, cone, cylinder, ellipsoid, fbm3, noise3, smin, sphere, taper, torus } from './kit.mjs'

const C = 16 // the tile centre (x and y)
const hex = rgb

// ---------- surfaces ----------
export const matte = (colour, { spec = 0.12, shininess = 18, vary = 0.25, freq = 0.4, seed = 1 } = {}) => (p) => ({
  albedo: scale(colour, 1 - vary / 2 + noise3(p[0] * freq, p[1] * freq, p[2] * freq, seed) * vary),
  spec,
  shininess,
})
export const metal = (colour, { spec = 0.55, shininess = 40, seed = 2, grime = 0.15 } = {}) => (p) => ({
  albedo: scale(colour, 1 - grime + fbm3(p[0] * 0.3, p[1] * 0.3, p[2] * 0.3, seed) * grime * 1.6),
  spec,
  shininess,
})
export const glow = (colour, strength = 1, tag = 'glow') => () => ({ albedo: colour, emit: scale(colour, strength), tag })
const bark = (colour, seed = 3) => (p) => ({ albedo: scale(colour, 0.7 + noise3(p[0] * 1.6, p[1] * 1.6, p[2] * 0.25, seed) * 0.5), spec: 0.08, shininess: 14 })
// Leaves: darker deep inside the crown, lighter on the clumps facing up.
const leafy = ([dark, light], seed = 4) => (p, n) => {
  const t = clamp01(0.35 + n[2] * 0.4 + (noise3(p[0] * 0.9, p[1] * 0.9, p[2] * 0.9, seed) - 0.5) * 0.7)
  return { albedo: mix(dark, light, t), spec: 0.12, shininess: 16 }
}
// Rock with an optional cap (moss, snow, lichen) on the surfaces facing up.
const stony = (colour, { cap = null, capFrom = 0.5, seed = 5, glints = null } = {}) => (p, n) => {
  const t = fbm3(p[0] * 0.25, p[1] * 0.25, p[2] * 0.25, seed)
  if (glints && noise3(p[0] * 2, p[1] * 2, p[2] * 2, seed + 9) > 0.86) return { albedo: glints, emit: scale(glints, 0.6), spec: 0.9, shininess: 60 }
  if (cap && n[2] + (noise3(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, seed + 3) - 0.5) * 0.6 > capFrom) return { albedo: scale(cap, 0.85 + t * 0.3), spec: 0.1, shininess: 16 }
  return { albedo: scale(colour, 0.72 + t * 0.55), spec: 0.12, shininess: 20 }
}
const part = (sdf, mat) => ({ sdf, mat })
// Cut a shape off below the floor so it sits on the ground.
const grounded = (d, p) => Math.max(d, -p[2])

// ---------- natural ----------
export function boulder(ground, { colour, cap = null, capFrom = 0.5, h = 30, size = 12, seed = 1, glints = null, lean = 0 }) {
  return {
    ground,
    top: h + 4,
    parts: [
      part((p) => {
        const d = ellipsoid(p, [C + lean, C, h * 0.42], [size, size * 0.9, h * 0.62])
        return grounded(d - (fbm3(p[0] * 0.14, p[1] * 0.14, p[2] * 0.14, seed) - 0.5) * 5, p)
      }, stony(colour, { cap, capFrom, seed, glints })),
    ],
  }
}

// A broadleaf tree: trunk and a lumpy crown. crown: { z, r, squash }; extraLumps: more crown spheres.
export function tree(ground, { trunk, leaves, h = 44, crownR = 11, crownZ = 30, trunkR = 1.8, seed = 1, squash = 0.8, lumps = 4, glowLeaves = null }) {
  const blobs = Array.from({ length: lumps }, (_, i) => {
    const angle = (i / lumps) * Math.PI * 2 + seed
    return [C + Math.cos(angle) * crownR * 0.45, C + Math.sin(angle) * crownR * 0.45, crownZ + (hash(i, 1, seed) - 0.3) * 5, crownR * (0.55 + hash(i, 2, seed) * 0.2)]
  })
  const crown = (p) => {
    let d = ellipsoid(p, [C, C, crownZ + 2], [crownR, crownR, crownR * squash])
    for (const [x, y, z, r] of blobs) d = smin(d, sphere(p, [x, y, z], r), 3)
    return d - (fbm3(p[0] * 0.3, p[1] * 0.3, p[2] * 0.3, seed + 2) - 0.5) * 3
  }
  const leafMat = leafy(leaves, seed + 3)
  return {
    ground,
    top: h + 4,
    parts: [
      part((p) => taper(p, [C, C, 0], [C, C, crownZ], trunkR * 1.4, trunkR * 0.7), bark(trunk, seed)),
      part(crown, glowLeaves ? (p, n) => (noise3(p[0] * 1.2, p[1] * 1.2, p[2] * 1.2, seed + 7) > 0.78 ? { albedo: glowLeaves, emit: scale(glowLeaves, 1.1), tag: 'glow' } : leafMat(p, n)) : leafMat),
    ],
  }
}

// A conifer: tiers of drooping cones.
export function conifer(ground, { trunk, leaves, h = 48, tiers = 4, base = 12, seed = 1 }) {
  return {
    ground,
    top: h + 2,
    parts: [
      part((p) => cylinder(p, C, C, 1.5, 0, h * 0.5), bark(trunk, seed)),
      part((p) => {
        let d = Infinity
        for (let i = 0; i < tiers; i++) {
          const z0 = 6 + i * ((h - 10) / tiers)
          const r = base * (1 - i / (tiers + 0.6))
          d = smin(d, cone(p, C, C, z0, r, z0 + (h - 6) / tiers + 6, 0.5), 1.5)
        }
        return d - (noise3(p[0] * 0.8, p[1] * 0.8, p[2] * 0.8, seed) - 0.5) * 1.6
      }, leafy(leaves, seed + 1)),
    ],
  }
}

export function palm(ground, { trunk, leaves, h = 42, seed = 1 }) {
  const top = [C + 3, C - 1, h - 6]
  const fronds = Array.from({ length: 7 }, (_, i) => {
    const angle = (i / 7) * Math.PI * 2 + 0.3
    return [top[0] + Math.cos(angle) * 12, top[1] + Math.sin(angle) * 12, top[2] - 6]
  })
  return {
    ground,
    top: h + 2,
    parts: [
      part((p) => taper(p, [C - 1, C + 1, 0], top, 2, 1.3) + Math.sin(p[2] * 1.6) * 0.15, bark(trunk, seed)),
      part((p) => {
        let d = Infinity
        for (const tip of fronds) {
          const mid = [(top[0] + tip[0]) / 2, (top[1] + tip[1]) / 2, top[2] + 1.5]
          d = Math.min(d, taper(p, top, mid, 1.6, 1.2), taper(p, mid, tip, 1.2, 0.2))
        }
        return d
      }, leafy(leaves, seed + 2)),
      part((p) => sphere(p, [top[0], top[1], top[2] - 1.5], 2.2), matte(hex('#5a4026'))),
    ],
  }
}

export function bush(ground, { leaves, h = 16, r = 10, seed = 1, berries = null, count = 5 }) {
  const blobs = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + seed
    return [C + Math.cos(angle) * r * 0.45, C + Math.sin(angle) * r * 0.45, h * 0.45 + hash(i, 1, seed) * h * 0.2, r * (0.5 + hash(i, 2, seed) * 0.2)]
  })
  const mat = leafy(leaves, seed)
  return {
    ground,
    top: h + 4,
    parts: [
      part((p) => {
        let d = ellipsoid(p, [C, C, h * 0.45], [r, r, h * 0.55])
        for (const [x, y, z, rr] of blobs) d = smin(d, sphere(p, [x, y, z], rr), 2.5)
        return grounded(d - (fbm3(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, seed) - 0.5) * 2.4, p)
      }, berries ? (p, n) => (noise3(p[0] * 1.4, p[1] * 1.4, p[2] * 1.4, seed + 5) > 0.82 ? { albedo: berries, spec: 0.5, shininess: 40 } : mat(p, n)) : mat),
    ],
  }
}

// A cluster of thin leaning stems or shards (reeds, ferns, crystals, glass). each: [x, y, height, lean x, lean y, r].
export function cluster(ground, { stems, mat, tipMat = null, top }) {
  return {
    ground,
    top,
    parts: [
      part((p) => {
        let d = Infinity
        for (const [x, y, h, lx, ly, r] of stems) d = Math.min(d, taper(p, [x, y, 0], [x + lx, y + ly, h], r, r * 0.25))
        return d
      }, tipMat ? (p, n) => (p[2] > top * 0.7 ? tipMat(p, n) : mat(p, n)) : mat),
    ],
  }
}

// A faceted crystal or obsidian spire: a few leaning hexagonal-ish cones.
export function spire(ground, { colour, glowColour = null, h = 46, r = 8, seed = 1, gloss = 0.9, shards = 3 }) {
  const pieces = [[C, C, h, 0, 0, r], ...Array.from({ length: shards }, (_, i) => {
    const angle = (i / shards) * Math.PI * 2 + seed
    return [C + Math.cos(angle) * r * 0.9, C + Math.sin(angle) * r * 0.9, h * (0.35 + hash(i, 1, seed) * 0.25), Math.cos(angle) * 4, Math.sin(angle) * 4, r * 0.55]
  })]
  const facet = (p, x, y) => {
    const a = Math.atan2(p[1] - y, p[0] - x)
    return Math.cos(((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6)
  }
  return {
    ground,
    top: h + 2,
    parts: [
      part((p) => {
        let d = Infinity
        for (const [x, y, hh, lx, ly, rr] of pieces) d = Math.min(d, taper(p, [x, y, -2], [x + lx, y + ly, hh], rr * facet(p, x, y), 0.3))
        return grounded(d, p)
      }, (p, n) => {
        const inner = noise3(p[0] * 0.4, p[1] * 0.4, p[2] * 0.4, seed)
        if (glowColour && inner > 0.62) return { albedo: glowColour, emit: scale(glowColour, (inner - 0.62) * 2.2), spec: gloss, shininess: 80, tag: 'glow' }
        return { albedo: scale(colour, 0.7 + inner * 0.5 + Math.max(0, n[2]) * 0.2), spec: gloss, shininess: 80 }
      }),
    ],
  }
}

export function mushroom(ground, { stem, cap, spots = null, h = 44, capR = 14, seed = 1, glowSpots = false }) {
  return {
    ground,
    top: h + 2,
    parts: [
      part((p) => taper(p, [C, C, 0], [C, C, h - 8], 3.4, 2.4), matte(stem, { vary: 0.15 })),
      part((p) => {
        const d = ellipsoid(p, [C, C, h - 8], [capR, capR, 9])
        return Math.max(d, h - 11 - p[2]) - (noise3(p[0] * 0.3, p[1] * 0.3, p[2] * 0.3, seed) - 0.5) * 1.2
      }, (p, n) => {
        if (n[2] < -0.2) return { albedo: scale(stem, 0.7), ao: 0.7 }
        if (spots && noise3(p[0] * 0.8, p[1] * 0.8, p[2] * 0.8, seed + 3) > 0.7) return glowSpots ? { albedo: spots, emit: scale(spots, 0.8), tag: 'glow' } : { albedo: spots, spec: 0.3 }
        return { albedo: scale(cap, 0.85 + noise3(p[0] * 0.4, p[1] * 0.4, p[2] * 0.4, seed + 1) * 0.3), spec: 0.35, shininess: 30 }
      }),
    ],
  }
}

// Round pods or puffballs. pods: [x, y, r, squash].
export function pods(ground, { pods: list, mat, stalk = null }) {
  return {
    ground,
    top: Math.max(...list.map(([, , r, s, z = 0]) => z + r * s * 2)) + 2,
    parts: [
      part((p) => {
        let d = Infinity
        for (const [x, y, r, s, z = 0] of list) d = smin(d, ellipsoid(p, [x, y, z + r * s * 0.85], [r, r, r * s]), 1)
        return grounded(d, p)
      }, mat),
      ...(stalk ? [part((p) => Math.min(...list.map(([x, y, , , z = 0]) => (z > 0 ? capsule(p, [x, y, 0], [x, y, z + 1], stalk.r) : Infinity))), stalk.mat)] : []),
    ],
  }
}

// ---------- props ----------
export function log(ground, { colour = hex('#6e5236'), cut = hex('#b08a5a') }) {
  const a = [C - 11, C + 6, 5]
  const b = [C + 11, C - 6, 5]
  return {
    ground,
    top: 12,
    parts: [part((p) => grounded(capsule(p, a, b, 5) + (noise3(p[0] * 0.8, p[1] * 0.8, p[2] * 0.8, 2) - 0.5) * 0.6, p), (p, n) => {
      const along = Math.abs(((p[0] - C) * 22 - (p[1] - C) * 12) / Math.hypot(22, 12))
      if (along > 10.6) return { albedo: scale(cut, 0.8 + 0.2 * Math.sin(Math.hypot(p[1] - C, p[2] - 5) * 2)), spec: 0.1 }
      return bark(colour)(p, n)
    })],
  }
}

export function fence(ground) {
  const wood = metal(hex('#a8a89e'), { spec: 0.35 })
  return {
    ground,
    top: 16,
    parts: [
      part((p) => Math.min(...[3, 16, 29].map((x) => box(p, [x, C, 6.5], [1, 1, 6.5], 0.3))), wood),
      part((p) => Math.min(box(p, [C, C, 10], [15, 0.5, 1], 0.2), box(p, [C, C, 5], [15, 0.5, 1], 0.2)), wood),
    ],
  }
}

export function planter(ground) {
  return {
    ground,
    top: 22,
    parts: [
      part((p) => Math.max(box(p, [C, C, 4.5], [11, 11, 4.5], 0.8), -box(p, [C, C, 8], [9.5, 9.5, 2], 0)), matte(hex('#8a8a84'), { vary: 0.15 })),
      ...bush(null, { leaves: [hex('#2c5a28'), hex('#5aa04e')], h: 10, r: 9, seed: 4 }).parts.map((leaf) => ({ sdf: (p) => leaf.sdf([p[0], p[1], p[2] - 6]), mat: leaf.mat })),
    ],
  }
}

export function fountain(ground) {
  const stone = matte(hex('#a4a49c'), { vary: 0.15 })
  return {
    ground,
    top: 24,
    parts: [
      part((p) => Math.max(cylinder(p, C, C, 14, 0, 7, 1), -cylinder(p, C, C, 12, 4, 9)), stone),
      part((p) => cylinder(p, C, C, 12, 0, 5.5), () => ({ albedo: hex('#3a8ab0'), spec: 0.9, shininess: 80 })),
      part((p) => Math.min(cylinder(p, C, C, 1.6, 0, 16, 0.5), cylinder(p, C, C, 5, 14, 16, 0.6)), stone),
      part((p) => sphere(p, [C, C, 18], 2), () => ({ albedo: hex('#bfe8ff'), emit: scale(hex('#9ad8ff'), 0.25), spec: 0.9, shininess: 80 })),
    ],
  }
}

export function cactus(ground) {
  const skin = (p, n) => ({ albedo: scale(hex('#5f8a3e'), 0.75 + 0.25 * Math.abs(Math.sin(Math.atan2(p[1] - C, p[0] - C) * 6)) + n[2] * 0.1), spec: 0.2, shininess: 24 })
  return {
    ground,
    top: 32,
    parts: [
      part((p) => smin(smin(capsule(p, [C, C, 0], [C, C, 26], 3.2), capsule(p, [C - 6, C, 10], [C - 6, C, 18], 2), 1.5), Math.min(capsule(p, [C, C, 10], [C - 6, C, 10], 2), capsule(p, [C, C, 14], [C + 5, C + 2, 14], 1.8), capsule(p, [C + 5, C + 2, 14], [C + 5, C + 2, 21], 1.8)), 1.5), skin),
    ],
  }
}

export function block(ground, { colour, h, size = 12, seed = 1, cracks = null, gloss = 0.6, translucent = false }) {
  return {
    ground,
    top: h + 2,
    parts: [
      part((p) => box(p, [C, C, h / 2], [size, size, h / 2], 2) + (noise3(p[0] * 0.3, p[1] * 0.3, p[2] * 0.3, seed) - 0.5) * 1.5, (p, n) => {
        const t = noise3(p[0] * 0.25, p[1] * 0.25, p[2] * 0.25, seed + 1)
        if (cracks && Math.abs(noise3(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, seed + 2) - 0.5) < 0.025) return { albedo: cracks, spec: 0.8, shininess: 60 }
        return { albedo: scale(colour, 0.8 + t * 0.35 + Math.max(0, n[2]) * 0.15), spec: gloss, shininess: 70, emit: translucent ? scale(colour, 0.12) : null }
      }),
    ],
  }
}

export function basaltColumns(ground, { colour = hex('#46434c'), h = 34 }) {
  const cols = [[C - 5, C - 4, h], [C + 5, C - 3, h - 6], [C, C + 5, h - 3], [C - 7, C + 5, h - 12], [C + 7, C + 6, h - 14]]
  const hexagon = (p, x, y, r) => {
    const q = [Math.abs(p[0] - x), Math.abs(p[1] - y)]
    return Math.max(q[0] * 0.866 + q[1] * 0.5, q[1]) - r
  }
  return {
    ground,
    top: h + 2,
    parts: [part((p) => Math.min(...cols.map(([x, y, hh]) => Math.max(hexagon(p, x, y, 4.6), p[2] - hh, -p[2]))), stony(colour, { seed: 4 }))],
  }
}

export function termiteMound(ground) {
  return {
    ground,
    top: 32,
    parts: [part((p) => {
      let d = cone(p, C, C, 0, 10, 26, 2)
      d = smin(d, cone(p, C + 5, C + 3, 0, 5, 16, 1.2), 2)
      d = smin(d, cone(p, C - 4, C + 5, 0, 4, 12, 1), 2)
      return d - (noise3(p[0] * 0.6, p[1] * 0.6, p[2] * 0.6, 3) - 0.5) * 1.6
    }, stony(hex('#b08048'), { seed: 6 }))],
  }
}

export function geyser(ground) {
  return {
    ground,
    top: 30,
    parts: [
      part((p) => Math.max(cone(p, C, C, 0, 11, 9, 4.5) - (noise3(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, 2) - 0.5) * 1.4, -cylinder(p, C, C, 2.6, 5, 12)), stony(hex('#c8c0a8'), { cap: hex('#e8dc80'), capFrom: 0.75 })),
      part((p) => cylinder(p, C, C, 2.6, 0, 7.5), glow(hex('#9ae8e0'), 0.35)),
      part((p) => {
        let d = Infinity
        for (let i = 0; i < 4; i++) d = Math.min(d, sphere(p, [C + Math.sin(i * 2.3) * 1.2, C + Math.cos(i * 1.7) * 1.2, 11 + i * 4], 2.6 + i * 0.6))
        return d + (noise3(p[0] * 0.8, p[1] * 0.8, p[2] * 0.8, 5) - 0.5) * 1.5
      }, () => ({ albedo: hex('#f4f8fa'), spec: 0.05, ao: 1.1 })),
    ],
  }
}

export function hayBale(ground) {
  return {
    ground,
    top: 16,
    parts: [part((p) => {
      const q = [p[0] - C, p[2] - 6.5]
      return Math.max(Math.hypot(q[0], q[1]) - 6.5, Math.abs(p[1] - C) - 10) - (noise3(p[0] * 2, p[1] * 2, p[2] * 2, 3) - 0.5) * 0.5
    }, (p) => {
      const end = Math.abs(p[1] - C) > 9.6
      const swirl = end ? 0.8 + 0.2 * Math.sin(Math.hypot(p[0] - C, p[2] - 6.5) * 3) : 0.75 + noise3(p[0] * 2, p[1] * 0.4, p[2] * 2, 4) * 0.45
      return { albedo: scale(hex('#d8b860'), swirl), spec: 0.05 }
    })],
  }
}

export function tallCrop(ground) {
  const stems = []
  for (let i = 0; i < 12; i++) stems.push([5 + hash(i, 1, 7) * 22, 5 + hash(i, 2, 7) * 22, 18 + hash(i, 3, 7) * 6, (hash(i, 4, 7) - 0.5) * 3, (hash(i, 5, 7) - 0.5) * 3, 0.9])
  return {
    ...cluster(ground, { stems, mat: matte(hex('#7a9a30'), { vary: 0.3 }), top: 26 }),
    parts: [
      ...cluster(ground, { stems, mat: matte(hex('#7a9a30'), { vary: 0.3 }), top: 26 }).parts,
      part((p) => Math.min(...stems.map(([x, y, h, lx, ly]) => ellipsoid(p, [x + lx, y + ly, h - 1], [1.4, 1.4, 3]))), matte(hex('#e0c450'), { spec: 0.25 })),
    ],
  }
}

export function silo(ground) {
  return {
    ground,
    top: 50,
    parts: [
      part((p) => cylinder(p, C, C, 11, 0, 40, 0.5), (p) => {
        const a = Math.atan2(p[1] - C, p[0] - C)
        const rib = Math.abs(Math.sin(a * 18)) > 0.92 ? 0.85 : 1
        const band = Math.abs(((p[2] % 10) + 10) % 10 - 5) > 4.6 ? 0.8 : 1
        return { albedo: scale(hex('#b8bcc0'), rib * band * (0.9 + noise3(p[0] * 0.3, p[1] * 0.3, p[2] * 0.3, 2) * 0.15)), spec: 0.5, shininess: 40 }
      }),
      part((p) => Math.max(sphere(p, [C, C, 38], 11.3), 38 - p[2]), metal(hex('#8a3a2a'), { spec: 0.4 })),
      part((p) => box(p, [C + 11, C, 20], [0.5, 1.5, 20], 0.2), metal(hex('#5a5e62'))),
    ],
  }
}

export function oreVein(ground) {
  return boulder(ground, { colour: hex('#5a4e44'), h: 30, size: 13, seed: 8, glints: hex('#ffc040') })
}

export function oreCart(ground) {
  const steel = metal(hex('#5a6066'))
  return {
    ground,
    top: 20,
    parts: [
      part((p) => Math.max(box(p, [C, C, 9], [10, 7, 5], 0.8), -box(p, [C, C, 13], [9, 6, 4], 0)), steel),
      part((p) => Math.min(...[[C - 6, C - 7], [C + 6, C - 7], [C - 6, C + 7], [C + 6, C + 7]].map(([x, y]) => Math.max(Math.hypot(p[0] - x, p[2] - 3.2) - 3, Math.abs(p[1] - y) - 0.8))), metal(hex('#2a2c2e'))),
      part((p) => grounded(Math.max(ellipsoid(p, [C, C, 12], [9, 6, 4]) - (noise3(p[0], p[1], p[2], 3) - 0.5) * 1.6, -box(p, [C, C, 10], [9, 6, 2.5], 0) ), p), stony(hex('#8a7058'), { glints: hex('#ffc040'), seed: 3 })),
    ],
  }
}

export function drillRig(ground) {
  const yellow = metal(hex('#c89a30'), { spec: 0.4 })
  return {
    ground,
    top: 50,
    parts: [
      part((p) => box(p, [C, C, 5], [12, 10, 5], 1), yellow),
      part((p) => Math.min(...[[C - 4, C - 3], [C + 4, C - 3], [C, C + 4]].map(([x, y]) => capsule(p, [x, y, 9], [C, C, 46], 0.9))), yellow),
      part((p) => Math.min(...[16, 24, 32, 40].map((z) => torus(p, C, C, z, (46 - z) * 0.2 + 1, 0.4))), metal(hex('#8a7020'))),
      part((p) => cylinder(p, C, C, 1, 0, 30), metal(hex('#9aa0a6'), { spec: 0.8 })),
      part((p) => sphere(p, [C, C, 47], 1.4), glow(hex('#ff5040'), 1.2, 'lights')),
      part((p) => box(p, [C + 8, C + 5, 13], [3, 3, 3], 0.5), metal(hex('#44484c'))),
    ],
  }
}

export function shuttleHull(ground) {
  const hull = metal(hex('#d0d6da'), { spec: 0.6, grime: 0.08 })
  return {
    ground,
    top: 34,
    parts: [
      part((p) => {
        let d = ellipsoid(p, [C, C, 13], [15, 9, 10])
        d = smin(d, box(p, [C - 3, C, 9], [11, 13, 2], 1.5), 2.5)
        return grounded(Math.max(d, -(p[2] - 3)), p)
      }, (p, n) => (Math.abs(p[2] - 13) < 0.5 ? { albedo: hex('#4a6a9a'), spec: 0.4 } : hull(p, n))),
      part((p) => ellipsoid(p, [C + 10, C, 17], [4.5, 5.5, 3.5]), () => ({ albedo: hex('#1a3050'), spec: 0.95, shininess: 90, emit: scale(hex('#4a8ac0'), 0.15) })),
      part((p) => Math.min(...[[C - 9, C - 7], [C - 9, C + 7], [C + 8, C]].map(([x, y]) => cylinder(p, x, y, 1, 0, 4))), metal(hex('#3a3e42'))),
      part((p) => Math.min(cylinder(p, C - 15, C - 4, 2.2, 9, 15), cylinder(p, C - 15, C + 4, 2.2, 9, 15)), glow(hex('#ff7a3a'), 0.8)),
    ],
  }
}

export function fuelTank(ground) {
  return {
    ground,
    top: 28,
    parts: [
      part((p) => Math.min(capsule(p, [C - 7, C, 11], [C + 7, C, 11], 8)), (p) => ({ albedo: Math.abs(p[0] - C) < 1.2 ? hex('#c04030') : scale(hex('#d8d0b8'), 0.9 + noise3(p[0] * 0.3, p[1] * 0.3, p[2] * 0.3, 3) * 0.15), spec: 0.5, shininess: 40 })),
      part((p) => Math.min(box(p, [C - 7, C, 2], [1.4, 8, 2], 0.3), box(p, [C + 7, C, 2], [1.4, 8, 2], 0.3)), metal(hex('#4a4e52'))),
    ],
  }
}

export function hullWreck(ground) {
  const hull = (p) => {
    const scorch = fbm3(p[0] * 0.2, p[1] * 0.2, p[2] * 0.2, 6)
    return { albedo: scale(mix(hex('#7a848a'), hex('#1e1c1a'), smoothstep(0.45, 0.75, scorch)), 0.85 + noise3(p[0], p[1], p[2], 2) * 0.2), spec: 0.4, shininess: 34 }
  }
  return {
    ground,
    top: 38,
    parts: [
      part((p) => {
        let d = Math.max(ellipsoid(p, [C, C, 6], [15, 11, 26]), -ellipsoid(p, [C, C, 6], [13.5, 9.5, 24.5]))
        d = Math.max(d, -box(p, [C + 6, C + 8, 20], [8, 6, 12], 0) + (noise3(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, 5) - 0.5) * 4)
        return grounded(d, p)
      }, hull),
      part((p) => Math.min(...[0, 1, 2].map((i) => box(p, [C - 6 + i * 6, C, 2 + i], [0.6, 9, 2 + i], 0.2))), metal(hex('#3a3e42'))),
    ],
  }
}

const flames = (cx, cy, z0, scaleBy = 1) => (p) => {
  let d = Infinity
  for (const [dx, dy, h, r] of [[0, 0, 10, 2.8], [3, -2, 7, 2], [-3, 2, 6, 1.8]]) d = Math.min(d, taper(p, [cx + dx, cy + dy, z0], [cx + dx * 0.5, cy + dy * 0.5, z0 + h * scaleBy], r * scaleBy, 0.2))
  return d + (noise3(p[0] * 0.9, p[1] * 0.9, p[2] * 0.6, 9) - 0.5) * 1.2
}
const fire = (p) => {
  const t = clamp01(p[2] / 18)
  const colour = mix(hex('#fff2b0'), hex('#ff5a10'), t)
  return { albedo: colour, emit: scale(colour, 1.4), tag: 'fire' }
}

export function burningWreck(ground) {
  return {
    ground,
    top: 26,
    parts: [
      part((p) => grounded(Math.min(box(p, [C, C, 4], [9, 6, 4], 1), box(p, [C - 4, C + 3, 7], [4, 3, 5], 0.5)) + (noise3(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, 2) - 0.5) * 1.6, p), (p) => ({ albedo: scale(hex('#3c454b'), 0.5 + noise3(p[0] * 0.4, p[1] * 0.4, p[2] * 0.4, 3) * 0.5), spec: 0.3 })),
      part(flames(C + 2, C - 1, 6, 1.4), fire),
    ],
  }
}

export function campfire(ground) {
  return {
    ground,
    top: 16,
    parts: [
      part((p) => Math.min(...Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2
        return sphere(p, [C + Math.cos(a) * 8, C + Math.sin(a) * 8, 0.8], 2)
      })), stony(hex('#6a6660'))),
      part((p) => Math.min(capsule(p, [C - 5, C - 3, 1.2], [C + 5, C + 3, 1.2], 1.2), capsule(p, [C - 5, C + 3, 1.6], [C + 5, C - 3, 1.6], 1.2)), (p) => ({ albedo: hex('#2a1a10'), emit: noise3(p[0] * 2, p[1] * 2, p[2] * 2, 3) > 0.6 ? hex('#ff6a20') : null })),
      part(flames(C, C, 1.5, 0.9), fire),
    ],
  }
}

export function tent(ground) {
  return {
    ground,
    top: 30,
    parts: [
      part((p) => {
        const ridge = Math.abs(p[0] - C) * 0.95 + p[2] * 0.62 - 15
        return Math.max(ridge, Math.abs(p[1] - C) - 13, -p[2]) * 0.8
      }, (p) => {
        const front = Math.abs(p[1] - C) > 12.6
        if (front && Math.abs(p[0] - C) < 3 && p[2] < 12) return { albedo: hex('#1c2414'), ao: 0.6 }
        return { albedo: scale(hex('#6a7a4a'), 0.85 + noise3(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, 4) * 0.2), spec: 0.08 }
      }),
      part((p) => Math.min(capsule(p, [C, C - 14, 0], [C, C - 14, 25], 0.4), capsule(p, [C, C + 14, 0], [C, C + 14, 25], 0.4), capsule(p, [C, C - 14, 24], [C, C + 14, 24], 0.4)), metal(hex('#8a8a80'))),
    ],
  }
}

export function sensorMast(ground) {
  return {
    ground,
    top: 50,
    parts: [
      part((p) => box(p, [C, C, 3], [7, 7, 3], 0.8), metal(hex('#7a848a'))),
      part((p) => cylinder(p, C, C, 1.1, 5, 44), metal(hex('#b8c0c6'), { spec: 0.7 })),
      part((p) => Math.max(ellipsoid(p, [C, C, 43], [7, 7, 2.5]), -ellipsoid(p, [C, C, 44.5], [6.4, 6.4, 2.2])), metal(hex('#d0d6da'), { spec: 0.6 })),
      part((p) => sphere(p, [C, C, 46.5], 1), glow(hex('#5fd0ff'), 1.3, 'lights')),
      part((p) => Math.min(...[[C - 6, C - 6], [C + 6, C - 6], [C, C + 7]].map(([x, y]) => capsule(p, [x, y, 1], [C, C, 18], 0.35))), metal(hex('#6a7278'))),
    ],
  }
}

export function labBench(ground) {
  return {
    ground,
    top: 22,
    parts: [
      part((p) => box(p, [C, C, 6], [13, 8, 6], 0.6), metal(hex('#aab4ba'), { grime: 0.04 })),
      part((p) => box(p, [C, C, 12.6], [14, 9, 0.7], 0.3), metal(hex('#e8eef2'), { grime: 0.02 })),
      part((p) => box(p, [C + 3, C - 1, 15], [3.5, 0.4, 2.2], 0.2), (p) => ({ albedo: hex('#062030'), emit: scale(hex('#5fd0ff'), Math.abs(p[2] - 15) < 0.4 ? 1 : 0.45), tag: 'lights' })),
      part((p) => Math.min(cylinder(p, C - 7, C + 3, 1.2, 13, 17, 0.3), cylinder(p, C - 4, C + 4, 0.9, 13, 16, 0.3)), () => ({ albedo: hex('#7ad8a0'), emit: scale(hex('#40c080'), 0.3), spec: 0.9, shininess: 80 })),
    ],
  }
}

export function containmentPod(ground) {
  return {
    ground,
    top: 44,
    parts: [
      part((p) => cylinder(p, C, C, 10, 0, 6, 1), metal(hex('#7a848a'))),
      part((p) => cylinder(p, C, C, 10, 36, 41, 1), metal(hex('#7a848a'))),
      part((p) => cylinder(p, C, C, 8, 6, 36), (p) => ({ albedo: hex('#2a6a80'), emit: scale(hex('#5ad0f0'), 0.3 + 0.2 * Math.sin(p[2] * 0.8)), spec: 0.95, shininess: 90, tag: 'glow' })),
      part((p) => ellipsoid(p, [C, C, 20], [3.2, 3.2, 6]), () => ({ albedo: hex('#3a5a40'), spec: 0.4 })),
    ],
  }
}

export function barCounter(ground) {
  return {
    ground,
    top: 22,
    parts: [
      part((p) => box(p, [C, C, 7.5], [15, 9, 7.5], 0.4), (p) => {
        const board = Math.floor(p[2] / 2.5)
        return { albedo: scale(hex('#7a5a3a'), 0.8 + hash(board, 1, 3) * 0.3 + noise3(p[0] * 0.3, p[1] * 2, p[2] * 0.3, 2) * 0.1), spec: 0.2 }
      }),
      part((p) => box(p, [C, C, 15.6], [16, 10, 0.8], 0.4), () => ({ albedo: hex('#2a2a30'), spec: 0.8, shininess: 60 })),
      part((p) => Math.min(cylinder(p, C - 6, C + 2, 1.1, 16, 20, 0.3), cylinder(p, C + 5, C - 3, 1.3, 16, 19.5, 0.3)), () => ({ albedo: hex('#c08040'), emit: scale(hex('#c08040'), 0.25), spec: 0.9, shininess: 80 })),
    ],
  }
}

export function table(ground) {
  const wood = (p) => ({ albedo: scale(hex('#8a6a44'), 0.8 + noise3(p[0] * 0.3, p[1] * 2, p[2] * 0.3, 2) * 0.3), spec: 0.25 })
  return {
    ground,
    top: 16,
    parts: [
      part((p) => cylinder(p, C, C, 1.4, 0, 9), wood),
      part((p) => cylinder(p, C, C, 5, 0, 1, 0.3), wood),
      part((p) => cylinder(p, C, C, 10, 8.5, 10, 0.5), wood),
      part((p) => cylinder(p, C + 2, C - 1, 1.1, 10, 12.5, 0.3), () => ({ albedo: hex('#ffd27a'), emit: scale(hex('#ffb040'), 0.9), tag: 'lights' })),
    ],
  }
}

export function cellBunk(ground) {
  return {
    ground,
    top: 12,
    parts: [
      part((p) => box(p, [C, C, 3.5], [13, 8, 3.5], 0.6), metal(hex('#7a848a'))),
      part((p) => box(p, [C, C, 7.5], [12, 7, 1], 0.9), matte(hex('#5a6a7a'), { vary: 0.12 })),
      part((p) => ellipsoid(p, [C - 9, C, 9], [3, 5, 1.6]), matte(hex('#a8b0b8'))),
    ],
  }
}

export function templePillar(ground) {
  const stone = (p) => {
    const a = Math.atan2(p[1] - C, p[0] - C)
    return { albedo: scale(hex('#a8987a'), (Math.abs(Math.sin(a * 6)) > 0.95 ? 0.8 : 1) * (0.85 + fbm3(p[0] * 0.3, p[1] * 0.3, p[2] * 0.3, 2) * 0.25)), spec: 0.15 }
  }
  return {
    ground,
    top: 50,
    parts: [
      part((p) => Math.min(box(p, [C, C, 2.5], [10, 10, 2.5], 0.4), box(p, [C, C, 44], [10, 10, 2.2], 0.4)), stone),
      part((p) => cylinder(p, C, C, 6.8 - Math.abs(Math.sin(Math.atan2(p[1] - C, p[0] - C) * 6)) * 0.4, 5, 42), stone),
      part((p) => torus(p, C, C, 30, 7, 0.5), () => ({ albedo: hex('#d8b040'), emit: scale(hex('#d8b040'), 0.25), spec: 0.8, shininess: 50 })),
    ],
  }
}

export function altar(ground) {
  return {
    ground,
    top: 22,
    parts: [
      part((p) => Math.min(box(p, [C, C, 5], [12, 10, 5], 0.6), box(p, [C, C, 12], [10, 8, 2], 0.5)), matte(hex('#5a4a3a'), { vary: 0.2 })),
      part((p) => Math.min(torus(p, C, C, 14, 5, 0.6), sphere(p, [C, C, 15.5], 2.2)), (p) => (p[2] > 14.5 && Math.hypot(p[0] - C, p[1] - C) < 2.5 ? { albedo: hex('#fff0a0'), emit: scale(hex('#ffe070'), 1.2), tag: 'glow' } : { albedo: hex('#d8b040'), spec: 0.8, shininess: 50, emit: scale(hex('#d8b040'), 0.15) })),
    ],
  }
}

export function eggPod(ground) {
  return pods(ground, {
    pods: [[C, C, 7, 1.4], [C + 7, C - 5, 4.5, 1.3], [C - 7, C + 4, 5, 1.2]],
    mat: (p, n) => {
      const vein = Math.abs(noise3(p[0] * 0.6, p[1] * 0.6, p[2] * 0.6, 3) - 0.5) < 0.04
      if (n[2] > 0.7) return { albedo: hex('#a8e060'), emit: scale(hex('#a8e060'), 0.4), spec: 0.8, shininess: 50, tag: 'glow' }
      return { albedo: vein ? hex('#4a2a18') : scale(hex('#8a6a48'), 0.8 + noise3(p[0] * 0.4, p[1] * 0.4, p[2] * 0.4, 2) * 0.3), spec: 0.6, shininess: 40 }
    },
  })
}

export function alienConsole(ground) {
  return {
    ground,
    top: 30,
    parts: [
      part((p) => smin(cone(p, C, C, 0, 7, 18, 4), ellipsoid(p, [C, C, 22], [11, 9, 4]), 3), (p) => ({ albedo: scale(hex('#5a4a7a'), 0.8 + noise3(p[0] * 0.4, p[1] * 0.4, p[2] * 0.4, 2) * 0.3), spec: 0.6, shininess: 40 })),
      part((p) => ellipsoid(p, [C, C, 25.2], [7, 5.5, 1.2]), (p) => ({ albedo: hex('#c070ff'), emit: scale(hex('#c070ff'), 0.6 + 0.4 * Math.sin(Math.hypot(p[0] - C, p[1] - C) * 2)), tag: 'lights' })),
    ],
  }
}

export function bioPod(ground) {
  return pods(ground, {
    pods: [[C, C, 7.5, 0.9], [C + 6, C + 4, 3, 1, 9], [C - 5, C - 4, 2.6, 1, 8]],
    mat: (p, n) => (p[2] > 9 || n[2] > 0.8 ? { albedo: hex('#ff7ad0'), emit: scale(hex('#ff7ad0'), 0.7), tag: 'glow', spec: 0.6 } : { albedo: scale(hex('#6a3a6a'), 0.8 + noise3(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, 2) * 0.3), spec: 0.6, shininess: 40 }),
    stalk: { r: 0.7, mat: matte(hex('#4e2a4e')) },
  })
}

export function debris(ground) {
  return {
    ground,
    top: 24,
    parts: [
      part((p) => grounded(Math.min(box(p, [C - 3, C + 2, 4], [8, 6, 4], 0.6), box(p, [C + 6, C - 4, 6], [4, 3, 6], 0.4)) + (noise3(p[0] * 0.4, p[1] * 0.4, p[2] * 0.4, 3) - 0.5) * 2, p), metal(hex('#5c6870'))),
      part((p) => capsule(p, [C - 10, C - 6, 2], [C + 4, C + 8, 12], 1), metal(hex('#4a4440'))),
      part((p) => sphere(p, [C + 6, C - 4, 13], 1.2), glow(hex('#ff6b3d'), 1.2, 'lights')),
    ],
  }
}

export function mangrove(ground) {
  const t = tree(ground, { trunk: hex('#5a4832'), leaves: [hex('#2a3f1a'), hex('#5a7a3a')], h: 40, crownR: 13, crownZ: 30, trunkR: 1.6, seed: 6, squash: 0.55 })
  const roots = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + 0.4
    return [C + Math.cos(a) * 11, C + Math.sin(a) * 11]
  })
  return {
    ...t,
    parts: [
      ...t.parts.map((item, i) => (i === 0 ? { ...item, sdf: (p) => taper(p, [C, C, 12], [C, C, 30], 2.2, 1.2) } : item)),
      part((p) => Math.min(...roots.map(([x, y]) => Math.min(taper(p, [C, C, 13], [(x + C) / 2, (y + C) / 2, 10], 1.5, 1.1), taper(p, [(x + C) / 2, (y + C) / 2, 10], [x, y, -1], 1.1, 0.8)))), bark(hex('#4a3a28'))),
    ],
  }
}

export function acacia(ground) {
  return {
    ground,
    top: 38,
    parts: [
      part((p) => Math.min(taper(p, [C, C, 0], [C - 3, C + 2, 18], 1.8, 1.1), taper(p, [C - 3, C + 2, 18], [C - 7, C + 4, 27], 1.1, 0.6), taper(p, [C - 3, C + 2, 18], [C + 5, C - 3, 27], 1, 0.6)), bark(hex('#6a4a2e'))),
      part((p) => ellipsoid(p, [C - 1, C, 29], [15, 14, 3.6]) - (fbm3(p[0] * 0.35, p[1] * 0.35, p[2] * 0.35, 3) - 0.5) * 2.6, leafy([hex('#3a5220'), hex('#7a9a40')], 5)),
    ],
  }
}

export function driftwood(ground) {
  return {
    ground,
    top: 10,
    parts: [part((p) => grounded(Math.min(taper(p, [C - 12, C + 5, 2], [C + 10, C - 4, 3], 2.6, 1.4), taper(p, [C + 2, C, 3], [C + 6, C + 9, 5], 1.2, 0.4)), p), (p) => ({ albedo: scale(hex('#a89880'), 0.75 + noise3(p[0] * 0.4, p[1] * 0.4, p[2] * 3, 4) * 0.4), spec: 0.08 }))],
  }
}

export function glassShards(ground) {
  return spire(ground, { colour: hex('#55527a'), h: 20, r: 3.5, seed: 4, shards: 4 })
}
