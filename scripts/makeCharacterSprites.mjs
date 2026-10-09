// Placeholder full-body map sprites (src/data/adaptation/characterSprites.json): for each species and gender, one PNG
// per sheet (base: idle, walk, run; combat: attack, melee, cover; fall: the falls; sneak: crouched idle and walk), a row per drawn direction and the
// frames side by side, plus a uniform mask (opaque where the shirt is) for the department recolour. Rendered like the v2 tiles: the same isometric projection, light, fill and highlight
// (scripts/v2/engine.mjs) at 4x, so the figures stand in the same light as the world. Each figure is a handful of
// capsules and ellipsoids, ray-cast analytically. Never overwrites an existing PNG without --force: the designer may
// have replaced it with real art.
// Run: node scripts/makeCharacterSprites.mjs [set id ...] [--sheet=base|combat|fall|sneak] [--force]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { add, clamp01, dot, FILL, HALF, LIGHT, noise, normalize, scale } from './v2/engine.mjs'
import { encodePng } from './png.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/adaptation/characterSprites.json'), 'utf8'))
const FORCE = process.argv.includes('--force')
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
// 3x3 matrices as arrays of rows.
const mulMatrix = (m, v) => m.map((row) => dot(row, v))
const mulTransposed = (m, v) => [0, 1, 2].map((k) => m[0][k] * v[0] + m[1][k] * v[1] + m[2][k] * v[2])
const transpose = (m) => [0, 1, 2].map((k) => [m[0][k], m[1][k], m[2][k]])
const matMul = (a, b) => a.map((row) => [0, 1, 2].map((k) => row[0] * b[0][k] + row[1] * b[1][k] + row[2] * b[2][k]))
// Turns about the body's axes: pitch about y (positive tips the top forward, +x), roll about x (positive tips the top to
// the figure's left, +y), yaw about z (positive turns forward towards the left).
const pitchMatrix = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]]
const rollMatrix = (a) => [[1, 0, 0], [0, Math.cos(a), Math.sin(a)], [0, -Math.sin(a), Math.cos(a)]]
const yawMatrix = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]]

// ---------- materials ----------
const material = (colour, { spec = 0.12, shininess = 18, part = 'body', albedo = null } = {}) => ({ base: hex(colour), spec, shininess, part, albedo })
const SHIRT = material('#d9a92c', { spec: 0.16, shininess: 14, part: 'shirt' })
const COLLAR = material('#16161c', { spec: 0.2, shininess: 20 })
const TROUSERS = material('#20212b', { spec: 0.12, shininess: 16 })
const BOOTS = material('#121217', { spec: 0.45, shininess: 34 })
const INSIGNIA = material('#f0d890', { spec: 0.5, shininess: 30 })
const EYES = material('#17120e', { spec: 0.4, shininess: 40 })
const WEAPON = material('#4c4f58', { spec: 0.55, shininess: 36 })

