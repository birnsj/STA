// Dropped-item pictures are drawn on the 64×96 tile grid, then fitted to the stacking cell.
// Large gear (scale 0.5) is a 128×192 file: 32×48 on the board, a 32×32 footprint, four per tile.
// Small gear (scale 0.25) is a 64×96 file: 16×24 on the board, a 16×16 footprint, sixteen per tile.
// The board does not scale further. File pixels ÷ 4 are the size (same ratio as a tile).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from './png.mjs'

export const PIXELS_PER_DESIGN = 4
const ALPHA = 12

// Stacking cell for each world picture. Large = half a tile, small = a quarter.
const LARGE = [
  'armouredVest',
  'clothing',
  'environmentSuit',
  'gintak',
  'klingonBatleth',
  'kurleth',
  'medkit',
  'medicalShotgun',
  'mekleth',
  'missionObject',
  'phaserRifle',
  'phaserRifle2255',
  'stackBoxBlue',
  'stackBoxGold',
  'stackBoxGreen',
  'stackBoxRed',
  'stackSlabBlack',
  'stackSlabWhite',
  'thermalSuit',
  'toolkit',
  'ushaantor',
  'vulcanLirpa',
]

export const STACK_SCALE = Object.fromEntries(LARGE.map((id) => [id, 0.5]))

export function stackScale(id) {
  return STACK_SCALE[id] ?? 0.25
}

// Box-filter a full-tile render down to its stacking cell. `scale` is the cell as a fraction of a tile.
export function fitBytes(bytes, width, height, scale) {
  const factor = Math.round(1 / scale)
  if (factor === 1) return { width, height, bytes }
  if (width % factor || height % factor) throw new Error(`cannot fit ${width}×${height} by 1/${factor}`)
  const outW = width / factor
  const outH = height / factor
  const out = new Uint8Array(outW * outH * 4)
  const area = factor * factor
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * width + (x * factor + dx)) * 4
          const alpha = bytes[i + 3]
          r += bytes[i] * alpha
          g += bytes[i + 1] * alpha
          b += bytes[i + 2] * alpha
          a += alpha
        }
      }
      const o = (y * outW + x) * 4
      if (a === 0) continue
      out[o] = Math.round(r / a)
      out[o + 1] = Math.round(g / a)
      out[o + 2] = Math.round(b / a)
      out[o + 3] = Math.round(a / area)
    }
  }
  return { width: outW, height: outH, bytes: out }
}

function opaqueBox(bytes, width, height) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bytes[(y * width + x) * 4 + 3] <= ALPHA) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return { opaqueWidth: 0, opaqueHeight: 0 }
  return { opaqueWidth: maxX - minX + 1, opaqueHeight: maxY - minY + 1 }
}

const ITEMS = fileURLToPath(new URL('../public/art/sprites/environment/items/', import.meta.url))
const PIXELS = fileURLToPath(new URL('../src/data/adaptation/itemArtPixels.json', import.meta.url))

// Rewrite itemArtPixels.json from the pictures on disk. The board reads this; it does not open the PNGs.
export function writeMeasuredPixels() {
  const images = {}
  for (const name of fs.readdirSync(ITEMS).filter((file) => file.endsWith('.png')).sort()) {
    const { width, height, bytes } = decodePng(fs.readFileSync(path.join(ITEMS, name)))
    images[`/art/sprites/environment/items/${name}`] = { width, height, ...opaqueBox(bytes, width, height) }
  }
  const json = {
    note: 'File pixels of each dropped-item picture, already fitted to its stacking cell. Board size is these pixels divided by pixelsPerDesign (4). Large gear is 128×192 (a 32×32 cell, four per tile). Small gear is 64×96 (a 16×16 cell, sixteen per tile). There is no further scale. Calibration pictures (cal*.png) are drawn on their own canvas; the opaque box is what the board measures.',
    pixelsPerDesign: PIXELS_PER_DESIGN,
    images,
  }
  fs.writeFileSync(PIXELS, `${JSON.stringify(json, null, 2)}\n`)
  return images
}

// Fit every full-tile picture in the items folder, then refresh the pixel catalogue.
export function fitItemSprites() {
  let fitted = 0
  for (const name of fs.readdirSync(ITEMS).filter((file) => file.endsWith('.png')).sort()) {
    const file = path.join(ITEMS, name)
    const decoded = decodePng(fs.readFileSync(file))
    const id = name.replace(/\.png$/, '')
    // Calibration fixtures are already their stacking cell. They are not full-tile renders.
    if (id.startsWith('cal')) continue
    const scale = stackScale(id)
    const targetW = Math.round(decoded.width * scale)
    if (decoded.width === targetW) continue
    if (decoded.width !== 256 || decoded.height !== 384) {
      throw new Error(`${name} is ${decoded.width}×${decoded.height}, not a full tile and not its cell`)
    }
    const next = fitBytes(decoded.bytes, decoded.width, decoded.height, scale)
    fs.writeFileSync(file, encodePng(next.width, next.height, next.bytes))
    console.log(`fitted ${name} → ${next.width}×${next.height}`)
    fitted += 1
  }
  const images = writeMeasuredPixels()
  console.log(`measured ${Object.keys(images).length} pictures (${fitted} resized)`)
  return images
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) fitItemSprites()
