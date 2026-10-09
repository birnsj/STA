// Uniform mask for one pixel-art portrait (the shirt, without collar, insignia, skin, hair or background), written as a
// separate PNG: white where the uniform is, transparent elsewhere. The portrait itself is only read, never changed.
// Semi-automatic: shirt-coloured pixels below the collar line, grown from the bright shirt colour so the shaded folds
// are included, minus the small pieces enclosed by the insignia's outline. Check the result by eye (it can be
// hand-edited like any PNG) before relying on it.
// Run: node scripts/makeUniformMask.mjs human-male-1   (or no argument for every portrait listed below)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from './png.mjs'

// Per portrait: the y below which the uniform can be (the collar line: no skin or hair in shirt colours under it),
// the shirt colour it is grown from, the shirt-tone hue range it may grow through, and the smallest region kept.
const DEFAULTS = { seedHue: [38, 62], toneHue: [15, 70], minRegion: 2000 }
const PORTRAITS = {
  'human-male-1': { below: 185 },
  'human-male-2': { below: 170 },
  'human-male-3': { below: 178 },
  'human-male-4': { below: 178 },
  'human-male-5': { below: 176 },
  'human-female-1': { below: 198 },
  'human-female-2': { below: 192 },
  'human-female-3': { below: 194 },
  'human-female-4': { below: 195 },
  'human-female-5': { below: 195 },
  'vulcan-male-1': { below: 195 },
  'vulcan-male-2': { below: 188 },
  'vulcan-male-3': { below: 190 },
  'vulcan-male-4': { below: 184 },
  'vulcan-male-5': { below: 186 },
  // Long neck in shirt-like tones reaching below the collar's ends: a separate ~5,000 px region, so only the
  // shirt-sized one is kept.
  'vulcan-female-1': { below: 220, minRegion: 10000 },
  'vulcan-female-2': { below: 208 },
  'vulcan-female-3': { below: 205 },
  'vulcan-female-4': { below: 206 },
  'vulcan-female-5': { below: 203 },
  'andorian-male-1': { below: 198 },
  'andorian-male-2': { below: 193 },
  'andorian-male-3': { below: 195 },
  'andorian-male-4': { below: 195 },
  'andorian-male-5': { below: 194 },
  'andorian-female-1': { below: 199 },
  'andorian-female-2': { below: 203 },
  'andorian-female-3': { below: 201 },
  'andorian-female-4': { below: 201 },
  'andorian-female-5': { below: 206 },
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ids = process.argv[2] ? [process.argv[2]] : Object.keys(PORTRAITS)
for (const id of ids) {
  if (!PORTRAITS[id]) throw new Error(`No mask settings for "${id}". Known: ${Object.keys(PORTRAITS).join(', ')}`)
  makeMask(id, { ...DEFAULTS, ...PORTRAITS[id] })
}

function makeMask(id, settings) {
const { width, height, bytes } = decodePng(fs.readFileSync(path.join(ROOT, 'public', 'art', 'portraits', `${id}.png`)))
const count = width * height

function hsv(index) {
  const [r, g, b] = [bytes[index * 4], bytes[index * 4 + 1], bytes[index * 4 + 2]]
  const max = Math.max(r, g, b)
  const delta = max - Math.min(r, g, b)
  let hue = 0
  if (delta) hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return { hue: (hue * 60 + 360) % 360, saturation: max ? delta / max : 0, value: max / 255 }
}

const opaque = (index) => bytes[index * 4 + 3] > 0
const row = (index) => Math.floor(index / width)
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]]

function flood(starts, canEnter) {
  const reached = new Uint8Array(count)
  const queue = starts.filter((index) => canEnter(index))
  queue.forEach((index) => (reached[index] = 1))
  while (queue.length) {
    const index = queue.pop()
    const x = index % width
    const y = row(index)
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const next = ny * width + nx
      if (!reached[next] && canEnter(next)) {
        reached[next] = 1
        queue.push(next)
      }
    }
  }
  return reached
}

const all = Array.from({ length: count }, (_, index) => index)

// Warm shirt tones, light to deep shadow (the collar is near-black and the insignia outline is pale, so both stop it).
const shirtTone = (index) => {
  if (!opaque(index) || row(index) < settings.below) return false
  const { hue, saturation, value } = hsv(index)
  return hue >= settings.toneHue[0] && hue <= settings.toneHue[1] && saturation >= 0.3 && value >= 0.12
}
const brightShirt = (index) => {
  const { hue, saturation, value } = hsv(index)
  return hue >= settings.seedHue[0] && hue <= settings.seedHue[1] && saturation >= 0.35 && value >= 0.25
}
const grown = flood(all.filter((index) => shirtTone(index) && brightShirt(index)), shirtTone)

// The shirt is one connected region; the insignia's gold sits inside its outline as separate small pieces, so only
// regions of at least minRegion pixels are kept.
const regions = []
const seen = new Uint8Array(count)
for (let index = 0; index < count; index++) {
  if (!grown[index] || seen[index]) continue
  const region = flood([index], (next) => grown[next] && !seen[next])
  const members = all.filter((next) => region[next])
  members.forEach((next) => (seen[next] = 1))
  regions.push(members)
}
console.log(`${id} regions (pixels):`, regions.map((members) => members.length).sort((a, b) => b - a).slice(0, 8).join(', '))

const mask = new Uint8Array(count * 4)
let pixels = 0
for (const members of regions.filter((members) => members.length >= settings.minRegion)) {
  for (const index of members) mask.set([255, 255, 255, 255], index * 4)
  pixels += members.length
}

const out = path.join(ROOT, 'public', 'art', 'portraits', 'masks', `${id}-uniform.png`)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, encodePng(width, height, mask))
console.log(`Wrote ${path.relative(ROOT, out)} (${width} x ${height}, ${pixels} uniform pixels)`)
}
