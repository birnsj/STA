// Placeholder d20 sprite sheet (src/data/adaptation/diceSprite.json): one row of square frames, the tumble frames then
// the landed frame (a face turned squarely to the viewer, a corner up, so the game can print the rolled number on it).
// A sparkly deep-blue resin icosahedron with paler swirls (designer reference, 2026-10-14), ray-cast analytically and
// lit like the v2 tiles and character sprites (scripts/v2/engine.mjs light, fill and highlight). Never overwrites the PNG without --force: the designer may have
// replaced it with real art of the same grid.
// Run: node scripts/makeDiceSprites.mjs [--force]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { add, clamp01, dot, FILL, HALF, hash, LIGHT, mix, noise, normalize, rgb, scale, smoothstep, VIEW } from './v2/engine.mjs'
import { encodePng } from './png.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/adaptation/diceSprite.json'), 'utf8'))
const FORCE = process.argv.includes('--force')
const SUBSAMPLES = 2
const FRAME = DATA.frameSize
const TUMBLE_FRAMES = DATA.tumbleFrames
const BEVEL = 0.09
// The resin: deep blue, swirled with a pale milky blue, flecked with glitter.
const DEEP = rgb('#1f2f9a')
const PALE = rgb('#b4bfe6')
const GLITTER = rgb('#e6ecff')

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
// 3x3 matrices as arrays of rows.
const mul = (m, v) => m.map((row) => dot(row, v))
const mulTransposed = (m, v) => [0, 1, 2].map((k) => m[0][k] * v[0] + m[1][k] * v[1] + m[2][k] * v[2])
const mulMatrices = (a, b) => a.map((row) => [0, 1, 2].map((k) => row[0] * b[0][k] + row[1] * b[1][k] + row[2] * b[2][k]))
const columns = (a, b, c) => [0, 1, 2].map((k) => [a[k], b[k], c[k]])
function rotation(axis, angle) {
  const [x, y, z] = normalize(axis)
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const t = 1 - c
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ]
}

// The icosahedron: 12 vertices, and the 20 faces as the triangles whose sides are all edges (length 2).
const PHI = (1 + Math.sqrt(5)) / 2
const VERTICES = []
for (const a of [-1, 1]) for (const b of [-PHI, PHI]) VERTICES.push([0, a, b], [a, b, 0], [b, 0, a])
const isEdge = (i, j) => Math.abs(Math.hypot(...sub(VERTICES[i], VERTICES[j])) - 2) < 1e-6
const FACES = []
for (let i = 0; i < 12; i += 1)
  for (let j = i + 1; j < 12; j += 1)
    for (let k = j + 1; k < 12; k += 1) if (isEdge(i, j) && isEdge(j, k) && isEdge(i, k)) FACES.push([i, j, k])
const NORMALS = FACES.map((face) => normalize(face.map((i) => VERTICES[i]).reduce(add)))
const INRADIUS = dot(NORMALS[0], VERTICES[FACES[0][0]])
const CIRCUMRADIUS = Math.hypot(...VERTICES[0])

// The screen: the tiles' view direction, x to the screen's right and y up.
const RIGHT = normalize([1, -1, 0])
const UP = normalize(cross(RIGHT, VIEW))
const PIXELS_PER_UNIT = (FRAME / 2 - 4) / CIRCUMRADIUS

// The landed pose: face 0 towards the viewer with one of its corners straight up.
const faceCentre = scale(NORMALS[0], INRADIUS)
const corner = normalize(sub(VERTICES[FACES[0][0]], faceCentre))
const LANDED = mulMatrices(columns(VIEW, UP, cross(VIEW, UP)), [NORMALS[0], corner, cross(NORMALS[0], corner)])
// The tumble ends in the landed pose: two turns about one axis and one about another, unwinding to nothing.
const tumble = (t) => mulMatrices(LANDED, mulMatrices(rotation([0.6, 1, 0.3], 4 * Math.PI * (1 - t)), rotation([1, -0.2, 0.7], 2 * Math.PI * (1 - t))))
const POSES = [...Array.from({ length: TUMBLE_FRAMES }, (_, k) => tumble(k / TUMBLE_FRAMES)), LANDED]

