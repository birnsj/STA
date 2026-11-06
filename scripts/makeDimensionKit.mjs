// Dimension Kit — solid-but-lit AA test pieces (tiles, Template Pieces, items).
// Does not touch Calibration art, cal* catalogue entries, or Object Systems Regression.
// Usage: node scripts/makeDimensionKit.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png.mjs'
import { RESOLUTION, imageHeightFor as engineImageHeight } from './v2/engine.mjs'
import { paintPrismsAA } from './v2/templateDraw.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tileOut = path.join(root, 'public', 'art', 'sprites', 'environment', 'dimension')
const itemOut = path.join(root, 'public', 'art', 'sprites', 'environment', 'items')
const tplOut = path.join(root, 'public', 'art', 'sprites', 'environment', 'templates')

const SEAM = 1
const box = (x0, y0, x1, y1, z0, z1, colour) => ({ x0, y0, x1, y1, z0, z1, ...(colour ? { colour } : {}) })
const slab = (w, d, h, colour) => [box(-w - SEAM, -d - SEAM, 0, 0, 0, h, colour)]
// Exact footprint (no SEAM overshoot) — for tiny Dimension fixtures so Properties match the prism.
const exactBox = (w, d, h, colour) => [box(-w, -d, 0, 0, 0, h, colour)]
const straight = (len, thick, h, colour) => [box(-len - SEAM, -thick, 0, 0, 0, h, colour)]
const post = (s, h, colour) => [box(-s - SEAM, -s - SEAM, 0, 0, 0, h, colour)]
const cornerL = (run, thick, h, colour) => [
  box(-run - SEAM, -thick, 0, 0, 0, h, colour),
  box(-thick, -run - SEAM, 0, 0, 0, h, colour),
]
const TINY_COLOURS = {
  2: '#ff6b9d',
  4: '#ffb347',
  6: '#ffe14a',
  8: '#7dffd1',
  12: '#6aa0ff',
  16: '#c77dff',
}

function yawPoint(x, y, turns) {
  let dx = x
  let dy = y
  const n = ((turns % 4) + 4) % 4
  for (let i = 0; i < n; i++) {
    const nx = -dy
    const ny = dx
    dx = nx
    dy = ny
  }
  return [dx, dy]
}

function yawPrisms(prisms, turns) {
  if (!turns) return prisms
  return prisms.map((p) => {
    const [x0, y0] = yawPoint(p.x0, p.y0, turns)
    const [x1, y1] = yawPoint(p.x1, p.y1, turns)
    return { ...p, x0, y0, x1, y1 }
  })
}

function imageHeightFor(height) {
  if (!height || height <= 60) return 96
  return engineImageHeight(height)
}

function paint(prisms, colour, turns = 0) {
  return paintPrismsAA(yawPrisms(prisms, turns), { colour, yawTurns: turns, bloom: 0.22, subsamples: 3 })
}

function blitToTile(painted, physicalHeight) {
  const ih = imageHeightFor(physicalHeight)
  const tw = 64 * RESOLUTION
  const th = ih * RESOLUTION
  const out = new Uint8Array(tw * th * 4)
  const tipSrcX = painted.size.anchorX * RESOLUTION
  const tipSrcY = painted.size.h * RESOLUTION
  const tipDstX = 32 * RESOLUTION
  const tipDstY = (ih - 16) * RESOLUTION
  const ox = Math.round(tipDstX - tipSrcX)
  const oy = Math.round(tipDstY - tipSrcY)
  for (let y = 0; y < painted.height; y++) {
    for (let x = 0; x < painted.width; x++) {
      const dx = x + ox
      const dy = y + oy
      if (dx < 0 || dy < 0 || dx >= tw || dy >= th) continue
      const si = (y * painted.width + x) * 4
      if (painted.bytes[si + 3] < 8) continue
      const di = (dy * tw + dx) * 4
      out[di] = painted.bytes[si]
      out[di + 1] = painted.bytes[si + 1]
      out[di + 2] = painted.bytes[si + 2]
      out[di + 3] = painted.bytes[si + 3]
    }
  }
  return { bytes: out, width: tw, height: th, imageHeight: ih > 96 ? ih : null, ih }
}

// Tile canvas is always one cell (64 wide). Pieces wider than that must be Template Pieces only.
// Allow +SEAM (1) so a full-cell slab(-64-SEAM..) still counts as one tile.
function assertTileFootprint(id, footprintW, footprintD) {
  if (footprintW > 64 + SEAM || footprintD > 64 + SEAM) {
    throw new Error(`${id}: footprint ${footprintW}×${footprintD} exceeds the 64×64 tile canvas — use a Template Piece`)
  }
}

function hexRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function putPx(out, tw, th, x, y, rgb) {
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= tw || yi >= th) return
  const i = (yi * tw + xi) * 4
  out[i] = rgb[0]
  out[i + 1] = rgb[1]
  out[i + 2] = rgb[2]
  out[i + 3] = 255
}

function tilePointPx(dx, dy, z, ih) {
  return [32 * RESOLUTION + ((dx - dy) / 2) * RESOLUTION, (ih - 16) * RESOLUTION + ((dx + dy) / 4 - z) * RESOLUTION]
}

// Reference marks matching Calibration floors (centre cross / diamond / corner dots).
function stampFloorMarks(out, tw, th, ih, marks) {
  const tip = tilePointPx(0, 0, 0, ih)
  const mark = hexRgb('#f2c14e')
  const edge = hexRgb('#5ec8ff')
  const corner = hexRgb('#ff5a5a')
  if (marks === 'center' || marks === 'grid') {
    for (let i = -3 * RESOLUTION; i <= 3 * RESOLUTION; i++) {
      putPx(out, tw, th, tip[0] + i, tip[1], mark)
      putPx(out, tw, th, tip[0], tip[1] + i, mark)
    }
  }
  if (marks === 'grid' || marks === 'corners') {
    const pts = [
      tilePointPx(-32, -32, 0, ih),
      tilePointPx(32, -32, 0, ih),
      tilePointPx(32, 32, 0, ih),
      tilePointPx(-32, 32, 0, ih),
    ]
    for (let i = 0; i < 4; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % 4]
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])))
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        putPx(out, tw, th, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, edge)
      }
    }
  }
  if (marks === 'corners') {
    for (const [dx, dy] of [
      [-32, -32],
      [32, -32],
      [32, 32],
      [-32, 32],
    ]) {
      const [x, y] = tilePointPx(dx, dy, 0, ih)
      for (let oy = -RESOLUTION; oy <= RESOLUTION; oy++) {
        for (let ox = -RESOLUTION; ox <= RESOLUTION; ox++) putPx(out, tw, th, x + ox, y + oy, corner)
      }
    }
  }
}

