// Mock layered portraits (placeholder art): for a few portraits.json entries, writes the layers the portrait
// compositor stacks (components/useUniformImage.js), in the flat style of the existing mock portraits:
//   public/art/portraits/layers/<portrait id>/character.png and uniform.png  (480 x 600, head and shoulders; drawn over
//     the portrait's backdropImage, see makePortraitBackdrops.mjs)
//   public/art/portraits/layers/<portrait id>/{background,uniform,face,insignia}-full.png (1400 x 2000, full body)
// The uniform layers are greyscale (white shirt, near-black collar, cuffs, trousers and boots) so the game can tint them.
// Never touches the flat portraits. Run: node scripts/makePortraitLayers.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { above, createLayer, ellipse, fill, intersect, polygon, radialBackground, roundRect, smile, stroke, union, writeLayer } from './portraitDraw.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'art', 'portraits', 'layers')

const BACKGROUNDS = {
  human: { inner: [28, 58, 110], outer: [6, 12, 26] },
  vulcan: { inner: [48, 36, 80], outer: [8, 8, 18] },
}

const PORTRAITS = [
  { id: 'human-male-1', species: 'human', skin: [240, 200, 165], hair: [52, 34, 24], hairStyle: 'short', ears: 'round' },
  { id: 'human-female-2', species: 'human', skin: [222, 162, 104], hair: [112, 66, 34], hairStyle: 'long', ears: 'round' },
  { id: 'vulcan-male-1', species: 'vulcan', skin: [236, 200, 160], hair: [22, 20, 24], hairStyle: 'bowl', ears: 'pointed' },
]

const WHITE = [255, 255, 255]
const SLEEVE = [240, 240, 240]
const DARK = [20, 20, 20]
const BOOT = [10, 10, 10]
const EYE = [28, 22, 22]
const MOUTH = [150, 90, 70]
const INSIGNIA = [246, 185, 40]

// ---------- Head and shoulders (480 x 600) ----------

function headLayers(portrait) {
  const W = 480
  const H = 600
  const { skin, hair } = portrait

  const character = createLayer(W, H)
  if (portrait.hairStyle === 'long') fill(character, union(ellipse(240, 245, 96, 98), polygon([[144, 245], [336, 245], [352, 520], [128, 520]])), hair)
  fill(character, roundRect(212, 320, 268, 520, 12), skin)
  if (portrait.ears === 'pointed') {
    fill(character, union(ellipse(158, 274, 13, 24), polygon([[146, 266], [168, 252], [136, 206]])), skin)
    fill(character, union(ellipse(322, 274, 13, 24), polygon([[334, 266], [312, 252], [344, 206]])), skin)
  } else {
    fill(character, ellipse(158, 274, 13, 24), skin)
    fill(character, ellipse(322, 274, 13, 24), skin)
  }
  fill(character, ellipse(240, 258, 80, 102), skin)
  const cap = { short: intersect(ellipse(240, 250, 84, 98), above(212)), long: intersect(ellipse(240, 248, 86, 96), above(204)), bowl: intersect(ellipse(240, 252, 86, 100), above(220)) }
  fill(character, cap[portrait.hairStyle], hair)
  fill(character, ellipse(208, 256, 10, 6), EYE)
  fill(character, ellipse(272, 256, 10, 6), EYE)
  fill(character, stroke([[190, 238], [226, 235]], 5), hair)
  fill(character, stroke([[254, 235], [290, 238]], 5), hair)
  fill(character, smile(240, 306, 22, 10, 3), MOUTH)

  // Drawn over the character, so the collar sits over the neck.
  const uniform = createLayer(W, H)
  const shirt = ellipse(240, 700, 210, 240)
  fill(uniform, shirt, WHITE)
  fill(uniform, intersect(shirt, polygon([[140, 455], [340, 455], [340, 500], [240, 552], [140, 500]])), DARK)

  return { character, uniform }
}

// ---------- Full body (1400 x 2000) ----------

function fullLayers(portrait) {
  const W = 1400
  const H = 2000
  const background = createLayer(W, H)
  radialBackground(background, BACKGROUNDS[portrait.species], W / 2, H * 0.42)
  fill(background, ellipse(699, 1763, 195, 22), [0, 0, 0], 0.35)

  const uniform = createLayer(W, H)
  const torso = union(polygon([[531, 674], [869, 674], [801, 1103], [596, 1103]]), ellipse(699, 683, 170, 64))
  fill(uniform, roundRect(486, 713, 539, 1182, 26), SLEEVE)
  fill(uniform, roundRect(867, 713, 920, 1182, 26), SLEEVE)
  fill(uniform, torso, WHITE)
  fill(uniform, intersect(torso, polygon([[595, 610], [805, 610], [805, 640], [699, 703], [595, 640]])), DARK)
  fill(uniform, roundRect(486, 1148, 539, 1182, 4), DARK)
  fill(uniform, roundRect(867, 1148, 920, 1182, 4), DARK)
  fill(uniform, polygon([[594, 1099], [805, 1099], [811, 1664], [709, 1664], [699, 1256], [693, 1664], [586, 1664]]), DARK)
  fill(uniform, polygon([[578, 1664], [693, 1664], [689, 1748], [576, 1748]]), BOOT)
  fill(uniform, polygon([[705, 1664], [816, 1664], [824, 1748], [701, 1748]]), BOOT)

  const face = createLayer(W, H)
  const { skin, hair } = portrait
  if (portrait.hairStyle === 'long') fill(face, union(ellipse(699, 450, 82, 92), polygon([[621, 450], [777, 450], [785, 640], [613, 640]])), hair)
  fill(face, roundRect(674, 515, 727, 640, 10), skin)
  if (portrait.ears === 'pointed') {
    fill(face, union(ellipse(626, 466, 13, 23), polygon([[615, 458], [636, 446], [600, 400]])), skin)
    fill(face, union(ellipse(772, 466, 13, 23), polygon([[783, 458], [762, 446], [798, 400]])), skin)
  } else {
    fill(face, ellipse(626, 466, 13, 23), skin)
    fill(face, ellipse(772, 466, 13, 23), skin)
  }
  fill(face, ellipse(699, 453, 72, 88), skin)
  const cap = { short: intersect(ellipse(699, 445, 75, 86), above(410)), long: intersect(ellipse(699, 445, 76, 86), above(402)), bowl: intersect(ellipse(699, 447, 76, 88), above(420)) }
  fill(face, cap[portrait.hairStyle], hair)
  fill(face, ellipse(672, 451, 7, 4), EYE)
  fill(face, ellipse(726, 451, 7, 4), EYE)
  fill(face, stroke([[654, 432], [683, 428]], 4), hair)
  fill(face, stroke([[715, 428], [744, 432]], 4), hair)
  fill(face, smile(699, 498, 12, 6, 2.5), MOUTH)
  fill(face, ellipse(512, 1215, 28, 36), skin)
  fill(face, ellipse(893, 1215, 28, 36), skin)

  const insignia = createLayer(W, H)
  fill(insignia, polygon([[771, 776], [788, 800], [771, 812], [754, 800]]), INSIGNIA)

  return { background, uniform, face, insignia }
}

for (const portrait of PORTRAITS) {
  const folder = path.join(OUT, portrait.id)
  for (const [name, layer] of Object.entries(headLayers(portrait))) writeLayer(folder, name, layer)
  for (const [name, layer] of Object.entries(fullLayers(portrait))) writeLayer(folder, `${name}-full`, layer)
  console.log(`Wrote ${path.relative(ROOT, folder)}`)
}
