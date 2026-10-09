// Placeholder full-body map sprites (src/data/adaptation/characterSprites.json): one sheet per species and gender, a
// row per drawn direction, idle, walk and run frames side by side, plus a uniform mask (opaque where the shirt is) for the
// department recolour. Rendered like the v2 tiles: the same isometric projection, light, fill and highlight
// (scripts/v2/engine.mjs) at 4x, so the figures stand in the same light as the world. Each figure is a handful of
// capsules and ellipsoids, ray-cast analytically. Never overwrites an existing PNG without --force: the designer may
// have replaced it with real art.
// Run: node scripts/makeCharacterSprites.mjs [set id ...] [--force]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { add, clamp01, dot, FILL, HALF, LIGHT, noise, normalize, scale } from './v2/engine.mjs'
import { encodePng } from './png.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/adaptation/characterSprites.json'), 'utf8'))
const FORCE = process.argv.includes('--force')
const RES = DATA.resolution
const FRAME_W = DATA.frame.width * RES
const FRAME_H = DATA.frame.height * RES
const COLUMNS = Math.max(...Object.values(DATA.animations).map((animation) => animation.start + animation.frames))
const SUBSAMPLES = 2
// Body space: x forward, y to the figure's left, z up, in screen pixels. The map's 2:1 projection shows a horizontal
// length l (in tile texels) as l * sqrt 2 pixels across the screen, so body lengths are divided by K on the ground.
const K = Math.SQRT2
// The drawn directions as world angles (map x towards the bottom right, y towards the bottom left; screen down is +x +y).
const DIRECTION_ANGLE = { s: Math.PI / 4, se: 0, e: -Math.PI / 4, ne: -Math.PI / 2, n: (-3 * Math.PI) / 4 }

const hex = (value) => [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16) / 255)
const v3 = (x, y, z) => [x, y, z]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const deg = (value) => (value * Math.PI) / 180

// ---------- materials ----------
const material = (colour, { spec = 0.12, shininess = 18, part = 'body', albedo = null } = {}) => ({ base: hex(colour), spec, shininess, part, albedo })
const SHIRT = material('#d9a92c', { spec: 0.16, shininess: 14, part: 'shirt' })
const COLLAR = material('#16161c', { spec: 0.2, shininess: 20 })
const TROUSERS = material('#20212b', { spec: 0.12, shininess: 16 })
const BOOTS = material('#121217', { spec: 0.45, shininess: 34 })
const INSIGNIA = material('#f0d890', { spec: 0.5, shininess: 30 })
const EYES = material('#17120e', { spec: 0.4, shininess: 40 })

// ---------- primitives (body space) ----------
// Ray-ellipsoid: the nearest t along a unit direction, with the body-space normal. A shape cut by `keep` (hair, the
// dress) is open where it is cut, so a ray entering through the opening sees the inside of the far wall.
function hitEllipsoid(shape, origin, direction) {
  const [rx, ry, rz] = shape.r
  const o = [(origin[0] - shape.c[0]) / rx, (origin[1] - shape.c[1]) / ry, (origin[2] - shape.c[2]) / rz]
  const d = [direction[0] / rx, direction[1] / ry, direction[2] / rz]
  const a = dot(d, d)
  const b = dot(o, d)
  const disc = b * b - a * (dot(o, o) - 1)
  if (disc < 0) return null
  const surface = (t, side) => {
    const p = add(origin, scale(direction, t))
    const q = sub(p, shape.c)
    return { t, p, n: scale(normalize([q[0] / (rx * rx), q[1] / (ry * ry), q[2] / (rz * rz)]), side) }
  }
  const near = surface((-b - Math.sqrt(disc)) / a, 1)
  if (near.t < 0) return null
  if (!shape.keep || shape.keep(near.p)) return near
  const far = surface((-b + Math.sqrt(disc)) / a, -1)
  return shape.keep(far.p) ? { ...far, inside: true } : null
}