// --- Colours (solid, distinct) ---
const C = {
  floor: '#3a4a5c',
  floorMark: '#f2c14e',
  block8: '#3ddc97',
  block16: '#4d8cff',
  block32: '#f0c14e',
  block64: '#e05a3c',
  block92: '#c77dff',
  platform8: '#2f8f62',
  platform16: '#2f7c93',
  platform32: '#3d5f93',
  wall: '#9aa3b2',
  wallHalf: '#6e7784',
  wallJoin: '#b7c0ce',
  thick: '#8b95a8',
  column: '#5ec8c0',
  steps: '#8d949e',
  table: '#c4884a',
  crate: '#a67c52',
  chair: '#4ecdc4',
  stool: '#e0a030',
  bench: '#7d9a4a',
  bed: '#6a7eb0',
  console: '#5c6b7a',
  consoleScreen: '#3ec6ff',
  locker: '#8a919c',
  shelf: '#c4b49a',
  odd: '#d13bd1',
  foot: '#7dffd1',
  box: '#ff7a6a',
}

function furnitureCrate(colour = C.crate) {
  return slab(40, 40, 16, colour)
}

function tipNormalize(prisms) {
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of prisms) {
    maxX = Math.max(maxX, p.x0, p.x1)
    maxY = Math.max(maxY, p.y0, p.y1)
  }
  return prisms.map((p) => ({
    ...p,
    x0: p.x0 - maxX,
    y0: p.y0 - maxY,
    x1: p.x1 - maxX,
    y1: p.y1 - maxY,
  }))
}

function chair() {
  return tipNormalize([
    box(-16, -8, -10, -2, 0, 8, C.chair),
    box(10, -8, 16, -2, 0, 8, C.chair),
    box(-16, 14, -10, 20, 0, 8, C.chair),
    box(10, 14, 16, 20, 0, 8, C.chair),
    box(-18, -6, 18, 20, 8, 12, C.chair),
    box(-18, -22, 18, -8, 8, 28, C.chair),
  ])
}
function stool() {
  return tipNormalize([box(-5, -5, 5, 5, 0, 12, C.stool), box(-14, -14, 14, 14, 12, 16, C.stool)])
}
function bench() {
  return tipNormalize([
    box(-28, -6, -20, 2, 0, 8, C.bench),
    box(20, -6, 28, 2, 0, 8, C.bench),
    box(-28, 10, -20, 16, 0, 8, C.bench),
    box(20, 10, 28, 16, 0, 8, C.bench),
    box(-30, -8, 30, 16, 8, 12, C.bench),
  ])
}
function bed() {
  return tipNormalize([
    box(-24, -16, 24, 26, 0, 8, C.bed),
    box(-28, -14, 28, 28, 8, 12, C.bed),
    box(-28, -28, 28, -16, 4, 24, C.bed),
  ])
}
function consoleDesk() {
  return tipNormalize([
    box(-24, 0, 24, 26, 0, 14, C.console),
    box(-30, -6, 30, 28, 14, 18, C.console),
    box(-18, -22, 18, -4, 18, 34, C.consoleScreen),
  ])
}
function locker() {
  return tipNormalize([box(-16, -16, 16, 16, 0, 52, C.locker), box(-2, 14, 2, 18, 22, 30, C.locker)])
}
function shelf() {
  return tipNormalize([
    box(-28, -22, -22, 22, 0, 36, C.shelf),
    box(22, -22, 28, 22, 0, 36, C.shelf),
    box(-22, -24, 22, -16, 0, 36, C.shelf),
    box(-22, -16, 22, 18, 10, 13, C.shelf),
    box(-22, -16, 22, 18, 22, 25, C.shelf),
    box(-22, -16, 22, 18, 34, 37, C.shelf),
  ])
}
function table() {
  return tipNormalize([
    box(-28, -28, -18, -18, 0, 14, C.table),
    box(18, -28, 28, -18, 0, 14, C.table),
    box(-28, 18, -18, 28, 0, 14, C.table),
    box(18, 18, 28, 28, 0, 14, C.table),
    box(-28, -28, 28, 28, 14, 16, C.table),
  ])
}

function steps(treads, colour = C.steps) {
  // treads: array of heights low→high; each tread depth = 64 / n along +Y from tip
  const n = treads.length
  const depth = 64 / n
  const prisms = []
  for (let i = 0; i < n; i++) {
    const y1 = -i * depth
    const y0 = -(i + 1) * depth
    prisms.push(box(-64, y0, 0, y1, 0, treads[i], colour))
  }
  return tipNormalize(prisms)
}

