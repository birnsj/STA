/**
 * Bakes spike3d replaceable assets:
 * - Division tunic PNGs (command / operations / sciences) under public/art/models/characters/shared/
 * - README for dropping race GLBs at public/art/models/characters/{species}-{gender}.glb
 *
 * Race placeholder meshes are built in-engine (src/spike3d/raceMeshes/) until a GLB is present.
 *
 * Usage: node tools/bakeSpike3dRaceMeshes.mjs [--force]
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const outRoot = join(root, 'public', 'art', 'models', 'characters')
const force = process.argv.includes('--force')

const uniforms = JSON.parse(readFileSync(join(root, 'src/data/adaptation/uniforms.json'), 'utf8'))
const divisions = uniforms.divisions ?? []

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function parseHex(hex) {
  const raw = String(hex).replace('#', '')
  const n = parseInt(raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Soft vertical gradient tunic swatch (64×64). */
function tunicPng(hex, label) {
  const width = 64
  const height = 64
  const [br, bg, bb] = parseHex(hex)
  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1)
    const shade = 0.82 + 0.28 * (1 - Math.abs(t - 0.45) * 1.4)
    const fold = y % 8 < 1 ? 0.88 : 1
    const r = Math.round(Math.min(255, br * shade * fold))
    const g = Math.round(Math.min(255, bg * shade * fold))
    const b = Math.round(Math.min(255, bb * shade * fold))
    for (let x = 0; x < width; x++) {
      const seam = x % 16 === 0 ? 0.92 : 1
      const i = (y * width + x) * 4
      pixels[i] = Math.round(r * seam)
      pixels[i + 1] = Math.round(g * seam)
      pixels[i + 2] = Math.round(b * seam)
      pixels[i + 3] = 255
    }
  }
  // Tiny label strip so files are distinguishable in a folder view.
  const ink = [255, 255, 255]
  for (let i = 0; i < Math.min(label.length, 8); i++) {
    const x0 = 4 + i * 7
    for (let dy = 0; dy < 5; dy++) {
      for (let dx = 0; dx < 5; dx++) {
        if ((dy + dx + i) % 3 !== 0) continue
        const x = x0 + dx
        const y = 4 + dy
        if (x >= width || y >= height) continue
        const p = (y * width + x) * 4
        pixels[p] = ink[0]
        pixels[p + 1] = ink[1]
        pixels[p + 2] = ink[2]
      }
    }
  }

  const rows = []
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(1 + width * 4)
    pixels.copy(line, 1, y * width * 4, (y + 1) * width * 4)
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

function write(rel, buf) {
  const path = join(outRoot, rel)
  mkdirSync(dirname(path), { recursive: true })
  if (existsSync(path) && !force) return false
  writeFileSync(path, buf)
  return true
}

let created = 0
let skipped = 0
for (const div of divisions) {
  const rel = `shared/uniform-${div.id}.png`
  if (write(rel, tunicPng(div.colour, div.id))) created += 1
  else skipped += 1
}

const readme = `# Spike3d character models

Replaceable assets for map figures (procedural humans + race mesh kits).

## Uniforms (division tunic albedos)

- \`shared/uniform-command.png\`
- \`shared/uniform-operations.png\`
- \`shared/uniform-sciences.png\`

Colours match \`src/data/adaptation/uniforms.json\`. \`setUniformColour\` picks the nearest division texture — no mask shader.

## Race meshes (optional GLB overrides)

Until a file exists, the game builds a procedural kit in \`src/spike3d/raceMeshes/\`.

Drop a GLB at:

\`\`\`
{species}-{gender}.glb
\`\`\`

Examples: \`vulcan-male.glb\`, \`andorian-female.glb\`, \`caitian-male.glb\`, \`klingon-female.glb\`.

Requirements:

- Root (or a child named \`race_mesh\`) is attached under the humanoid \`headRoot\` joint.
- Shared animation stays on the procedural skeleton (\`HumanoidAnimator\`); the GLB is visual mesh only.
- Humans have no GLB — they use \`HumanoidModel\` as-is.
- \`mixedHeritage\` / \`newSpecies\` use the human mesh.

Bake uniforms: \`node tools/bakeSpike3dRaceMeshes.mjs [--force]\`
`
const readmePath = join(outRoot, 'README.md')
if (!existsSync(readmePath) || force) {
  writeFileSync(readmePath, readme)
  created += 1
} else skipped += 1

// Touch hash so CI / cache tools can detect content version.
writeFileSync(
  join(outRoot, 'shared', '.bake-id'),
  createHash('sha1')
    .update(divisions.map((d) => d.id + d.colour).join('|'))
    .digest('hex'),
)

console.log(`spike3d race/uniform bake: created ${created}, kept existing ${skipped}${force ? ' (--force)' : ''}`)