// Ray-capsule (segment a-b, radius r), after Inigo Quilez.
function hitCapsule(shape, origin, direction) {
  const { a: pa, b: pb, r } = shape
  const ba = sub(pb, pa)
  const oa = sub(origin, pa)
  const baba = dot(ba, ba)
  const bard = dot(ba, direction)
  const baoa = dot(ba, oa)
  const rdoa = dot(direction, oa)
  const oaoa = dot(oa, oa)
  const qa = baba - bard * bard
  const qb = baba * rdoa - baoa * bard
  const qc = baba * oaoa - baoa * baoa - r * r * baba
  const h = qb * qb - qa * qc
  let t = null
  if (h >= 0 && Math.abs(qa) > 1e-9) {
    const body = (-qb - Math.sqrt(h)) / qa
    const y = baoa + body * bard
    if (y > 0 && y < baba && body > 0) t = body
    else {
      const oc = y <= 0 ? oa : sub(origin, pb)
      const cb = dot(direction, oc)
      const ch = cb * cb - (dot(oc, oc) - r * r)
      if (ch > 0 && -cb - Math.sqrt(ch) > 0) t = -cb - Math.sqrt(ch)
    }
  }
  if (t === null) return null
  const p = add(origin, scale(direction, t))
  const along = clamp01(dot(sub(p, pa), ba) / baba)
  return { t, p, n: normalize(sub(sub(p, pa), scale(ba, along))) }
}

const ellipsoid = (c, r, mat, keep = null) => ({ kind: 'e', c, r, mat, keep, bound: Math.max(...r) })
const capsule = (a, b, r, mat) => ({ kind: 'c', a, b, r, mat, bound: r + Math.hypot(...sub(b, a)) / 2, c: scale(add(a, b), 0.5) })

// ---------- species ----------
// skin, hair: colours; build: { height, width } scales; features(add, head, figure) adds the species' details.
const SPECIES = {
  human: { skin: '#e0ab86', hair: { male: '#5a3a22', female: '#7a4424' } },
  vulcan: { skin: '#d8ad84', hair: { male: '#141214', female: '#141214' }, hairStyle: 'bowl', ears: 'pointed' },
  andorian: { skin: '#6f8fd6', hair: { male: '#ece6d4', female: '#ece6d4' }, ears: 'pointed', antennae: true },
  tellarite: { skin: '#c48c72', hair: { male: '#4a3020', female: '#5a3a28' }, build: { height: 0.94, width: 1.12 }, snout: true, beard: true },
  trill: { skin: '#e4b48e', hair: { male: '#3a2618', female: '#3a2618' }, spots: '#8c5a3e' },
  caitian: { skin: '#cc9a58', hair: { male: '#b07a40', female: '#b07a40' }, muzzle: '#f0e0c0', catEars: true, tail: true },
  klingon: { skin: '#8c5a3c', hair: { male: '#121012', female: '#121012' }, build: { height: 1.04, width: 1.1 }, ridges: true, armour: true, hairStyle: 'long' },
}