function oddL(colour = C.odd) {
  return tipNormalize([box(-32, -12, 0, 0, 0, 12, colour), box(-12, -32, 0, 0, 0, 12, colour)])
}
function oddU(colour = C.odd) {
  return tipNormalize([
    box(-32, -8, -24, 0, 0, 16, colour),
    box(-8, -8, 0, 0, 0, 16, colour),
    box(-32, -32, 0, -24, 0, 16, colour),
  ])
}
function oddRing(colour = C.odd) {
  return tipNormalize([
    box(-32, -32, 0, -24, 0, 8, colour),
    box(-32, -8, 0, 0, 0, 8, colour),
    box(-32, -24, -24, -8, 0, 8, colour),
    box(-8, -24, 0, -8, 0, 8, colour),
  ])
}
function oddNotch(colour = C.odd) {
  return tipNormalize([
    box(-32, -32, -16, 0, 0, 16, colour),
    box(-16, -32, 0, -16, 0, 16, colour),
  ])
}
function oddRamp(colour = C.steps) {
  return tipNormalize([
    box(-64, -16, 0, 0, 0, 6, colour),
    box(-64, -32, 0, -16, 0, 12, colour),
    box(-64, -48, 0, -32, 0, 18, colour),
    box(-64, -64, 0, -48, 0, 24, colour),
  ])
}
function oddTee(colour = C.thick) {
  return tipNormalize([
    box(-64, -16, 0, 16, 0, 92, colour),
    box(-16, -48, 16, -16, 0, 92, colour),
  ])
}
function oddCross(colour = C.thick) {
  return tipNormalize([
    box(-8, -32, 8, 32, 0, 92, colour),
    box(-32, -8, 32, 8, 0, 92, colour),
  ])
}
function oddZ(colour = C.odd) {
  return tipNormalize([
    box(-32, -8, 0, 0, 0, 12, colour),
    box(-20, -24, -12, -8, 0, 12, colour),
    box(-32, -32, 0, -24, 0, 12, colour),
  ])
}
function oddArch(colour = C.thick) {
  return tipNormalize([
    box(-32, -8, -20, 0, 0, 92, colour),
    box(-12, -8, 0, 0, 0, 92, colour),
    box(-32, -8, 0, 0, 64, 92, colour),
  ])
}
function oddAlcove(colour = C.thick) {
  return tipNormalize([
    box(-48, -8, 0, 0, 0, 92, colour),
    box(-48, -40, -40, -8, 0, 92, colour),
    box(-8, -40, 0, -8, 0, 92, colour),
  ])
}
function stepsWide(treads, run = 128, colour = C.steps) {
  const n = treads.length
  const depth = 64 / n
  const prisms = []
  for (let i = 0; i < n; i++) {
    const y1 = -i * depth
    const y0 = -(i + 1) * depth
    prisms.push(box(-run, y0, 0, y1, 0, treads[i], colour))
  }
  return tipNormalize(prisms)
}
function rampTall(colour = C.steps) {
  return tipNormalize([
    box(-64, -12, 0, 0, 0, 8, colour),
    box(-64, -24, 0, -12, 0, 16, colour),
    box(-64, -36, 0, -24, 0, 24, colour),
    box(-64, -48, 0, -36, 0, 32, colour),
    box(-64, -60, 0, -48, 0, 40, colour),
    box(-64, -72, 0, -60, 0, 48, colour),
  ])
}

// --- Catalogue builders ---
const tilePngs = []
const itemPngs = []
const tplPngs = []
const tileSpecs = []
const tplPieces = []
const itemSpecs = []

// Seed used symbols from the live catalogue so Dimension never collides with Calibration / production tiles.
let symbolCode = 0x013d // Ľ — first free after Calibration ļ when the kit was introduced
const usedSymbols = new Set()
{
  const tilesText = fs.readFileSync(path.join(root, 'src/data/adaptation/maps/tiles.json'), 'utf8')
  for (const line of tilesText.split('\n')) {
    if (/"id":\s*"dim/.test(line) || /"id":"dim/.test(line)) continue
    const m = line.match(/"symbol":\s*"([^"]+)"/)
    if (m) usedSymbols.add(m[1])
  }
  while (usedSymbols.has(String.fromCharCode(symbolCode))) symbolCode += 1
}

function nextSymbol() {
  while (usedSymbols.has(String.fromCharCode(symbolCode)) || symbolCode === 0x00d7 || symbolCode === 0x00f7) {
    symbolCode += 1
  }
  const s = String.fromCharCode(symbolCode)
  usedSymbols.add(s)
  symbolCode += 1
  return s
}

function addTile(id, label, kind, height, prisms, colour, extra = {}) {
  // Tip-anchored prisms for a one-cell tile must fit the 64×64 canvas after blit.
  let maxW = 0
  let maxD = 0
  for (const p of prisms) {
    maxW = Math.max(maxW, Math.abs(p.x1 - p.x0), Math.abs(p.x0), Math.abs(p.x1))
    maxD = Math.max(maxD, Math.abs(p.y1 - p.y0), Math.abs(p.y0), Math.abs(p.y1))
  }
  assertTileFootprint(id, Math.ceil(maxW), Math.ceil(maxD))
  const painted = paint(prisms, colour)
  const tile = blitToTile(painted, height || 3)
  if (extra.floorMarks) stampFloorMarks(tile.bytes, tile.width, tile.height, tile.ih, extra.floorMarks)
  tilePngs.push({ name: `${id}.png`, png: encodePng(tile.width, tile.height, tile.bytes) })
  const wall = kind === 'wall' || kind === 'corner' || kind === 'end' || kind === 'cross' || kind === 'thick' || kind === 'column'
  tileSpecs.push({
    id,
    symbol: nextSymbol(),
    label,
    kind,
    height: height ?? 0,
    imageHeight: tile.imageHeight,
    colour,
    wall,
    surface: extra.surface,
    cover: extra.cover,
    inset: extra.inset,
  })
}

function addTpl(id, label, tags, footprint, height, prisms, colour, flags = {}) {
  const painted0 = paint(prisms, colour, 0)
  const name0 = `${id}.png`
  tplPngs.push({ name: name0, png: painted0.png })
  const orients = {}
  for (const turns of [1, 2, 3]) {
    const yaw = turns * 90
    const painted = paint(prisms, colour, turns)
    const name = `${id}_r${yaw}.png`
    tplPngs.push({ name, png: painted.png })
    orients[String(yaw)] = {
      href: `/art/sprites/environment/templates/${name}`,
      size: { width: painted.size.w, height: painted.size.h },
      anchorX: painted.size.anchorX,
    }
  }
  tplPieces.push({
    id,
    label,
    href: `/art/sprites/environment/templates/${name0}`,
    size: { width: painted0.size.w, height: painted0.size.h },
    anchorX: painted0.size.anchorX,
    orients,
    tags: ['dimension', ...tags],
    footprint: { width: footprint.w, depth: footprint.d },
    height,
    cover: Boolean(flags.cover),
    fade: Boolean(flags.fade),
    face: 'plain',
  })
}

function addItem(id, name, tag, w, d, h, prisms, colour) {
  const painted = paint(prisms, colour)
  itemPngs.push({ name: `${id}.png`, png: painted.png })
  itemSpecs.push({ id, name, tag, w, d, h, colour })
}

