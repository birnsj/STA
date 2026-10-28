/**
 * Writes temporary LCARS placard PNGs for every Starship Creator art path.
 * Each placard is a colored panel with a readable label of what it represents.
 * Real art can replace these files without code changes.
 * Layout mirrors src/ships/shipArtPaths.js.
 *
 * Usage: node tools/generateShipPngPlaceholders.mjs [--force]
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'art', 'ships')
const dataRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'data', 'ships')
const force = process.argv.includes('--force')

function readJson(name) {
  return JSON.parse(readFileSync(join(dataRoot, name), 'utf8'))
}

const spaceframeRows = readJson('spaceframes.json').spaceframes ?? []
const eraRows = readJson('timeframes.json').eras ?? []
const profileRows = readJson('missionProfiles.json').profiles ?? []
const serviceRows = readJson('serviceRecords.json').records ?? []
const narrative = readJson('serviceNarrative.json')
const eventRows = narrative.events ?? []
const reputationRows = narrative.reputations ?? []
const honorRows = narrative.honors ?? []
const talentRows = readJson('starshipTalents.json').talents ?? []
const finishing = readJson('finishingTouches.json')
const bridgeRows = finishing.bridges ?? []
const refits = [
  ['comms', 'Comms'],
  ['computers', 'Computers'],
  ['engines', 'Engines'],
  ['sensors', 'Sensors'],
  ['structure', 'Structure'],
  ['weapons', 'Weapons'],
]

const finishingJobs = [
  ...(finishing.hullMarkings ?? []).map((entry) => [`finishing/hull/${entry.id}.png`, `Hull: ${entry.name || entry.id}`]),
  ...(finishing.stripingStyles ?? []).map((entry) => [`finishing/striping/${entry.id}.png`, `Striping: ${entry.name || entry.id}`]),
  ...(finishing.nacelleCaps ?? []).map((entry) => [`finishing/nacelle/${entry.id}.png`, `Nacelle: ${entry.name || entry.id}`]),
  ...(finishing.emblemStyles ?? []).map((entry) => [`finishing/emblem/${entry.id}.png`, `Emblem: ${entry.name || entry.id}`]),
  ...(finishing.secondaryMarkings ?? []).map((entry) => [`finishing/secondary/${entry.id}.png`, `Secondary: ${entry.name || entry.id}`]),
]

const appearanceCatalog = readJson('appearanceCatalog.json')
const appearanceJobs = []
for (const category of appearanceCatalog.categories ?? []) {
  for (const slot of category.slots ?? []) {
    for (const option of slot.options ?? []) {
      const file = option.visual?.file
      if (!file) continue
      appearanceJobs.push([`appearance/${file}`, option.name || option.id])
    }
  }
}

// Compact 5×7 glyph bitmaps for A–Z, 0–9, and common punctuation. Bit 0 = top-left.
const GLYPH_W = 5
const GLYPH_H = 7
const FONT = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 31, 0, 0, 0],
  _: [0, 0, 0, 0, 0, 0, 31],
  '.': [0, 0, 0, 0, 0, 0, 4],
  ',': [0, 0, 0, 0, 4, 4, 8],
  ':': [0, 4, 0, 0, 4, 0, 0],
  '/': [1, 2, 2, 4, 8, 8, 16],
  '&': [6, 9, 10, 4, 10, 9, 22],
  "'": [4, 4, 0, 0, 0, 0, 0],
  '"': [10, 10, 0, 0, 0, 0, 0],
  '(': [4, 8, 8, 8, 8, 8, 4],
  ')': [4, 2, 2, 2, 2, 2, 4],
  '+': [0, 4, 4, 31, 4, 4, 0],
  '=': [0, 0, 31, 0, 31, 0, 0],
  '?': [14, 17, 1, 2, 4, 0, 4],
  '!': [4, 4, 4, 4, 4, 0, 4],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 19, 17, 17, 14],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [1, 1, 1, 1, 17, 17, 14],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [14, 17, 16, 14, 1, 17, 14],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14],
  1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 2, 4, 8, 31],
  3: [30, 1, 1, 14, 1, 1, 30],
  4: [2, 6, 10, 18, 31, 2, 2],
  5: [31, 16, 30, 1, 1, 17, 14],
  6: [14, 16, 16, 30, 17, 17, 14],
  7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 1, 14],
}

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function colorFor(label) {
  const h = createHash('md5').update(label).digest()
  return [20 + (h[0] % 40), 40 + (h[1] % 80), 90 + (h[2] % 120)]
}

function displayLabel(text) {
  return String(text ?? '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function wrapLines(text, maxChars) {
  const words = displayLabel(text).split(' ').filter(Boolean)
  if (!words.length) return ['?']
  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars) {
      current = next
      continue
    }
    if (current) lines.push(current)
    if (word.length <= maxChars) {
      current = word
    } else {
      for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars))
      current = ''
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 6)
}

function setPixel(pixels, width, x, y, rgb, alpha) {
  if (x < 0 || y < 0 || x >= width || y >= pixels.length / (width * 4)) return
  const i = (y * width + x) * 4
  pixels[i] = rgb[0]
  pixels[i + 1] = rgb[1]
  pixels[i + 2] = rgb[2]
  pixels[i + 3] = alpha
}

function drawGlyph(pixels, width, gx, gy, rows, scale, rgb, alpha) {
  for (let row = 0; row < GLYPH_H; row++) {
    const bits = rows[row] ?? 0
    for (let col = 0; col < GLYPH_W; col++) {
      if ((bits & (1 << (GLYPH_W - 1 - col))) === 0) continue
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          setPixel(pixels, width, gx + col * scale + dx, gy + row * scale + dy, rgb, alpha)
        }
      }
    }
  }
}

function placardPng(width, height, label, rgb, alpha = 255) {
  const pixels = Buffer.alloc(width * height * 4)
  const border = Math.max(3, Math.round(Math.min(width, height) / 60))
  const edge = [
    Math.min(255, rgb[0] + 45),
    Math.min(255, rgb[1] + 45),
    Math.min(255, rgb[2] + 45),
  ]
  const ink = [255, 220, 80]
  const panel = [
    Math.max(0, rgb[0] - 8),
    Math.max(0, rgb[1] - 8),
    Math.max(0, rgb[2] - 8),
  ]

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onEdge = x < border || y < border || x >= width - border || y >= height - border
      const color = onEdge ? edge : panel
      setPixel(pixels, width, x, y, color, alpha)
    }
  }

  const pad = Math.max(10, Math.round(Math.min(width, height) * 0.08))
  const scale = Math.max(2, Math.min(8, Math.floor(Math.min(width, height) / 55)))
  const charAdvance = (GLYPH_W + 1) * scale
  const lineHeight = (GLYPH_H + 2) * scale
  const maxChars = Math.max(6, Math.floor((width - pad * 2) / charAdvance))
  const lines = wrapLines(label, maxChars)
  const blockHeight = lines.length * lineHeight
  let y = Math.max(pad, Math.floor((height - blockHeight) / 2))

  for (const line of lines) {
    const lineWidth = line.length * charAdvance - scale
    let x = Math.max(pad, Math.floor((width - lineWidth) / 2))
    for (const ch of line) {
      const rows = FONT[ch] ?? FONT['?']
      drawGlyph(pixels, width, x, y, rows, scale, ink, 255)
      x += charAdvance
    }
    y += lineHeight
  }

  const rows = []
  for (let yRow = 0; yRow < height; yRow++) {
    const line = Buffer.alloc(1 + width * 4)
    pixels.copy(line, 1, yRow * width * 4, (yRow + 1) * width * 4)
    rows.push(line)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function write(rel, width, height, label, alpha = 255) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  if (existsSync(path) && !force) return false
  writeFileSync(path, placardPng(width, height, label || rel, colorFor(label || rel), alpha))
  return true
}

const jobs = []

for (const era of eraRows) {
  jobs.push([`eras/${era.id}.png`, 320, 180, era.name || era.id])
  jobs.push([`eras/${era.id}-feature.png`, 960, 540, `${era.name || era.id} Feature`])
  jobs.push([`eras/${era.id}-details.png`, 960, 540, `${era.name || era.id} Details`])
  jobs.push([`eras/${era.id}-characteristics.png`, 960, 540, `${era.name || era.id} Characteristics`])
}
jobs.push(['eras/feature.png', 960, 540, 'Era Feature'])
jobs.push(['eras/details.png', 960, 540, 'Era Details'])
jobs.push(['eras/characteristics.png', 960, 540, 'Era Characteristics'])
jobs.push(['summary.png', 480, 270, 'Ship Summary'])

for (const frame of spaceframeRows) {
  const name = frame.name || frame.id
  jobs.push([`classes/${frame.id}.png`, 960, 540, `${name} Class`])
  for (let v = 1; v <= 4; v++) jobs.push([`classes/${frame.id}-view-${v}.png`, 320, 180, `${name} View ${v}`])
  jobs.push([`technical/${frame.id}.png`, 960, 540, `${name} Technical`, 200])
}

for (const profile of profileRows) jobs.push([`profiles/${profile.id}.png`, 320, 180, profile.name || profile.id])
for (const record of serviceRows) jobs.push([`service/${record.id}.png`, 960, 540, record.name || record.id])
jobs.push(['service/none.png', 320, 180, 'No Service Record'])
for (const entry of eventRows) jobs.push([`service/events/${entry.id}.png`, 960, 540, entry.name || entry.summary || entry.id])
for (const entry of reputationRows) jobs.push([`service/reputation/${entry.id}.png`, 960, 540, entry.name || entry.summary || entry.id])
for (const entry of honorRows) jobs.push([`service/honors/${entry.id}.png`, 960, 540, entry.name || entry.summary || entry.id])
for (const [id, name] of refits) jobs.push([`refits/${id}.png`, 320, 180, `Refit: ${name}`])
for (const bridge of bridgeRows) jobs.push([`bridges/${bridge.id}.png`, 960, 540, `Bridge: ${bridge.name || bridge.id}`])
// Match bridges/appearance catalog (960×540) so Screen 06 choice + preview do not upscale tiny placards.
for (const [rel, label] of finishingJobs) jobs.push([rel, 960, 540, label])
for (const [rel, label] of appearanceJobs) jobs.push([rel, 960, 540, label, 180])
for (const talent of talentRows) jobs.push([`talents/${talent.id}.png`, 320, 180, talent.name || talent.id])
jobs.push(['ui/empty-selection.png', 320, 180, 'Empty Selection'])
jobs.push(['ui/unavailable.png', 256, 256, 'Unavailable'])

let created = 0
let skipped = 0
for (const [rel, w, h, label, alpha = 255] of jobs) {
  if (write(rel, w, h, label, alpha)) created += 1
  else skipped += 1
}

console.log(`Ship PNG placeholders: created ${created}, kept existing ${skipped}, total jobs ${jobs.length}${force ? ' (--force)' : ''}`)