// The figure for one pose. pose: { thigh: [left, right], knee: [left, right], arm: [left, right], elbow?: [left, right],
// breathe, bounce?, lean? }, angles in radians (forward positive); bounce lifts the figure off the ground (pixels).
function buildFigure(speciesId, gender, pose) {
  const species = SPECIES[speciesId]
  const female = gender === 'female'
  const build = species.build ?? { height: 1, width: 1 }
  const hs = build.height
  const ws = build.width
  const skin = material(species.skin, {
    spec: speciesId === 'caitian' ? 0.05 : 0.14,
    shininess: 20,
    albedo: species.spots ? trillSpots(hex(species.skin), hex(species.spots)) : null,
  })
  const hair = material(species.hair[gender], { spec: 0.22, shininess: 26 })
  const shirt = species.armour ? material('#3b3530', { spec: 0.3, shininess: 22 }) : SHIRT
  const sleeve = species.armour ? material('#2a2624', { spec: 0.25, shininess: 20 }) : SHIRT
  const legs = female && !species.armour ? BOOTS : TROUSERS

  const shoulderHalf = (female ? 5.0 : 6.0) * ws
  const hipHalf = (female ? 2.9 : 2.7) * ws
  const hipZ = 23 * hs
  const thighLength = 10.5 * hs
  const shinLength = 10.5 * hs
  const shapes = []
  const put = (shape) => shapes.push(shape)

  // Legs and boots, then lift the whole figure so the lower boot rests on the ground.
  const feet = [1, -1].map((side, index) => {
    const hip = v3(0, side * hipHalf, hipZ)
    const thigh = pose.thigh[index]
    const shin = thigh - pose.knee[index]
    const knee = add(hip, v3(Math.sin(thigh) * thighLength, 0, -Math.cos(thigh) * thighLength))
    const ankle = add(knee, v3(Math.sin(shin) * shinLength, 0, -Math.cos(shin) * shinLength))
    return { hip, knee, ankle }
  })
  const lift = -Math.min(...feet.map(({ ankle }) => ankle[2])) + 1.7 + (pose.bounce ?? 0)
  const up = (point) => add(point, v3(0, 0, lift))
  for (const { hip, knee, ankle } of feet) {
    // Under the dress the thigh starts lower, so its top can't show through the skirt where it narrows to the waist.
    const thighTop = legs === BOOTS ? add(hip, scale(sub(knee, hip), 0.3)) : hip
    put(capsule(up(thighTop), up(knee), 2.3 * ws, TROUSERS))
    put(capsule(up(knee), up(ankle), 2.0 * ws, legs))
    put(capsule(up(ankle), up(add(ankle, v3(2.4, 0, -0.3))), 1.55 * ws, BOOTS))
  }

  const z = (value) => value * hs + lift - 1.7
  const breathe = pose.breathe
  // Pelvis (trousers, or the dress's skirt), torso and shoulders.
  // The dress flares to its hem: the upper half of an ellipsoid centred on the hem, narrowing into the waist.
  if (female && !species.armour) put(ellipsoid(v3(0, 0, z(19.6)), [4.3 * ws, hipHalf + 3.2, 8.5 * hs], shirt, (p) => p[2] > z(19.6)))
  else put(ellipsoid(v3(0, 0, z(24.5)), [3.2 * ws, hipHalf + 2.2, 3.6 * hs], TROUSERS))
  put(ellipsoid(v3(0, 0, z(32)), [3.4 * ws, shoulderHalf * 0.92, (8.4 + breathe * 0.2) * hs], shirt))
  const shoulderZ = z(38.2) + breathe * 0.25
  put(capsule(v3(0, -shoulderHalf + 1.6, shoulderZ), v3(0, shoulderHalf - 1.6, shoulderZ), 2.5 * ws, shirt))
  if (species.armour) put(capsule(v3(3.0 * ws, shoulderHalf - 1.5, shoulderZ), v3(3.2 * ws, -hipHalf - 1.2, z(25)), 0.9, material('#a7a7b0', { spec: 0.7, shininess: 40 })))
  else put(ellipsoid(v3(3.15 * ws, 2.1 * ws, z(35.2)), [0.5, 0.85, 1.15], INSIGNIA))

  // Arms: upper arm and forearm in the sleeve, then the hand.
  ;[1, -1].forEach((side, index) => {
    const swing = pose.arm[index]
    const bend = pose.elbow ? pose.elbow[index] : deg(12) + Math.max(0, swing) * 0.7
    const shoulder = v3(0, side * shoulderHalf, shoulderZ)
    const elbow = add(shoulder, v3(Math.sin(swing) * 7.6 * hs, side * 0.7, -Math.cos(swing) * 7.6 * hs))
    const forearm = swing + bend
    const wrist = add(elbow, v3(Math.sin(forearm) * 7 * hs, side * 0.3, -Math.cos(forearm) * 7 * hs))
    put(capsule(shoulder, elbow, 1.75 * ws, sleeve))
    put(capsule(elbow, wrist, 1.5 * ws, sleeve))
    put(ellipsoid(add(wrist, v3(Math.sin(forearm) * 1.1, 0, -Math.cos(forearm) * 1.1)), [1.3, 1.1, 1.4], skin))
  })

  // Neck, collar, head and face.
  put(capsule(v3(0.2, 0, z(39)), v3(0.3, 0, z(43.4)), 1.6 * ws, skin))
  if (!species.armour) put(ellipsoid(v3(0.15, 0, z(40.5)), [2.3 * ws, 2.4 * ws, 1.2], COLLAR))
  const head = v3(0.3, 0, z(46.6))
  put(ellipsoid(head, [3.0, 2.75 * Math.min(ws, 1.05), 3.6], skin))
  put(ellipsoid(add(head, v3(2.8, 0, -0.5)), [0.6, 0.45, 0.8], skin))
  ;[1, -1].forEach((side) => put(ellipsoid(add(head, v3(2.5, side * 1.05, 0.4)), [0.42, 0.42, 0.42], EYES)))
  addEars(species, head, skin, put)
  addHair(species, female, head, hair, put)
  addFeatures(species, gender, head, z, skin, hair, put)
  return pose.lean ? leanForward(shapes, Math.tan(pose.lean)) : shapes
}