// ===== TILES =====
// One-cell only. Longer pieces (128/192 walls, wide steps) are Template Pieces — blitToTile clips past 64.
addTile('dimFloor', 'Dim Floor', 'floor', 0, slab(64, 64, 3, C.floor), C.floor)
addTile('dimFloorCenter', 'Dim Floor Centre', 'floor', 0, slab(64, 64, 3, C.floor), C.floor, { floorMarks: 'center' })
addTile('dimFloorGrid', 'Dim Floor Grid', 'floor', 0, slab(64, 64, 3, C.floor), C.floor, { floorMarks: 'grid' })
addTile('dimFloorCorners', 'Dim Floor Corners', 'floor', 0, slab(64, 64, 3, C.floor), C.floor, { floorMarks: 'corners' })

const BLOCKS = [
  [4, '#2bbf8a'],
  [8, C.block8],
  [12, '#5ad4a8'],
  [16, C.block16],
  [24, '#6aa0ff'],
  [32, C.block32],
  [48, '#f5d06a'],
  [64, C.block64],
  [80, '#e87858'],
  [92, C.block92],
]
for (const [h, c] of BLOCKS) {
  addTile(`dimBlock${h}`, `Dim Block ${h}`, 'block', h, slab(64, 64, h, c), c, { surface: true })
}

const PLATFORMS = [
  [4, '#247a55'],
  [8, C.platform8],
  [12, '#2a9a75'],
  [16, C.platform16],
  [24, '#356a88'],
  [32, C.platform32],
  [48, '#455a88'],
  [64, '#4a5080'],
]
for (const [h, c] of PLATFORMS) {
  addTile(`dimPlatform${h}`, `Dim Platform ${h}`, 'block', h, slab(64, 64, h, c), c, { surface: true })
}

addTile('dimWall', 'Dim Wall 92', 'wall', 92, slab(64, 64, 92, C.wall), C.wall)
addTile('dimWall64', 'Dim Wall 64', 'wall', 64, slab(64, 64, 64, C.wall), C.wall)
addTile('dimWall46', 'Dim Wall 46', 'wall', 46, slab(64, 64, 46, C.wallHalf), C.wallHalf)
addTile('dimWall24', 'Dim Wall 24', 'wall', 24, slab(64, 64, 24, C.wallHalf), C.wallHalf)
addTile(
  'dimWallCorner',
  'Dim Wall Corner',
  'corner',
  92,
  tipNormalize([box(-32, -32, 32, -16, 0, 92, C.wallJoin), box(-32, -16, -16, 32, 0, 92, C.wallJoin)]),
  C.wallJoin,
)
addTile('dimWallEnd', 'Dim Wall End', 'end', 92, tipNormalize([box(-32, -32, 32, -16, 0, 92, C.wall)]), C.wall)
addTile(
  'dimWallCross',
  'Dim Wall Cross',
  'cross',
  92,
  tipNormalize([box(-8, -32, 8, 32, 0, 92, C.wallJoin), box(-32, -8, 32, 8, 0, 92, C.wallJoin)]),
  C.wallJoin,
)

for (const thick of [8, 16, 24, 32, 48]) {
  addTile(`dimWall${thick}Thick`, `Dim Wall ${thick}-thick`, 'thick', 92, straight(64, thick, 92, C.thick), C.thick)
}
addTile('dimWall32Corner', 'Dim Wall 32 Corner Post', 'thick', 92, post(32, 92, C.thick), C.thick)
addTile('dimWall32Half', 'Dim Wall 32-thick 46', 'thick', 46, straight(64, 32, 46, C.thick), C.thick)
addTile('dimWall32Short', 'Dim Wall 32-thick 24', 'thick', 24, straight(64, 32, 24, C.thick), C.thick)

for (const s of [8, 12, 16, 24, 32, 48, 64]) {
  addTile(`dimColumn${s}`, `Dim Column ${s}`, 'column', 92, post(s, 92, C.column), C.column)
}
addTile('dimColumn32Half', 'Dim Column 32 Half', 'column', 46, post(32, 46, C.column), C.column)

addTile('dimSteps2', 'Dim Steps 2', 'steps', 32, tipNormalize(steps([16, 32])), C.steps, { surface: true })
addTile('dimSteps3', 'Dim Steps 3', 'steps', 24, tipNormalize(steps([8, 16, 24])), C.steps, { surface: true })
addTile('dimSteps4', 'Dim Steps 4', 'steps', 32, tipNormalize(steps([8, 16, 24, 32])), C.steps, { surface: true })
addTile('dimSteps5', 'Dim Steps 5', 'steps', 40, tipNormalize(steps([8, 16, 24, 32, 40])), C.steps, { surface: true })
addTile('dimSteps6', 'Dim Steps 6', 'steps', 48, tipNormalize(steps([8, 16, 24, 32, 40, 48])), C.steps, { surface: true })

addTile('dimTable', 'Dim Table', 'table', 16, table(), C.table, { surface: true, inset: 0.12 })
addTile('dimTableLow', 'Dim Table Low', 'table', 10, tipNormalize([
  box(-28, -28, -18, -18, 0, 8, C.table),
  box(18, -28, 28, -18, 0, 8, C.table),
  box(-28, 18, -18, 28, 0, 8, C.table),
  box(18, 18, 28, 28, 0, 8, C.table),
  box(-28, -28, 28, 28, 8, 10, C.table),
]), C.table, { surface: true, inset: 0.12 })
addTile('dimCrate', 'Dim Crate', 'crate', 16, furnitureCrate(), C.crate, { surface: true })
addTile('dimCrateTall', 'Dim Crate Tall', 'crate', 32, slab(40, 40, 32, C.crate), C.crate, { surface: true })
addTile('dimChair', 'Dim Chair', 'chair', 12, chair(), C.chair, { surface: true, cover: true })
addTile('dimStool', 'Dim Stool', 'stool', 16, stool(), C.stool, { surface: true, cover: true })
addTile('dimBench', 'Dim Bench', 'bench', 12, bench(), C.bench, { surface: true, cover: true })
addTile('dimBed', 'Dim Bed', 'bed', 12, bed(), C.bed, { surface: true, cover: true })
addTile('dimConsole', 'Dim Console', 'console', 18, consoleDesk(), C.console, { surface: true, cover: true })
addTile('dimLocker', 'Dim Locker', 'locker', 52, locker(), C.locker, { surface: true, cover: true })
addTile('dimShelf', 'Dim Shelf', 'shelf', 37, shelf(), C.shelf, { surface: true, cover: true })