// ---------- primitives (body space) ----------
// Ray-ellipsoid: the nearest t along a unit direction, with the body-space normal. A shape cut by `keep` (hair, the
// dress) is open where it is cut, so a ray entering through the opening sees the inside of the far wall.
// A turned ellipsoid has rot, the matrix from body space into its own axes.
function hitEllipsoid(shape, origin, direction) {
  const [rx, ry, rz] = shape.r
  const local = (v) => (shape.rot ? mulMatrix(shape.rot, v) : v)
  const oc = local(sub(origin, shape.c))
  const dl = local(direction)
  const o = [oc[0] / rx, oc[1] / ry, oc[2] / rz]
  const d = [dl[0] / rx, dl[1] / ry, dl[2] / rz]
  const a = dot(d, d)
  const b = dot(o, d)
  const disc = b * b - a * (dot(o, o) - 1)
  if (disc < 0) return null
  const surface = (t, side) => {
    const p = add(origin, scale(direction, t))
    const q = local(sub(p, shape.c))
    const n = [q[0] / (rx * rx), q[1] / (ry * ry), q[2] / (rz * rz)]
    return { t, p, n: scale(normalize(shape.rot ? mulTransposed(shape.rot, n) : n), side) }
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

const ellipsoid = (c, r, mat, keep = null, rot = null) => ({ kind: 'e', c, r, mat, keep, rot, bound: Math.max(...r) })
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
    const along = v3(Math.sin(forearm), 0, -Math.cos(forearm))
    put(ellipsoid(add(wrist, scale(along, 1.1)), [1.3, 1.1, 1.4], skin))
    // A hand weapon in the right hand, pointing along the forearm.
    if (pose.prop && index === 1) put(ellipsoid(add(wrist, scale(along, 2.4)), [2.3, 0.75, 0.95], WEAPON, null, [along, [0, 1, 0], [Math.cos(forearm), 0, Math.sin(forearm)]]))
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
  let figure = pose.lean ? leanForward(shapes, Math.tan(pose.lean)) : shapes
  for (const matrix of pose.turns ?? []) figure = turnAboutFeet(figure, matrix)
  return pose.turns ? ontoGround(figure) : figure
}

// Moves every shape by move (back undoes it; turn: the rotation's matrix, or null when the move only shifts or
// shears). Hairlines, skirt hems and Trill spots are tested where the point was before the move, so they stay put on
// the body.
function transformShapes(shapes, move, back, turn = null) {
  const inverse = turn && transpose(turn)
  return shapes.map((shape) => {
    const { albedo } = shape.mat
    const mat = albedo ? { ...shape.mat, albedo: (p) => albedo(back(p)) } : shape.mat
    if (shape.kind === 'c') return capsule(move(shape.a), move(shape.b), shape.r, mat)
    const { keep } = shape
    const rot = inverse ? (shape.rot ? matMul(shape.rot, inverse) : inverse) : shape.rot
    return ellipsoid(move(shape.c), shape.r, mat, keep && ((p) => keep(back(p))), rot)
  })
}

// Tilts the figure forward from the ground up (a shear: x moves by height * k).
const leanForward = (shapes, k) =>
  transformShapes(
    shapes,
    (p) => [p[0] + p[2] * k, p[1], p[2]],
    (p) => [p[0] - p[2] * k, p[1], p[2]],
  )

const turnAboutFeet = (shapes, matrix) =>
  transformShapes(
    shapes,
    (p) => mulMatrix(matrix, p),
    (p) => mulTransposed(matrix, p),
    matrix,
  )

// Lifts or drops a turned (falling) figure so its lowest point rests on the floor.
function ontoGround(shapes) {
  const lowest = Math.min(
    // The tail may lie under the body, so it doesn't lift the figure (the floor hides what is under it).
    ...shapes.filter((shape) => shape.mat.part !== 'tail').map((shape) => {
      if (shape.kind === 'c') return Math.min(shape.a[2], shape.b[2]) - shape.r
      const reach = shape.rot ? Math.hypot(...shape.rot.map((row, k) => row[2] * shape.r[k])) : shape.r[2]
      return shape.c[2] - reach
    }),
  )
  const rise = 0.3 - lowest
  return transformShapes(
    shapes,
    (p) => [p[0], p[1], p[2] + rise],
    (p) => [p[0], p[1], p[2] - rise],
  )
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
    const furry = material(species.hair[gender], { spec: 0.05, part: 'tail' })
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
      // Below the floor (a falling figure's tail): not drawn.
      if (!hit || hit.p[2] < 0 || (best && hit.t >= best.t)) continue
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

// One frame into the sheet (and the mask) at column, row. metrics: the sheet's entry in characterSprites.json.
function renderFrame(scene, metrics, sheet, mask, column, row, width) {
  const samples = SUBSAMPLES * SUBSAMPLES
  const res = metrics.resolution
  const frameW = metrics.frame.width * res
  const frameH = metrics.frame.height * res
  for (let oy = 0; oy < frameH; oy++) {
    for (let ox = 0; ox < frameW; ox++) {
      const colour = [0, 0, 0]
      let hits = 0
      let shirt = 0
      for (let sy = 0; sy < SUBSAMPLES; sy++) {
        for (let sx = 0; sx < SUBSAMPLES; sx++) {
          const px = (ox + (sx + 0.5) / SUBSAMPLES) / res - metrics.anchor.x
          const py = (oy + (sy + 0.5) / SUBSAMPLES) / res - metrics.anchor.y
          const result = scene(px, py)
          if (!result) continue
          hits++
          if (result.part === 'shirt') shirt++
          for (let k = 0; k < 3; k++) colour[k] += result.colour[k]
        }
      }
      if (!hits) continue
      const index = ((row * frameH + oy) * width + column * frameW + ox) * 4
      for (let k = 0; k < 3; k++) sheet[index + k] = Math.round(clamp01(colour[k] / hits) * 255)
      sheet[index + 3] = Math.round((hits / samples) * 255)
      if (mask && shirt * 2 >= hits) mask.set([255, 255, 255, 255], index)
    }
  }
}

// How far through a fall each of its frames is (it speeds up, then the last frame lies still).
const FALL_PROGRESS = [0, 0.12, 0.34, 0.64, 0.9, 1]
const pick = (values, frame) => values[Math.min(frame, values.length - 1)]

// Shooting: the right arm comes up level with the weapon, a kick on the shot, then lowers.
function attackPose(frame) {
  return {
    thigh: [deg(8), deg(-6)],
    knee: [deg(6), deg(4)],
    arm: [deg(6), deg(pick([15, 55, 88, 93, 88, 55], frame))],
    elbow: [deg(14), deg(pick([20, 12, 2, 0, 2, 12], frame))],
    breathe: 0,
    lean: deg(pick([1, 2, 2, -3, 1, 1], frame)),
    prop: true,
  }
}

// A melee strike: wind up, lunge with the right arm on the front foot, recover.
function meleePose(frame) {
  return {
    thigh: [deg(pick([0, -5, 6, 24, 22, 8], frame)), deg(pick([0, 4, -4, -14, -12, -4], frame))],
    knee: [deg(pick([4, 4, 6, 14, 12, 6], frame)), deg(pick([4, 6, 6, 4, 4, 4], frame))],
    arm: [deg(30), deg(pick([-10, -45, -20, 85, 78, 30], frame))],
    elbow: [deg(80), deg(pick([30, 110, 90, 4, 10, 40], frame))],
    breathe: 0,
    lean: deg(pick([0, -6, 2, 14, 12, 4], frame)),
  }
}

// In cover: down on the right knee, weapon ready, breathing.
function coverPose(frame, frames) {
  const breathe = Math.sin((frame / frames) * Math.PI * 2)
  return {
    thigh: [deg(80), deg(15)],
    knee: [deg(95), deg(105)],
    arm: [deg(30 + breathe), deg(40 + breathe)],
    elbow: [deg(60), deg(45)],
    breathe,
    lean: deg(10),
    prop: true,
  }
}

// The falls. e: 0 standing .. 1 down. turns tip the whole figure over about its feet before it is set on the floor.
function fallPose(animation, e) {
  const buckle = Math.sin(Math.PI * e)
  if (animation === 'fallBack') {
    return {
      thigh: [deg(25) * buckle, deg(18) * buckle],
      knee: [deg(45) * buckle, deg(35) * buckle],
      arm: [deg(10 + 130 * e), deg(10 + 110 * e)],
      elbow: [deg(20), deg(30)],
      breathe: 0,
      turns: [pitchMatrix(-deg(90) * e)],
    }
  }
  if (animation === 'fallForward') {
    return {
      thigh: [deg(30) * buckle, deg(30) * buckle],
      knee: [deg(60) * buckle, deg(60) * buckle],
      arm: [deg(10 + 160 * e), deg(10 + 150 * e)],
      elbow: [deg(25), deg(25)],
      breathe: 0,
      turns: [pitchMatrix(deg(90) * e)],
    }
  }
  if (animation === 'fallSpin') {
    return {
      thigh: [deg(20) * e, -deg(10) * e],
      knee: [deg(30) * e, deg(10) * e],
      arm: [deg(10 + 70 * e), deg(10 - 40 * e)],
      elbow: [deg(20), deg(40)],
      breathe: 0,
      turns: [rollMatrix(deg(88) * e), yawMatrix(deg(150) * e)],
    }
  }
  // fallCrumple: the knees go, the body slumps forward, then rolls onto its side.
  const kneel = Math.min(1, e / 0.55)
  const roll = Math.max(0, (e - 0.45) / 0.55)
  return {
    thigh: [deg(80) * kneel, deg(80) * kneel],
    knee: [deg(140) * kneel, deg(140) * kneel],
    arm: [deg(5 + 20 * kneel), deg(5 + 20 * kneel)],
    elbow: [deg(12 + 30 * kneel), deg(12 + 30 * kneel)],
    breathe: 0,
    lean: deg(25) * kneel,
    turns: [rollMatrix(deg(85) * roll)],
  }
}

// Sneaking: a crouch, leaning in, hands up in front; the walk takes short, low steps.
function sneakPose(animation, frame, frames) {
  const phase = (frame / frames) * Math.PI * 2
  if (animation === 'sneakIdle') {
    const breathe = Math.sin(phase)
    return { thigh: [deg(52), deg(46)], knee: [deg(86), deg(80)], arm: [deg(28 + breathe), deg(34 - breathe)], elbow: [deg(70), deg(64)], breathe, lean: deg(16) }
  }
  const swing = Math.sin(phase)
  return {
    thigh: [deg(48) + deg(16) * swing, deg(48) - deg(16) * swing],
    knee: [deg(78 + 22 * Math.max(0, Math.cos(phase))), deg(78 + 22 * Math.max(0, -Math.cos(phase)))],
    arm: [deg(26) - deg(6) * swing, deg(32) + deg(6) * swing],
    elbow: [deg(70), deg(64)],
    breathe: 0,
    lean: deg(18),
  }
}

function poseFor(animation, frame, frames) {
  if (animation.startsWith('sneak')) return sneakPose(animation, frame, frames)
  if (animation === 'attack') return attackPose(frame)
  if (animation === 'melee') return meleePose(frame)
  if (animation === 'cover') return coverPose(frame, frames)
  if (animation.startsWith('fall')) return fallPose(animation, pick(FALL_PROGRESS, frame))
  if (animation === 'idle') {
    const breathe = Math.sin((frame / frames) * Math.PI * 2)
    return { thigh: [deg(2), deg(-2)], knee: [deg(3), deg(3)], arm: [deg(3 + breathe), deg(3 - breathe)], breathe }
  }
  const phase = (frame / frames) * Math.PI * 2
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

// The set's PNG for a sheet: its base path with the sheet's suffix (rules/appearance.js spriteSheetFile).
const withSuffix = (file, suffix) => file.replace(/(-uniform)?\.png$/, `${suffix}$1.png`)

function makeSheet(set, sheetId) {
  const metrics = DATA.sheets[sheetId]
  const out = path.join(ROOT, 'public', withSuffix(set.sheet, metrics.suffix))
  if (fs.existsSync(out) && !FORCE) {
    console.log(`${set.id}: ${path.relative(ROOT, out)} exists, skipped (use --force to redraw)`)
    return
  }
  const columns = Math.max(...Object.values(metrics.animations).map((animation) => animation.start + animation.frames))
  const width = metrics.frame.width * metrics.resolution * columns
  const height = metrics.frame.height * metrics.resolution * DATA.directions.length
  const sheet = new Uint8Array(width * height * 4)
  const mask = set.uniformMask ? new Uint8Array(width * height * 4) : null
  DATA.directions.forEach((direction, row) => {
    for (const [name, animation] of Object.entries(metrics.animations)) {
      for (let frame = 0; frame < animation.frames; frame++) {
        const scene = frameScene(buildFigure(set.species, set.gender, poseFor(name, frame, animation.frames)), DIRECTION_ANGLE[direction])
        renderFrame(scene, metrics, sheet, mask, animation.start + frame, row, width)
      }
    }
  })
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, encodePng(width, height, sheet))
  if (mask) fs.writeFileSync(path.join(ROOT, 'public', withSuffix(set.uniformMask, metrics.suffix)), encodePng(width, height, mask))
  console.log(`${set.id}: wrote ${path.relative(ROOT, out)} (${width} x ${height})${mask ? ' and its uniform mask' : ''}`)
}

// node scripts/makeCharacterSprites.mjs [set id ...] [--sheet=base|combat|fall|sneak] [--force]
const args = process.argv.slice(2)
const sheetArg = args.find((arg) => arg.startsWith('--sheet='))?.slice('--sheet='.length)
const sheetIds = sheetArg ? [sheetArg] : Object.keys(DATA.sheets)
if (sheetArg && !DATA.sheets[sheetArg]) throw new Error(`Unknown sheet: ${sheetArg}`)
const wanted = args.filter((arg) => !arg.startsWith('--'))
const unknown = wanted.filter((id) => !DATA.sets.some((set) => set.id === id))
if (unknown.length) throw new Error(`Unknown sprite set(s): ${unknown.join(', ')}`)
for (const set of DATA.sets.filter((entry) => !wanted.length || wanted.includes(entry.id))) {
  for (const sheetId of sheetIds) makeSheet(set, sheetId)
}