// Tilts the figure forward from the ground up (a shear: x moves by height * k). Hairlines, skirt hems and Trill spots
// are tested where the point was before the tilt, so they stay put on the body.
function leanForward(shapes, k) {
  const tilt = (p) => [p[0] + p[2] * k, p[1], p[2]]
  const untilt = (p) => [p[0] - p[2] * k, p[1], p[2]]
  return shapes.map((shape) => {
    const { albedo } = shape.mat
    const mat = albedo ? { ...shape.mat, albedo: (p) => albedo(untilt(p)) } : shape.mat
    if (shape.kind === 'c') return capsule(tilt(shape.a), tilt(shape.b), shape.r, mat)
    const { keep } = shape
    return ellipsoid(tilt(shape.c), shape.r, mat, keep && ((p) => keep(untilt(p))))
  })
}

function trillSpots(skin, spot) {
  // Spots run down each side of the face and neck.
  return (p) => (Math.abs(p[1]) > 1.7 && p[2] > 38 && noise(p[0] * 1.6 + 7, p[2] * 1.6, 3) > 0.62 ? spot : skin)
}

function addEars(species, head, skin, put) {
  ;[1, -1].forEach((side) => {
    if (species.catEars) return
    if (species.ears === 'pointed') {
      put(capsule(add(head, v3(-0.2, side * 2.5, -0.4)), add(head, v3(-0.7, side * 3.15, 2.3)), 0.55, skin))
    } else put(ellipsoid(add(head, v3(-0.2, side * 2.65, -0.1)), [0.6, 0.4, 0.9], skin))
  })
}

// Hair: an ellipsoid over the skull, kept only behind a sloping hairline so the face shows (plus a bun or long hair).
function addHair(species, female, head, hair, put) {
  const relative = (p) => sub(p, head)
  const style = species.hairStyle ?? 'short'
  if (style === 'bowl') {
    put(ellipsoid(add(head, v3(-0.2, 0, 0.7)), [3.35, 3.05, 3.4], hair, (p) => relative(p)[2] > 1.15 || relative(p)[0] < -0.8))
  } else if (style === 'long') {
    put(ellipsoid(add(head, v3(-0.5, 0, 0.8)), [3.4, 3.1, 3.5], hair, (p) => relative(p)[0] < (relative(p)[2] - 0.3) * 1.2))
    put(ellipsoid(add(head, v3(-2.2, 0, -3.4)), [1.6, 3.4, 4.6], hair, (p) => relative(p)[0] < -0.8))
  } else {
    put(ellipsoid(add(head, v3(-0.5, 0, 0.8)), [3.4, 3.12, 3.5], hair, (p) => relative(p)[0] < (relative(p)[2] - 0.3) * 1.2))
  }
  if (female && style !== 'long') put(ellipsoid(add(head, v3(-2.6, 0, 1.6)), [1.9, 1.9, 2.1], hair))
}