const TILE_GROUPS = [
  {
    id: 'dimFloors',
    section: 'Dimension',
    label: 'Floors',
    tiles: ['dimFloor', 'dimFloorCenter', 'dimFloorGrid', 'dimFloorCorners'],
  },
  {
    id: 'dimHeights',
    section: 'Dimension',
    label: 'Heights',
    tiles: BLOCKS.map(([h]) => `dimBlock${h}`),
  },
  {
    id: 'dimWalls',
    section: 'Dimension',
    label: 'Walls',
    tiles: [
      'dimWall',
      'dimWall64',
      'dimWall46',
      'dimWall24',
      'dimWallCorner',
      'dimWallEnd',
      'dimWallCross',
      'dimWall8Thick',
      'dimWall16Thick',
      'dimWall24Thick',
      'dimWall32Thick',
      'dimWall48Thick',
      'dimWall32Corner',
      'dimWall32Half',
      'dimWall32Short',
    ],
  },
  {
    id: 'dimColumns',
    section: 'Dimension',
    label: 'Columns',
    tiles: [8, 12, 16, 24, 32, 48, 64].map((s) => `dimColumn${s}`).concat(['dimColumn32Half']),
  },
  {
    id: 'dimSurfaces',
    section: 'Dimension',
    label: 'Surfaces',
    tiles: [
      ...PLATFORMS.map(([h]) => `dimPlatform${h}`),
      'dimTable',
      'dimTableLow',
      'dimCrate',
      'dimCrateTall',
      'dimSteps2',
      'dimSteps3',
      'dimSteps4',
      'dimSteps5',
      'dimSteps6',
    ],
  },
  {
    id: 'dimFurniture',
    section: 'Dimension',
    label: 'Furniture',
    tiles: ['dimChair', 'dimStool', 'dimBench', 'dimBed', 'dimConsole', 'dimLocker', 'dimShelf'],
  },
]

// ===== TEMPLATE PIECES =====
for (const thick of [4, 8, 12, 16, 24, 32, 48]) {
  addTpl(`tplDimWall${thick}`, `Dim Wall ${thick}`, ['wall', 'straight'], { w: 64, d: thick }, 92, straight(64, thick, 92, C.thick), C.thick, {
    fade: true,
  })
}
addTpl('tplDimWall32Long', 'Dim Wall 32 Long', ['wall', 'straight', 'long'], { w: 128, d: 32 }, 92, straight(128, 32, 92, C.thick), C.thick, {
  fade: true,
})
addTpl('tplDimWall32XLong', 'Dim Wall 32 XLong', ['wall', 'straight', 'long'], { w: 192, d: 32 }, 92, straight(192, 32, 92, C.thick), C.thick, {
  fade: true,
})
addTpl('tplDimWall32Half', 'Dim Wall 32 Half', ['wall', 'straight'], { w: 64, d: 32 }, 46, straight(64, 32, 46, C.thick), C.thick, { fade: true })
addTpl('tplDimWall32Short', 'Dim Wall 32 Short', ['wall', 'straight'], { w: 64, d: 32 }, 24, straight(64, 32, 24, C.thick), C.thick, {
  fade: true,
})
addTpl('tplDimWall16Half', 'Dim Wall 16 Half', ['wall', 'straight'], { w: 64, d: 16 }, 46, straight(64, 16, 46, C.wall), C.wall, { fade: true })

for (const s of [8, 12, 16, 24, 32, 48, 64, 96]) {
  addTpl(`tplDimPost${s}`, `Dim Post ${s}`, ['column'], { w: s, d: s }, 92, post(s, 92, C.column), C.column, { fade: true })
}
addTpl('tplDimPost32Half', 'Dim Post 32 Half', ['column'], { w: 32, d: 32 }, 46, post(32, 46, C.column), C.column, { fade: true })

for (const thick of [8, 16, 32]) {
  addTpl(`tplDimCornerL${thick}`, `Dim Corner L ${thick}`, ['wall', 'corner'], { w: 64, d: 64 }, 92, cornerL(64, thick, 92, C.thick), C.thick, {
    fade: true,
  })
}
addTpl('tplDimTee', 'Dim Tee', ['wall', 'odd'], { w: 64, d: 64 }, 92, oddTee(), C.thick, { fade: true })
addTpl('tplDimCross', 'Dim Cross', ['wall', 'odd'], { w: 64, d: 64 }, 92, oddCross(), C.thick, { fade: true })
addTpl('tplDimArch', 'Dim Arch', ['wall', 'odd'], { w: 32, d: 8 }, 92, oddArch(), C.thick, { fade: true })
addTpl('tplDimAlcove', 'Dim Alcove', ['wall', 'odd'], { w: 48, d: 40 }, 92, oddAlcove(), C.thick, { fade: true })

const FLOOR_SIZES = [
  [8, 8],
  [12, 12],
  [16, 16],
  [24, 24],
  [32, 32],
  [48, 48],
  [64, 64],
  [96, 96],
  [128, 128],
  [160, 160],
  [192, 192],
  [256, 256],
  [64, 32],
  [64, 16],
  [64, 48],
  [96, 32],
  [96, 16],
  [96, 64],
  [128, 64],
  [128, 32],
  [128, 16],
  [192, 64],
  [192, 32],
  [32, 16],
  [48, 24],
  [48, 16],
]
for (const [w, d] of FLOOR_SIZES) {
  const id = w === d ? `tplDimFloor${w}` : `tplDimFloor${w}x${d}`
  const label = w === d ? `Dim Floor ${w}` : `Dim Floor ${w}×${d}`
  addTpl(id, label, ['floor'], { w, d }, 3, slab(w, d, 3, C.floor), C.floor)
}