// The resin's colour at a point in die space, so the swirls and glitter turn with the die.
function resin([x, y, z]) {
  const swirl = 0.6 * noise(x * 1.6 + z * 0.7, y * 1.6 - z * 0.4, 11) + 0.4 * noise(y * 3.1 + x * 0.5, z * 3.1 + x, 12)
  const colour = mix(DEEP, PALE, 0.85 * smoothstep(0.42, 0.78, swirl))
  const fleck = hash(Math.floor(x * 30 + z * 7), Math.floor(y * 30 - z * 11), 13)
  return fleck > 0.97 ? mix(colour, GLITTER, 0.7) : colour
}

// The colour of the die where a ray through screen point (sx, sy) meets it, or null. The icosahedron is the 20
// half-spaces n . p <= inradius, so a ray enters through the last plane it crosses inwards.
function shade(normals, pose, sx, sy) {
  const origin = add(add(scale(RIGHT, sx), scale(UP, sy)), scale(VIEW, 10))
  const direction = scale(VIEW, -1)
  let enter = -Infinity
  let exit = Infinity
  let face = -1
  normals.forEach((normal, index) => {
    const along = dot(normal, direction)
    const t = (INRADIUS - dot(normal, origin)) / along
    if (along < 0 && t > enter) [enter, face] = [t, index]
    if (along > 0 && t < exit) exit = t
  })
  if (face < 0 || enter >= exit) return null
  const point = add(origin, scale(direction, enter))
  // A bevel: within BEVEL of an edge the normal leans towards the neighbouring face, so edges catch the light.
  let normal = normals[face]
  normals.forEach((other, index) => {
    if (index === face) return
    const gap = INRADIUS - dot(other, point)
    if (gap < BEVEL) normal = add(normal, scale(other, 0.5 * (1 - gap / BEVEL)))
  })
  normal = normalize(normal)
  const light = 0.48 + 0.55 * clamp01(dot(normal, LIGHT)) + 0.15 * clamp01(dot(normal, FILL))
  const highlight = 0.4 * clamp01(dot(normal, HALF)) ** 40
  return resin(mulTransposed(pose, point)).map((channel) => clamp01(channel * light + highlight))
}

function renderFrame(pose, sheet, width, column) {
  const normals = NORMALS.map((normal) => mul(pose, normal))
  for (let py = 0; py < FRAME; py += 1) {
    for (let px = 0; px < FRAME; px += 1) {
      let colour = [0, 0, 0]
      let covered = 0
      for (let sy = 0; sy < SUBSAMPLES; sy += 1) {
        for (let sx = 0; sx < SUBSAMPLES; sx += 1) {
          const x = (px + (sx + 0.5) / SUBSAMPLES - FRAME / 2) / PIXELS_PER_UNIT
          const y = -(py + (sy + 0.5) / SUBSAMPLES - FRAME / 2) / PIXELS_PER_UNIT
          const value = shade(normals, pose, x, y)
          if (value === null) continue
          colour = add(colour, value)
          covered += 1
        }
      }
      if (!covered) continue
      const at = (py * width + column * FRAME + px) * 4
      for (let channel = 0; channel < 3; channel += 1) sheet[at + channel] = Math.round((colour[channel] / covered) * 255)
      sheet[at + 3] = Math.round((covered / SUBSAMPLES ** 2) * 255)
    }
  }
}

const out = path.join(ROOT, 'public', DATA.image)
if (fs.existsSync(out) && !FORCE) {
  console.log(`${path.relative(ROOT, out)} exists; pass --force to overwrite it`)
} else {
  const width = FRAME * POSES.length
  const sheet = new Uint8Array(width * FRAME * 4)
  POSES.forEach((pose, column) => renderFrame(pose, sheet, width, column))
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, encodePng(width, FRAME, sheet))
  console.log(`wrote ${path.relative(ROOT, out)} (${width} x ${FRAME})`)
}
// The landed face's incircle (an edge-2 triangle's is 1 / sqrt 3) as a fraction of the frame, for diceSprite.json.
console.log(`landed face incircle radius: ${(PIXELS_PER_UNIT / Math.sqrt(3) / FRAME).toFixed(3)} of the frame`)