function addFeatures(species, gender, head, z, skin, hair, put) {
  if (species.antennae) {
    ;[1, -1].forEach((side) => {
      const tip = add(head, v3(0.9, side * 2.2, 8.2))
      put(capsule(add(head, v3(0.3, side * 1.1, 3.0)), tip, 0.35, skin))
      put(ellipsoid(tip, [0.75, 0.75, 0.75], skin))
    })
  }
  if (species.snout) {
    put(ellipsoid(add(head, v3(3.0, 0, -0.9)), [1.4, 1.5, 1.15], skin))
    put(ellipsoid(add(head, v3(4.15, 0, -0.9)), [0.35, 0.9, 0.6], material('#5a3226')))
    if (gender === 'male' && species.beard) put(ellipsoid(add(head, v3(1.9, 0, -3.1)), [1.8, 2.6, 1.7], hair, (p) => p[0] > head[0] - 0.4))
  }
  if (species.muzzle) {
    put(ellipsoid(add(head, v3(2.85, 0, -1.0)), [1.25, 1.55, 1.1], material(species.muzzle, { spec: 0.05 })))
    put(ellipsoid(add(head, v3(4.0, 0, -0.5)), [0.35, 0.5, 0.35], material('#3a2418')))
  }
  if (species.catEars) {
    ;[1, -1].forEach((side) => put(capsule(add(head, v3(-0.3, side * 1.9, 2.6)), add(head, v3(-0.7, side * 2.5, 5.4)), 0.85, skin)))
  }
  if (species.tail) {
    const furry = material(species.hair[gender], { spec: 0.05 })
    put(capsule(v3(-3.0, 0, z(24)), v3(-6.5, 0.6, z(18)), 1.0, furry))
    put(capsule(v3(-6.5, 0.6, z(18)), v3(-8.0, 1.4, z(11)), 0.9, furry))
  }
  if (species.ridges) put(ellipsoid(add(head, v3(1.9, 0, 2.0)), [1.6, 2.4, 1.3], material('#6e4430', { spec: 0.1 })))
}

// ---------- rendering ----------
// Body space <-> world: the body turned to face `angle`, horizontal lengths divided by K on the ground.
function frameScene(shapes, angle) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const toBody = ([x, y, zz]) => [(x * cos + y * sin) * K, (-x * sin + y * cos) * K, zz]
  const toWorldNormal = ([x, y, zz]) => normalize([(x * cos - y * sin) * K, (x * sin + y * cos) * K, zz])
  const direction = normalize(toBody([-1, -1, -1]))
  // Each shape's centre on screen, to skip shapes nowhere near a pixel.
  const screenOf = (point) => {
    const x = (point[0] * cos - point[1] * sin) / K
    const y = (point[0] * sin + point[1] * cos) / K
    return [x - y, (x + y) / 2 - point[2]]
  }
  const culled = shapes.map((shape) => ({ shape, at: screenOf(shape.c), reach: shape.bound * 1.25 + 0.5 }))
  return (sx, sy) => {
    const ground = [sy + sx / 2, sy - sx / 2, 0]
    const origin = toBody([ground[0] + 200, ground[1] + 200, 200])
    let best = null
    for (const { shape, at, reach } of culled) {
      if (Math.abs(at[0] - sx) > reach || Math.abs(at[1] - sy) > reach) continue
      const hit = shape.kind === 'e' ? hitEllipsoid(shape, origin, direction) : hitCapsule(shape, origin, direction)
      if (!hit || (best && hit.t >= best.t)) continue
      best = { ...hit, mat: shape.mat }
    }
    if (!best) return null
    const n = toWorldNormal(best.n)
    const albedo = best.mat.albedo ? best.mat.albedo(best.p) : best.mat.base
    const light = 0.36 + 0.64 * Math.max(0, dot(n, LIGHT)) + 0.14 * Math.max(0, dot(n, FILL))
    // Lower parts a touch darker, as the tiles shade towards the floor.
    const ao = (0.8 + 0.2 * clamp01(best.p[2] / 48)) * (best.inside ? 0.55 : 1)
    const highlight = best.mat.spec * Math.max(0, dot(n, HALF)) ** best.mat.shininess
    return { colour: add(scale(albedo, light * ao), [highlight, highlight, highlight]), part: best.mat.part }
  }
}