for (const [foot, heights] of [
  [16, [4, 8, 16, 32, 48]],
  [32, [4, 8, 12, 16, 24, 32, 48, 64, 80]],
  [64, [8, 16, 32, 64, 92]],
]) {
  for (const h of heights) {
    const c = h <= 8 ? C.block8 : h <= 16 ? C.block16 : h <= 32 ? C.block32 : h <= 64 ? C.block64 : C.block92
    addTpl(`tplDimBox${foot}h${h}`, `Dim Box ${foot} h${h}`, ['box'], { w: foot, d: foot }, h, slab(foot, foot, h, c), c, {
      cover: h >= 16,
      fade: h >= 64,
    })
  }
}

// --- Tiny fixtures: exact W×D×H (no SEAM) so Design size / World height match the prism ---
const TINY_FEET = [2, 4, 6, 8]
const TINY_HEIGHTS = [2, 4, 6, 8, 12, 16]
for (const foot of TINY_FEET) {
  for (const h of TINY_HEIGHTS) {
    const c = TINY_COLOURS[h] ?? TINY_COLOURS[foot] ?? C.foot
    addTpl(
      `tplDimTiny${foot}h${h}`,
      `Dim Tiny ${foot}×${foot}×${h}`,
      ['tiny', 'box'],
      { w: foot, d: foot },
      h,
      exactBox(foot, foot, h, c),
      c,
    )
  }
}
for (const [w, d, h] of [
  [8, 4, 2],
  [8, 4, 4],
  [8, 4, 8],
  [8, 2, 2],
  [8, 2, 4],
  [4, 2, 2],
  [4, 2, 4],
  [4, 2, 8],
  [12, 4, 4],
  [12, 4, 8],
  [12, 8, 4],
  [16, 4, 4],
  [16, 4, 8],
  [16, 8, 4],
  [16, 8, 8],
  [6, 2, 2],
  [6, 2, 6],
  [6, 4, 2],
  [6, 4, 6],
]) {
  const c = TINY_COLOURS[h] ?? C.foot
  addTpl(`tplDimTiny${w}x${d}h${h}`, `Dim Tiny ${w}×${d}×${h}`, ['tiny', 'box'], { w, d }, h, exactBox(w, d, h, c), c)
}
// Tiny floor pads (exact) and short posts
for (const s of [2, 4, 6, 8]) {
  addTpl(`tplDimTinyPad${s}`, `Dim Tiny Pad ${s}`, ['tiny', 'floor'], { w: s, d: s }, 2, exactBox(s, s, 2, C.floor), C.floor)
  addTpl(`tplDimTinyPost${s}`, `Dim Tiny Post ${s}`, ['tiny', 'column'], { w: s, d: s }, 16, exactBox(s, s, 16, C.column), C.column)
}

addTpl('tplDimSteps2', 'Dim Steps 2', ['steps'], { w: 64, d: 64 }, 32, tipNormalize(steps([16, 32])), C.steps)
addTpl('tplDimSteps3', 'Dim Steps 3', ['steps'], { w: 64, d: 64 }, 24, tipNormalize(steps([8, 16, 24])), C.steps)
addTpl('tplDimSteps4', 'Dim Steps 4', ['steps'], { w: 64, d: 64 }, 32, tipNormalize(steps([8, 16, 24, 32])), C.steps)
addTpl('tplDimSteps5', 'Dim Steps 5', ['steps'], { w: 64, d: 64 }, 40, tipNormalize(steps([8, 16, 24, 32, 40])), C.steps)
addTpl('tplDimSteps6', 'Dim Steps 6', ['steps'], { w: 64, d: 64 }, 48, tipNormalize(steps([8, 16, 24, 32, 40, 48])), C.steps)
addTpl('tplDimStepsWide', 'Dim Steps Wide', ['steps'], { w: 128, d: 64 }, 32, stepsWide([16, 32], 128), C.steps)
addTpl('tplDimRamp', 'Dim Ramp', ['odd', 'steps'], { w: 64, d: 64 }, 24, oddRamp(), C.steps)
addTpl('tplDimRampTall', 'Dim Ramp Tall', ['odd', 'steps'], { w: 64, d: 72 }, 48, rampTall(), C.steps)

addTpl('tplDimL12', 'Dim L 12', ['odd'], { w: 32, d: 32 }, 12, oddL(), C.odd, { cover: true })
addTpl('tplDimL24', 'Dim L 24', ['odd'], { w: 48, d: 48 }, 24, tipNormalize([box(-48, -16, 0, 0, 0, 24, C.odd), box(-16, -48, 0, 0, 0, 24, C.odd)]), C.odd, {
  cover: true,
})
addTpl('tplDimU', 'Dim U', ['odd'], { w: 32, d: 32 }, 16, oddU(), C.odd, { cover: true })
addTpl('tplDimU48', 'Dim U 48', ['odd'], { w: 48, d: 48 }, 24, tipNormalize([
  box(-48, -12, -36, 0, 0, 24, C.odd),
  box(-12, -12, 0, 0, 0, 24, C.odd),
  box(-48, -48, 0, -36, 0, 24, C.odd),
]), C.odd, { cover: true })
addTpl('tplDimRing', 'Dim Ring', ['odd'], { w: 32, d: 32 }, 8, oddRing(), C.odd)
addTpl('tplDimRing48', 'Dim Ring 48', ['odd'], { w: 48, d: 48 }, 12, tipNormalize([
  box(-48, -48, 0, -36, 0, 12, C.odd),
  box(-48, -12, 0, 0, 0, 12, C.odd),
  box(-48, -36, -36, -12, 0, 12, C.odd),
  box(-12, -36, 0, -12, 0, 12, C.odd),
]), C.odd)
addTpl('tplDimNotch', 'Dim Notch', ['odd'], { w: 32, d: 32 }, 16, oddNotch(), C.odd, { cover: true })
addTpl('tplDimZ', 'Dim Z', ['odd'], { w: 32, d: 32 }, 12, oddZ(), C.odd, { cover: true })

