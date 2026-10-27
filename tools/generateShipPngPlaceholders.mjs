/**
 * Writes temporary LCARS placard PNGs for every Starship Creator art path.
 * Real art can replace these files without code changes.
 * Layout mirrors src/ships/shipArtPaths.js.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'art', 'ships')
const dataRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'data', 'ships')

function readJson(name) {
  return JSON.parse(readFileSync(join(dataRoot, name), 'utf8'))
}

const spaceframes = (readJson('spaceframes.json').spaceframes ?? []).map((entry) => entry.id)
const eras = (readJson('timeframes.json').eras ?? []).map((entry) => entry.id)
const profiles = (readJson('missionProfiles.json').profiles ?? []).map((entry) => entry.id)
const service = (readJson('serviceRecords.json').records ?? []).map((entry) => entry.id)
const narrative = readJson('serviceNarrative.json')
const events = (narrative.events ?? []).map((entry) => entry.id)
const reputations = (narrative.reputations ?? []).map((entry) => entry.id)
const honors = (narrative.honors ?? []).map((entry) => entry.id)
const refits = ['comms', 'computers', 'engines', 'sensors', 'structure', 'weapons']
const finishing = readJson('finishingTouches.json')
const bridges = (finishing.bridges ?? []).map((entry) => entry.id)
const talents = (readJson('starshipTalents.json').talents ?? []).map((entry) => entry.id)

const finishingJobs = [
  ...(finishing.hullMarkings ?? []).map((entry) => [`finishing/hull/${entry.id}.png`, entry.name || entry.id]),
  ...(finishing.stripingStyles ?? []).map((entry) => [`finishing/striping/${entry.id}.png`, entry.name || entry.id]),
  ...(finishing.nacelleCaps ?? []).map((entry) => [`finishing/nacelle/${entry.id}.png`, entry.name || entry.id]),
  ...(finishing.emblemStyles ?? []).map((entry) => [`finishing/emblem/${entry.id}.png`, entry.name || entry.id]),
  ...(finishing.secondaryMarkings ?? []).map((entry) => [`finishing/secondary/${entry.id}.png`, entry.name || entry.id]),
]

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

function solidPng(width, height, rgb, alpha = 255) {
  const row = Buffer.alloc(1 + width * 4)
  const rows = []
  for (let y = 0; y < height; y++) {
    const line = Buffer.from(row)
    for (let x = 0; x < width; x++) {
      const i = 1 + x * 4
      const edge = x < 4 || y < 4 || x >= width - 4 || y >= height - 4
      line[i] = edge ? Math.min(255, rgb[0] + 40) : rgb[0]
      line[i + 1] = edge ? Math.min(255, rgb[1] + 40) : rgb[1]
      line[i + 2] = edge ? Math.min(255, rgb[2] + 40) : rgb[2]
      line[i + 3] = alpha
    }
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

function colorFor(label) {
  const h = createHash('md5').update(label).digest()
  return [20 + (h[0] % 40), 40 + (h[1] % 80), 90 + (h[2] % 120)]
}

function write(rel, width, height, label, alpha = 255) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  if (existsSync(path) && !process.argv.includes('--force')) return false
  writeFileSync(path, solidPng(width, height, colorFor(label || rel), alpha))
  return true
}

const jobs = []

for (const id of eras) {
  jobs.push([`eras/${id}.png`, 320, 180, id])
  jobs.push([`eras/${id}-details.png`, 960, 540, `${id}-details`])
  jobs.push([`eras/${id}-characteristics.png`, 960, 540, `${id}-chars`])
}
jobs.push(['eras/details.png', 960, 540, 'details'])
jobs.push(['eras/characteristics.png', 960, 540, 'characteristics'])
jobs.push(['summary.png', 480, 270, 'summary'])

for (const id of spaceframes) {
  jobs.push([`classes/${id}.png`, 960, 540, id])
  for (let v = 1; v <= 4; v++) jobs.push([`classes/${id}-view-${v}.png`, 320, 180, `${id}-v${v}`])
  jobs.push([`technical/${id}.png`, 960, 540, `${id}-tech`, 200])
}

for (const id of profiles) jobs.push([`profiles/${id}.png`, 320, 180, id])
for (const id of service) jobs.push([`service/${id}.png`, 960, 540, id])
jobs.push(['service/none.png', 320, 180, 'none'])
for (const id of events) jobs.push([`service/events/${id}.png`, 960, 540, id])
for (const id of reputations) jobs.push([`service/reputation/${id}.png`, 960, 540, id])
for (const id of honors) jobs.push([`service/honors/${id}.png`, 960, 540, id])
// Card thumbs match era/profile carousel size (320×180) so Refits cards look like Spaceframe/Mission.
for (const id of refits) jobs.push([`refits/${id}.png`, 320, 180, id])
for (const id of bridges) jobs.push([`bridges/${id}.png`, 960, 540, id])
for (const [rel, label] of finishingJobs) jobs.push([rel, 320, 180, label])
for (const id of talents) jobs.push([`talents/${id}.png`, 320, 180, id])
jobs.push(['ui/empty-selection.png', 320, 180, 'empty'])
jobs.push(['ui/unavailable.png', 256, 256, 'unavailable'])

let created = 0
let skipped = 0
for (const [rel, w, h, label, alpha = 255] of jobs) {
  if (write(rel, w, h, label, alpha)) created += 1
  else skipped += 1
}

console.log(`Ship PNG placeholders: created ${created}, kept existing ${skipped}, total jobs ${jobs.length}`)