// One frame into the sheet (and the mask) at column, row.
function renderFrame(scene, sheet, mask, column, row, width) {
  const samples = SUBSAMPLES * SUBSAMPLES
  for (let oy = 0; oy < FRAME_H; oy++) {
    for (let ox = 0; ox < FRAME_W; ox++) {
      const colour = [0, 0, 0]
      let hits = 0
      let shirt = 0
      for (let sy = 0; sy < SUBSAMPLES; sy++) {
        for (let sx = 0; sx < SUBSAMPLES; sx++) {
          const px = (ox + (sx + 0.5) / SUBSAMPLES) / RES - DATA.anchor.x
          const py = (oy + (sy + 0.5) / SUBSAMPLES) / RES - DATA.anchor.y
          const result = scene(px, py)
          if (!result) continue
          hits++
          if (result.part === 'shirt') shirt++
          for (let k = 0; k < 3; k++) colour[k] += result.colour[k]
        }
      }
      if (!hits) continue
      const index = ((row * FRAME_H + oy) * width + column * FRAME_W + ox) * 4
      for (let k = 0; k < 3; k++) sheet[index + k] = Math.round(clamp01(colour[k] / hits) * 255)
      sheet[index + 3] = Math.round((hits / samples) * 255)
      if (mask && shirt * 2 >= hits) mask.set([255, 255, 255, 255], index)
    }
  }
}

function poseFor(animation, frame) {
  if (animation === 'idle') {
    const breathe = Math.sin((frame / DATA.animations.idle.frames) * Math.PI * 2)
    return { thigh: [deg(2), deg(-2)], knee: [deg(3), deg(3)], arm: [deg(3 + breathe), deg(3 - breathe)], breathe }
  }
  const phase = (frame / DATA.animations[animation].frames) * Math.PI * 2
  const swing = Math.sin(phase)
  if (animation === 'run') {
    // Longer stride, the back leg folding high behind, arms bent and pumping, a lean, and a lift between footfalls.
    return {
      thigh: [deg(36) * swing, -deg(36) * swing],
      knee: [deg(14 + 76 * Math.max(0, Math.cos(phase))), deg(14 + 76 * Math.max(0, -Math.cos(phase)))],
      arm: [-deg(10) - deg(32) * swing, -deg(10) + deg(32) * swing],
      elbow: [deg(72), deg(72)],
      breathe: 0,
      bounce: 1.6 * Math.abs(swing),
      lean: deg(9),
    }
  }
  return {
    thigh: [deg(24) * swing, -deg(24) * swing],
    knee: [deg(6 + 34 * Math.max(0, Math.cos(phase))), deg(6 + 34 * Math.max(0, -Math.cos(phase)))],
    arm: [-deg(18) * swing, deg(18) * swing],
    breathe: 0,
  }
}

function makeSet(set) {
  const out = path.join(ROOT, 'public', set.sheet)
  if (fs.existsSync(out) && !FORCE) {
    console.log(`${set.id}: ${path.relative(ROOT, out)} exists, skipped (use --force to redraw)`)
    return
  }
  const width = FRAME_W * COLUMNS
  const height = FRAME_H * DATA.directions.length
  const sheet = new Uint8Array(width * height * 4)
  const mask = set.uniformMask ? new Uint8Array(width * height * 4) : null
  DATA.directions.forEach((direction, row) => {
    for (const [name, animation] of Object.entries(DATA.animations)) {
      for (let frame = 0; frame < animation.frames; frame++) {
        const scene = frameScene(buildFigure(set.species, set.gender, poseFor(name, frame)), DIRECTION_ANGLE[direction])
        renderFrame(scene, sheet, mask, animation.start + frame, row, width)
      }
    }
  })
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, encodePng(width, height, sheet))
  if (mask) fs.writeFileSync(path.join(ROOT, 'public', set.uniformMask), encodePng(width, height, mask))
  console.log(`${set.id}: wrote ${path.relative(ROOT, out)} (${width} x ${height})${mask ? ' and its uniform mask' : ''}`)
}

const wanted = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const unknown = wanted.filter((id) => !DATA.sets.some((set) => set.id === id))
if (unknown.length) throw new Error(`Unknown sprite set(s): ${unknown.join(', ')}`)
for (const set of DATA.sets.filter((entry) => !wanted.length || wanted.includes(entry.id))) makeSet(set)