addTpl('tplDimTable', 'Dim Table', ['furniture'], { w: 56, d: 56 }, 16, table(), C.table, { cover: true })
addTpl('tplDimTableLow', 'Dim Table Low', ['furniture'], { w: 56, d: 56 }, 10, tipNormalize([
  box(-28, -28, -18, -18, 0, 8, C.table),
  box(18, -28, 28, -18, 0, 8, C.table),
  box(-28, 18, -18, 28, 0, 8, C.table),
  box(18, 18, 28, 28, 0, 8, C.table),
  box(-28, -28, 28, 28, 8, 10, C.table),
]), C.table, { cover: true })
addTpl('tplDimChair', 'Dim Chair', ['furniture'], { w: 36, d: 42 }, 12, chair(), C.chair, { cover: true })
addTpl('tplDimStool', 'Dim Stool', ['furniture'], { w: 28, d: 28 }, 16, stool(), C.stool, { cover: true })
addTpl('tplDimBench', 'Dim Bench', ['furniture'], { w: 60, d: 24 }, 12, bench(), C.bench, { cover: true })
addTpl('tplDimBenchLong', 'Dim Bench Long', ['furniture'], { w: 96, d: 24 }, 12, tipNormalize([
  box(-44, -6, -36, 2, 0, 8, C.bench),
  box(36, -6, 44, 2, 0, 8, C.bench),
  box(-44, 10, -36, 16, 0, 8, C.bench),
  box(36, 10, 44, 16, 0, 8, C.bench),
  box(-48, -8, 48, 16, 8, 12, C.bench),
]), C.bench, { cover: true })
addTpl('tplDimBed', 'Dim Bed', ['furniture'], { w: 56, d: 56 }, 12, bed(), C.bed, { cover: true })
addTpl('tplDimConsole', 'Dim Console', ['furniture'], { w: 60, d: 50 }, 18, consoleDesk(), C.console, { cover: true })
addTpl('tplDimLocker', 'Dim Locker', ['furniture'], { w: 32, d: 32 }, 52, locker(), C.locker, { cover: true, fade: true })
addTpl('tplDimLockerWide', 'Dim Locker Wide', ['furniture'], { w: 56, d: 32 }, 52, tipNormalize([box(-28, -16, 28, 16, 0, 52, C.locker)]), C.locker, {
  cover: true,
  fade: true,
})
addTpl('tplDimShelf', 'Dim Shelf', ['furniture'], { w: 56, d: 48 }, 37, shelf(), C.shelf, { cover: true, fade: true })
addTpl('tplDimCrate', 'Dim Crate', ['furniture'], { w: 40, d: 40 }, 16, furnitureCrate(), C.crate, { cover: true })
addTpl('tplDimCrateTall', 'Dim Crate Tall', ['furniture'], { w: 40, d: 40 }, 32, slab(40, 40, 32, C.crate), C.crate, { cover: true })

// ===== ITEMS =====
for (const s of [4, 8, 12, 16, 24, 32, 48, 64]) {
  addItem(`dimFoot${s}`, `Dim Foot ${s}`, 'footprint', s, s, 8, slab(s, s, 8, C.foot), C.foot)
}
// Tiny inventory fixtures — exact prisms; labels match W×D×H.
for (const foot of [2, 4, 6, 8]) {
  for (const h of [2, 4, 8, 16]) {
    const c = TINY_COLOURS[h] ?? C.foot
    addItem(`dimTiny${foot}h${h}`, `Dim Tiny ${foot}×${foot}×${h}`, 'tiny', foot, foot, h, exactBox(foot, foot, h, c), c)
  }
}
for (const [w, d, h] of [
  [8, 4, 2],
  [8, 4, 4],
  [8, 2, 2],
  [4, 2, 2],
  [4, 2, 4],
  [12, 4, 4],
  [16, 4, 4],
  [16, 8, 4],
  [6, 2, 2],
  [6, 4, 2],
]) {
  const c = TINY_COLOURS[h] ?? C.foot
  addItem(`dimTiny${w}x${d}h${h}`, `Dim Tiny ${w}×${d}×${h}`, 'tiny', w, d, h, exactBox(w, d, h, c), c)
}
addItem('dimBox32x16', 'Dim Box 32×16', 'selection', 32, 32, 16, slab(32, 32, 16, C.box), C.box)
addItem('dimBox16x16', 'Dim Box 16×16', 'selection', 16, 16, 16, slab(16, 16, 16, C.box), C.box)
addItem('dimBox16x32', 'Dim Box 16×32', 'selection', 16, 16, 32, slab(16, 16, 32, C.box), C.box)
addItem('dimBox48x16', 'Dim Box 48×16', 'selection', 48, 48, 16, slab(48, 48, 16, C.box), C.box)
addItem('dimBox8x48', 'Dim Tall 8×48', 'selection', 8, 8, 48, slab(8, 8, 48, C.box), C.box)
addItem('dimBox8x92', 'Dim Tall 8×92', 'selection', 8, 8, 92, slab(8, 8, 92, C.box), C.box)
addItem('dimBox32x4', 'Dim Wide Low', 'selection', 32, 8, 4, slab(32, 8, 4, C.box), C.box)
addItem('dimBox64x4', 'Dim Wide Low 64', 'selection', 64, 8, 4, slab(64, 8, 4, C.box), C.box)
addItem('dimPartial', 'Dim Partial', 'selection', 32, 32, 16, slab(32, 32, 16, '#7ee0ff'), '#7ee0ff')
addItem('dimHollow', 'Dim Hollow', 'selection', 32, 32, 16, oddRing('#ffffff'), '#ffffff')
addItem('dimL', 'Dim L Item', 'selection', 32, 32, 12, oddL(), C.odd)
addItem('dimIrregular', 'Dim Irregular', 'selection', 32, 32, 12, oddL('#d13bd1'), '#d13bd1')
addItem(
  'dimT',
  'Dim T Item',
  'selection',
  32,
  32,
  12,
  tipNormalize([box(-32, -12, 0, 0, 0, 12, C.odd), box(-22, -32, -10, -12, 0, 12, C.odd)]),
  C.odd,
)
addItem('dimZ', 'Dim Z Item', 'selection', 32, 32, 12, oddZ(), C.odd)

// --- Write files / patch catalogues ---
function writePngs(dir, list, { clearDimOnly = false } = {}) {
  fs.mkdirSync(dir, { recursive: true })
  if (clearDimOnly) {
    for (const name of fs.readdirSync(dir)) {
      if ((name.startsWith('dim') || name.startsWith('tplDim')) && name.endsWith('.png')) fs.unlinkSync(path.join(dir, name))
    }
  }
  for (const { name, png } of list) fs.writeFileSync(path.join(dir, name), png)
}

writePngs(tileOut, tilePngs, { clearDimOnly: true })
writePngs(itemOut, itemPngs, { clearDimOnly: true })
writePngs(tplOut, tplPngs, { clearDimOnly: true })

function tileLine(spec) {
  const image = `/art/sprites/environment/dimension/${spec.id}.png`
  const height = spec.height ?? 0
  const solid = height > 0
  const fields = [
    `"id": "${spec.id}"`,
    `"symbol": "${spec.symbol}"`,
    `"label": "${spec.label}"`,
    `"image": "${image}"`,
    `"solid": ${solid}`,
    `"blocksSight": ${Boolean(spec.wall)}`,
    `"cover": ${spec.cover === true}`,
    `"fade": ${Boolean(spec.wall)}`,
    spec.wall ? `"wall": true` : null,
    `"height": ${height}`,
    spec.imageHeight ? `"imageHeight": ${spec.imageHeight}` : null,
    spec.surface ? `"surface": ${JSON.stringify({ ...(spec.inset ? { inset: spec.inset } : {}), maxStack: 3 })}` : null,
    `"role": null`,
  ].filter(Boolean)
  return `    { ${fields.join(', ')} },`
}

function patchTilesJson() {
  const file = path.join(root, 'src/data/adaptation/maps/tiles.json')
  let text = fs.readFileSync(file, 'utf8')
  // Collect existing symbols so we don't collide (already allocated at addTile time against empty set — re-check)
  const existing = [...text.matchAll(/"symbol":\s*"([^"]+)"/g)].map((m) => m[1])
  for (const s of existing) usedSymbols.add(s)
  // Drop prior Dimension tile lines / groups if re-run
  text = text
    .split('\n')
    .filter((line) => !/"id":\s*"dim/.test(line) && !/"id":"dim/.test(line))
    .join('\n')
  text = text.replace(/Next free symbol: \S+/, `Next free symbol: ${String.fromCharCode(symbolCode)}`)
  const groups = TILE_GROUPS.map((group, index) => {
    const line = `    ${JSON.stringify({ id: group.id, section: group.section, label: group.label, tiles: group.tiles })}`
    // No trailing comma on the last Dimension group (it is the last paletteGroups entry).
    return index === TILE_GROUPS.length - 1 ? line : `${line},`
  }).join('\n')
  // Remove old Dimension groups
  text = text.replace(/,?\n\s*\{"id":"dim[^"]*"[^\n]*/g, '')
  text = text.replace(/,?\n\s*\{ "id": "dim[^"]*"[^\n]*/g, '')
  if (!text.includes('"id": "calFurniture"') && !text.includes('"id":"calFurniture"')) {
    throw new Error('Calibration furniture group missing — refuse to patch tiles.json')
  }
  // Ensure calFurniture keeps a trailing comma, then append Dimension groups (last group has no comma).
  text = text.replace(
    /(\{"id":"calFurniture"[^\n]*\}|\{ "id": "calFurniture"[^\n]*\})/,
    (line) => `${line.replace(/,?\s*$/, '')},\n${groups}`,
  )
  // Hard guarantee: no trailing comma before paletteGroups close.
  text = text.replace(/,\s*\n(\s*\],\s*\n\s*"tiles")/, '\n$1')
  const tiles = tileSpecs.map(tileLine).join('\n')
  const nullLine = text.split('\n').find((line) => line.includes('"id": "null"') || line.includes('"id":"null"'))
  if (!nullLine) throw new Error('null tile missing')
  // Remove old dim tile object lines already filtered; insert before null
  text = text.replace(nullLine, `${tiles}\n${nullLine}`)
  fs.writeFileSync(file, text)
  JSON.parse(fs.readFileSync(file, 'utf8')) // fail loud if patch left invalid JSON
}

function patchItemsJson() {
  const file = path.join(root, 'src/data/adaptation/items.json')
  let text = fs.readFileSync(file, 'utf8')
  text = text
    .split('\n')
    .filter((line) => !/"id":"dim/.test(line) && !/"id": "dim/.test(line))
    .join('\n')
  if (!text.includes('"dimension"')) {
    text = text.replace('"calibration": "Calibration"\n  },', '"calibration": "Calibration",\n    "dimension": "Dimension"\n  },')
    text = text.replace('"calibration": "#7dffd1"\n  },', '"calibration": "#7dffd1",\n    "dimension": "#9ab6ff"\n  },')
  }
  text = text.replace(/,(\n  \]\n\}\n?)$/, '$1')
  const lines = itemSpecs.map((item) => {
    const href = `/art/sprites/environment/items/${item.id}.png`
    return `    ${JSON.stringify({
      id: item.id,
      name: item.name,
      category: 'dimension',
      icon: href,
      worldImage: href,
      description: `Dimension fixture. Intended world size ${item.w}×${item.d}×${item.h}.`,
      tags: ['dimension', item.tag],
      equipSlot: null,
      sourceType: 'original',
      statsSourceType: 'adaptation',
    })},`
  })
  lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '')
  text = text.replace(/\n  \]\n\}\n?$/, `,\n${lines.join('\n')}\n  ]\n}\n`)
  fs.writeFileSync(file, text)
}

function patchTemplatePiecesJson() {
  const file = path.join(root, 'src/data/adaptation/maps/templatePieces.json')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  data.pieces = (data.pieces ?? []).filter((p) => !(p.tags ?? []).includes('dimension') && !String(p.id).startsWith('tplDim'))
  data.pieces.push(...tplPieces)
  if (!data.notes?.some((n) => /Dimension/.test(n))) {
    data.notes = [
      ...(data.notes ?? []),
      'Dimension Kit (tplDim*): solid-but-lit AA size/footprint tests. Separate from Starship templates and Calibration tiles. Art via scripts/makeDimensionKit.mjs.',
    ]
  }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

patchTilesJson()
patchItemsJson()
patchTemplatePiecesJson()

console.log(`Dimension tiles: ${tileSpecs.length}  templates: ${tplPieces.length}  items: ${itemSpecs.length}`)
console.log(`PNGs: tiles ${tilePngs.length}, templates ${tplPngs.length}, items ${itemPngs.length}`)
console.log(`Next free symbol hint: ${String.fromCharCode(symbolCode)}`)
