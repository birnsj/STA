// Development-only Calibration tileset and the Object Systems Regression map.
// Art uses the same iso projection as the game (64×32 floor diamond, 4 file pixels per design pixel)
// and is filled on pixel centres — no filtering. Tile `height` stays the authored physical height;
// the PNG canvas is only the picture (imageHeight when it is taller than 96).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from './png.mjs'
import { writeMeasuredPixels } from './itemSpriteFit.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const S = 4
const TILE_CANVAS = 96
const ALPHA = 12

const rgb = (hex, a = 255) => {
  const n = Number.parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a }
}
const shade = (c, f) => ({
  r: Math.max(0, Math.min(255, Math.round(c.r * f))),
  g: Math.max(0, Math.min(255, Math.round(c.g * f))),
  b: Math.max(0, Math.min(255, Math.round(c.b * f))),
  a: c.a,
})
const INK = rgb('#101418')

function grid(w, h) {
  return { w, h, id: new Uint8Array(w * h), rgba: new Array(w * h) }
}
function setPx(g, x, y, id, color) {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return
  const i = y * g.w + x
  g.id[i] = id
  g.rgba[i] = color
}
function fillPoly(g, pts, id, color) {
  let minY = Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minY = Math.min(minY, p[1])
    maxY = Math.max(maxY, p[1])
  }
  const y0 = Math.max(0, Math.floor(minY))
  const y1 = Math.min(g.h - 1, Math.ceil(maxY) - 1)
  for (let y = y0; y <= y1; y++) {
    const scan = y + 0.5
    const xs = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      if ((a[1] <= scan && b[1] > scan) || (b[1] <= scan && a[1] > scan)) {
        const t = (scan - a[1]) / (b[1] - a[1])
        xs.push(a[0] + t * (b[0] - a[0]))
      }
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 1e-6))
      const x1 = Math.min(g.w - 1, Math.floor(xs[k + 1] + 1e-6) - 1)
      for (let x = x0; x <= x1; x++) setPx(g, x, y, id, color)
    }
  }
}
function strokePoly(g, pts, color) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      setPx(g, Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), 9, color)
    }
  }
}
function silhouette(g) {
  const mark = []
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x
      if (!g.id[i]) continue
      const edge = x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1 || !g.id[i - 1] || !g.id[i + 1] || !g.id[i - g.w] || !g.id[i + g.w]
      if (edge) mark.push(i)
    }
  }
  for (const i of mark) g.rgba[i] = INK
}
function toPng(g) {
  const w = g.w * S
  const h = g.h * S
  const bytes = new Uint8Array(w * h * 4)
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const color = g.rgba[y * g.w + x]
      if (!color || color.a <= ALPHA) continue
      for (let dy = 0; dy < S; dy++) {
        for (let dx = 0; dx < S; dx++) {
          const o = ((y * S + dy) * w + (x * S + dx)) * 4
          bytes[o] = color.r
          bytes[o + 1] = color.g
          bytes[o + 2] = color.b
          bytes[o + 3] = color.a
        }
      }
    }
  }
  return { width: w, height: h, bytes, png: encodePng(w, h, bytes) }
}

// Tile image: south tip of the floor diamond is the bottom centre. dx, dy are design pixels from the tile centre.
function tilePoint(dx, dy, z, ih) {
  return [32 + (dx - dy) / 2, ih - 16 + (dx + dy) / 4 - z]
}
function drawPrism(g, ih, x0, y0, x1, y1, z0, z1, color) {
  const p = (x, y, z) => tilePoint(x, y, z, ih)
  const top = [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)]
  if (z1 > z0) {
    fillPoly(g, [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], 2, shade(color, 0.72))
    fillPoly(g, [p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)], 3, shade(color, 0.5))
  }
  fillPoly(g, top, 1, shade(color, 1.15))
  strokePoly(g, top, shade(color, 1.45))
  for (let z = z0 + 8; z < z1; z += 8) {
    strokePoly(g, [p(x0, y1, z), p(x1, y1, z)], shade(color, 0.4))
    strokePoly(g, [p(x1, y0, z), p(x1, y1, z)], shade(color, 0.35))
  }
}

function tileCanvas(imageHeight) {
  return grid(64, imageHeight ?? TILE_CANVAS)
}
function paintTile(imageHeight, draw) {
  const ih = imageHeight ?? TILE_CANVAS
  const g = tileCanvas(ih)
  draw(g, ih)
  silhouette(g)
  return toPng(g)
}

function itemPoint(dx, dy, z, anchorX, ih) {
  return [anchorX + (dx - dy) / 2, ih + (dx + dy) / 4 - z]
}
function itemSize(w, d, h) {
  const corners = [
    [0, 0],
    [-w, 0],
    [0, -d],
    [-w, -d],
  ]
  let minX = Infinity
  let maxX = -Infinity
  let minY = 0
  for (const [dx, dy] of corners) {
    const sx = (dx - dy) / 2
    const sy = (dx + dy) / 4 - h
    minX = Math.min(minX, sx, (dx - dy) / 2)
    maxX = Math.max(maxX, sx, (dx - dy) / 2)
    minY = Math.min(minY, sy)
  }
  const padL = Math.ceil(-minX)
  const padR = Math.ceil(maxX)
  return { w: Math.max(1, padL + padR), h: Math.max(1, Math.ceil(-minY)), anchorX: padL }
}
function drawItemPrism(g, anchorX, ih, x0, y0, x1, y1, z0, z1, color) {
  const p = (x, y, z) => itemPoint(x, y, z, anchorX, ih)
  const top = [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)]
  if (z1 > z0) {
    fillPoly(g, [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], 2, shade(color, 0.72))
    fillPoly(g, [p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)], 3, shade(color, 0.5))
  }
  fillPoly(g, top, 1, shade(color, 1.15))
  strokePoly(g, top, shade(color, 1.45))
}
function paintItem(prisms, { hollow = false, alpha = 255 } = {}) {
  let w = 1
  let d = 1
  let h = 1
  for (const prism of prisms) {
    w = Math.max(w, prism.w)
    d = Math.max(d, prism.d)
    h = Math.max(h, prism.z1)
  }
  const size = itemSize(w, d, h)
  const g = grid(size.w, size.h)
  const tint = (color) => ({ ...color, a: alpha })
  for (const prism of prisms) {
    const color = tint(prism.color)
    if (hollow) {
      const p = (x, y, z) => itemPoint(x, y, z, size.anchorX, size.h)
      const edges = [
        [p(0, 0, 0), p(-prism.w, 0, 0)],
        [p(0, 0, 0), p(0, -prism.d, 0)],
        [p(-prism.w, 0, 0), p(-prism.w, -prism.d, 0)],
        [p(0, -prism.d, 0), p(-prism.w, -prism.d, 0)],
        [p(0, 0, prism.z1), p(-prism.w, 0, prism.z1)],
        [p(0, 0, prism.z1), p(0, -prism.d, prism.z1)],
        [p(-prism.w, 0, prism.z1), p(-prism.w, -prism.d, prism.z1)],
        [p(0, -prism.d, prism.z1), p(-prism.w, -prism.d, prism.z1)],
        [p(0, 0, 0), p(0, 0, prism.z1)],
        [p(-prism.w, 0, 0), p(-prism.w, 0, prism.z1)],
        [p(0, -prism.d, 0), p(0, -prism.d, prism.z1)],
        [p(-prism.w, -prism.d, 0), p(-prism.w, -prism.d, prism.z1)],
      ]
      for (const [a, b] of edges) strokePoly(g, [a, b], color)
      continue
    }
    drawItemPrism(g, size.anchorX, size.h, -prism.w, -prism.d, 0, 0, prism.z0 ?? 0, prism.z1, color)
  }
  if (!hollow) silhouette(g)
  return toPng(g)
}

function cross(g, cx, cy, color) {
  for (let i = -3; i <= 3; i++) {
    setPx(g, cx + i, cy, 4, color)
    setPx(g, cx, cy + i, 4, color)
  }
}

const TILES = [
  { id: 'calFloor', symbol: 'Ģ', label: 'Cal Floor', kind: 'floor', color: '#243044' },
  { id: 'calFloorCenter', symbol: 'ģ', label: 'Cal Floor Centre', kind: 'center', color: '#243044' },
  { id: 'calFloorGrid', symbol: 'Ĥ', label: 'Cal Floor Grid', kind: 'grid', color: '#243044' },
  { id: 'calFloorCorners', symbol: 'ĥ', label: 'Cal Floor Corners', kind: 'corners', color: '#243044' },
  { id: 'calBlock8', symbol: 'Ħ', label: 'Cal Block 8', kind: 'block', height: 8, color: '#3ddc97', surface: true },
  { id: 'calBlock16', symbol: 'ħ', label: 'Cal Block 16', kind: 'block', height: 16, color: '#3d8bfd', surface: true },
  { id: 'calBlock32', symbol: 'Ĩ', label: 'Cal Block 32', kind: 'block', height: 32, color: '#f0c14e', surface: true },
  { id: 'calBlock64', symbol: 'ĩ', label: 'Cal Block 64', kind: 'block', height: 64, color: '#e05a3c', surface: true },
  { id: 'calBlock92', symbol: 'Ī', label: 'Cal Block 92', kind: 'block', height: 92, color: '#c77dff', surface: true },
  { id: 'calWall', symbol: 'ī', label: 'Cal Wall 92', kind: 'wall', height: 92, color: '#9aa3b2' },
  { id: 'calWallHalf', symbol: 'Ĭ', label: 'Cal Wall 46', kind: 'wall', height: 46, color: '#6e7784' },
  { id: 'calWallCorner', symbol: 'ĭ', label: 'Cal Wall Corner', kind: 'corner', height: 92, color: '#b7c0ce' },
  { id: 'calWallEnd', symbol: 'Į', label: 'Cal Wall End', kind: 'end', height: 92, color: '#8b93a0' },
  { id: 'calWallCross', symbol: 'į', label: 'Cal Wall Cross', kind: 'cross', height: 92, color: '#d0d6e0' },
  { id: 'calPlatformLow', symbol: 'İ', label: 'Cal Platform Low', kind: 'block', height: 8, color: '#2f8f62', surface: true },
  { id: 'calPlatformMid', symbol: 'ı', label: 'Cal Platform Mid', kind: 'block', height: 16, color: '#2f7c93', surface: true },
  { id: 'calPlatformTall', symbol: 'Ĳ', label: 'Cal Platform Tall', kind: 'block', height: 32, color: '#3d5f93', surface: true },
  { id: 'calTable', symbol: 'ĳ', label: 'Cal Table', kind: 'table', height: 16, color: '#c4884a', surface: true, inset: 0.12 },
  { id: 'calCrate', symbol: 'Ĵ', label: 'Cal Crate', kind: 'crate', height: 16, color: '#a67c52', surface: true },
  { id: 'calSteps', symbol: 'ĵ', label: 'Cal Steps (top 32)', kind: 'steps', height: 32, color: '#8d8d8d', surface: true },
  { id: 'calChair', symbol: 'Ķ', label: 'Cal Chair', kind: 'chair', height: 12, color: '#4ecdc4', surface: true, cover: true },
  { id: 'calStool', symbol: 'ķ', label: 'Cal Stool', kind: 'stool', height: 16, color: '#e0a030', surface: true, cover: true },
  { id: 'calBench', symbol: 'ĸ', label: 'Cal Bench', kind: 'bench', height: 12, color: '#7d9a4a', surface: true, cover: true },
  { id: 'calBed', symbol: 'Ĺ', label: 'Cal Bed', kind: 'bed', height: 12, color: '#6a7eb0', surface: true, cover: true },
  { id: 'calConsole', symbol: 'ĺ', label: 'Cal Console', kind: 'console', height: 18, color: '#5c6b7a', surface: true, cover: true },
  { id: 'calLocker', symbol: 'Ļ', label: 'Cal Locker', kind: 'locker', height: 52, color: '#8a919c', surface: true, cover: true },
  { id: 'calShelf', symbol: 'ļ', label: 'Cal Shelf', kind: 'shelf', height: 37, color: '#c4b49a', surface: true, cover: true },
]

const GROUPS = [
  { id: 'calFloors', section: 'Calibration', label: 'Floors', tiles: ['calFloor', 'calFloorCenter', 'calFloorGrid', 'calFloorCorners', 'null'] },
  { id: 'calHeights', section: 'Calibration', label: 'Heights', tiles: ['calBlock8', 'calBlock16', 'calBlock32', 'calBlock64', 'calBlock92'] },
  { id: 'calWalls', section: 'Calibration', label: 'Walls', tiles: ['calWall', 'calWallHalf', 'calWallCorner', 'calWallEnd', 'calWallCross'] },
  { id: 'calSurfaces', section: 'Calibration', label: 'Surfaces', tiles: ['calPlatformLow', 'calPlatformMid', 'calPlatformTall', 'calTable', 'calCrate', 'calSteps'] },
  { id: 'calFurniture', section: 'Calibration', label: 'Furniture', tiles: ['calChair', 'calStool', 'calBench', 'calBed', 'calConsole', 'calLocker', 'calShelf'] },
]

function imageHeightFor(height) {
  if (!height || height <= 60) return null
  return 96 + (height - 60)
}

function drawTileArt(spec) {
  const ih = imageHeightFor(spec.height)
  const color = rgb(spec.color)
  const png = paintTile(ih, (g, canvasH) => {
    if (spec.kind === 'floor' || spec.kind === 'center' || spec.kind === 'grid' || spec.kind === 'corners') {
      drawPrism(g, canvasH, -32, -32, 32, 32, 0, 0, color)
      if (spec.kind === 'center' || spec.kind === 'grid') cross(g, 32, canvasH - 16, rgb('#f2c14e'))
      if (spec.kind === 'grid' || spec.kind === 'corners') {
        strokePoly(g, [tilePoint(-32, -32, 0, canvasH), tilePoint(32, -32, 0, canvasH), tilePoint(32, 32, 0, canvasH), tilePoint(-32, 32, 0, canvasH)], rgb('#5ec8ff'))
      }
      if (spec.kind === 'corners') {
        for (const [dx, dy] of [[-32, -32], [32, -32], [32, 32], [-32, 32]]) {
          const [x, y] = tilePoint(dx, dy, 0, canvasH)
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) setPx(g, Math.round(x) + ox, Math.round(y) + oy, 4, rgb('#ff5a5a'))
        }
      }
      return
    }
    if (spec.kind === 'block' || spec.kind === 'wall' || spec.kind === 'crate') {
      drawPrism(g, canvasH, -32, -32, 32, 32, 0, spec.height, color)
      return
    }
    if (spec.kind === 'corner') {
      drawPrism(g, canvasH, -32, -32, 32, -16, 0, spec.height, color)
      drawPrism(g, canvasH, -32, -16, -16, 32, 0, spec.height, color)
      return
    }
    if (spec.kind === 'end') {
      drawPrism(g, canvasH, -32, -32, 32, -16, 0, spec.height, color)
      return
    }
    if (spec.kind === 'cross') {
      drawPrism(g, canvasH, -8, -32, 8, 32, 0, spec.height, color)
      drawPrism(g, canvasH, -32, -8, 32, 8, 0, spec.height, color)
      return
    }
    if (spec.kind === 'table') {
      drawPrism(g, canvasH, -28, -28, -18, -18, 0, 14, shade(color, 0.7))
      drawPrism(g, canvasH, 18, -28, 28, -18, 0, 14, shade(color, 0.7))
      drawPrism(g, canvasH, -28, 18, -18, 28, 0, 14, shade(color, 0.7))
      drawPrism(g, canvasH, 18, 18, 28, 28, 0, 14, shade(color, 0.7))
      drawPrism(g, canvasH, -28, -28, 28, 28, 14, 16, color)
      return
    }
    if (spec.kind === 'steps') {
      drawPrism(g, canvasH, -32, -32, 32, 0, 0, 32, shade(color, 1.2))
      drawPrism(g, canvasH, -32, 0, 32, 32, 0, 16, shade(color, 0.75))
      return
    }
    if (spec.kind === 'chair') {
      drawPrism(g, canvasH, -16, -8, -10, -2, 0, 8, shade(color, 0.6))
      drawPrism(g, canvasH, 10, -8, 16, -2, 0, 8, shade(color, 0.6))
      drawPrism(g, canvasH, -16, 14, -10, 20, 0, 8, shade(color, 0.6))
      drawPrism(g, canvasH, 10, 14, 16, 20, 0, 8, shade(color, 0.6))
      drawPrism(g, canvasH, -18, -6, 18, 20, 8, 12, color)
      drawPrism(g, canvasH, -18, -22, 18, -8, 8, 28, shade(color, 0.8))
      return
    }
    if (spec.kind === 'stool') {
      drawPrism(g, canvasH, -5, -5, 5, 5, 0, 12, shade(color, 0.6))
      drawPrism(g, canvasH, -14, -14, 14, 14, 12, 16, color)
      return
    }
    if (spec.kind === 'bench') {
      drawPrism(g, canvasH, -28, -6, -20, 2, 0, 8, shade(color, 0.6))
      drawPrism(g, canvasH, 20, -6, 28, 2, 0, 8, shade(color, 0.6))
      drawPrism(g, canvasH, -28, 10, -20, 16, 0, 8, shade(color, 0.6))
      drawPrism(g, canvasH, 20, 10, 28, 16, 0, 8, shade(color, 0.6))
      drawPrism(g, canvasH, -30, -8, 30, 16, 8, 12, color)
      return
    }
    if (spec.kind === 'bed') {
      drawPrism(g, canvasH, -24, -16, 24, 26, 0, 8, shade(color, 0.65))
      drawPrism(g, canvasH, -28, -14, 28, 28, 8, 12, color)
      drawPrism(g, canvasH, -28, -28, 28, -16, 4, 24, shade(color, 0.5))
      return
    }
    if (spec.kind === 'console') {
      drawPrism(g, canvasH, -24, 0, 24, 26, 0, 14, shade(color, 0.65))
      drawPrism(g, canvasH, -30, -6, 30, 28, 14, 18, color)
      drawPrism(g, canvasH, -18, -22, 18, -4, 18, 34, rgb('#3ec6ff'))
      return
    }
    if (spec.kind === 'locker') {
      drawPrism(g, canvasH, -16, -16, 16, 16, 0, 52, color)
      drawPrism(g, canvasH, -2, 14, 2, 18, 22, 30, shade(color, 0.35))
      return
    }
    if (spec.kind === 'shelf') {
      drawPrism(g, canvasH, -28, -22, -22, 22, 0, 36, shade(color, 0.7))
      drawPrism(g, canvasH, 22, -22, 28, 22, 0, 36, shade(color, 0.7))
      drawPrism(g, canvasH, -22, -24, 22, -16, 0, 36, shade(color, 0.55))
      for (const z of [10, 22, 34]) drawPrism(g, canvasH, -22, -16, 22, 18, z, z + 3, color)
    }
  })
  return { ...png, imageHeight: ih }
}

const FOOT_COLORS = { Red: '#e23d3d', Green: '#2fbf71', Blue: '#3c7dff', Yellow: '#f0d040', Gray: '#d5d8de' }

function squareItem(id, name, w, h, color, tag) {
  return { id, name, tag, w, d: w, h, color, prisms: [{ w, d: w, z1: h, color: rgb(color) }] }
}

const ITEMS = [
  squareItem('calFoot8Red', 'Cal 8 Red', 8, 8, FOOT_COLORS.Red, 'footprint'),
  squareItem('calFoot8Green', 'Cal 8 Green', 8, 8, FOOT_COLORS.Green, 'footprint'),
  squareItem('calFoot8Blue', 'Cal 8 Blue', 8, 8, FOOT_COLORS.Blue, 'footprint'),
  squareItem('calFoot8Yellow', 'Cal 8 Yellow', 8, 8, FOOT_COLORS.Yellow, 'footprint'),
  squareItem('calFoot16Red', 'Cal 16 Red', 16, 8, FOOT_COLORS.Red, 'footprint'),
  squareItem('calFoot16Green', 'Cal 16 Green', 16, 8, FOOT_COLORS.Green, 'footprint'),
  squareItem('calFoot16Blue', 'Cal 16 Blue', 16, 8, FOOT_COLORS.Blue, 'footprint'),
  squareItem('calFoot32Red', 'Cal 32 Red', 32, 8, FOOT_COLORS.Red, 'footprint'),
  squareItem('calFoot32Blue', 'Cal 32 Blue', 32, 8, FOOT_COLORS.Blue, 'footprint'),
  squareItem('calFoot64Gray', 'Cal 64 Gray', 64, 8, FOOT_COLORS.Gray, 'footprint'),
  squareItem('calBoxRed', 'Cal Box Red', 32, 16, '#ff4d4d', 'selection'),
  squareItem('calBoxGreen', 'Cal Box Green', 32, 16, '#3dff8a', 'selection'),
  squareItem('calBoxBlue', 'Cal Box Blue', 32, 16, '#4d8cff', 'selection'),
  squareItem('calBoxYellow', 'Cal Box Yellow', 32, 16, '#ffe14a', 'selection'),
  { id: 'calPartial', name: 'Cal Partial', tag: 'selection', w: 32, d: 32, h: 16, alpha: 128, prisms: [{ w: 32, d: 32, z1: 16, color: rgb('#7ee0ff') }] },
  { id: 'calHollow', name: 'Cal Hollow', tag: 'selection', w: 32, d: 32, h: 16, hollow: true, prisms: [{ w: 32, d: 32, z1: 16, color: rgb('#ffffff') }] },
  {
    id: 'calIrregular',
    name: 'Cal Irregular',
    tag: 'selection',
    w: 32,
    d: 32,
    h: 12,
    prisms: [
      { w: 32, d: 12, z1: 12, color: rgb('#d13bd1') },
      { w: 12, d: 32, z1: 12, color: rgb('#d13bd1') },
    ],
  },
  squareItem('calTallNarrow', 'Cal Tall Narrow', 8, 48, '#7dffd1', 'selection'),
  { id: 'calWideLow', name: 'Cal Wide Low', tag: 'selection', w: 32, d: 8, h: 4, prisms: [{ w: 32, d: 8, z1: 4, color: rgb('#ff9f40') }] },
]

function opaqueBox(bytes, width, height) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bytes[(y * width + x) * 4 + 3] <= ALPHA) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return { opaqueWidth: maxX - minX + 1, opaqueHeight: maxY - minY + 1 }
}

function assertSquare(item, decoded) {
  if (item.prisms.length !== 1 || item.w !== item.d || item.hollow || item.alpha) return
  const box = opaqueBox(decoded.bytes, decoded.width, decoded.height)
  const designW = Math.round(box.opaqueWidth / S)
  const designH = Math.round(box.opaqueHeight / S)
  const derived = designH - Math.round(designW / 2)
  if (designW !== item.w || derived !== item.h) {
    throw new Error(`${item.id} measured ${designW}×${derived}, expected ${item.w}×${item.h} (canvas ${decoded.width}×${decoded.height})`)
  }
}

function tileLine(spec) {
  const ih = imageHeightFor(spec.height)
  const image = `/art/sprites/environment/calibration/${spec.id}.png`
  const height = spec.height ?? 0
  const solid = height > 0
  const wall = spec.kind === 'wall' || spec.kind === 'corner' || spec.kind === 'end' || spec.kind === 'cross'
  const fields = [
    `"id": "${spec.id}"`,
    `"symbol": "${spec.symbol}"`,
    `"label": "${spec.label}"`,
    `"image": "${image}"`,
    `"solid": ${solid}`,
    `"blocksSight": ${wall}`,
    `"cover": ${spec.cover === true}`,
    `"fade": ${wall}`,
    wall ? `"wall": true` : null,
    `"height": ${height}`,
    ih ? `"imageHeight": ${ih}` : null,
    spec.surface ? `"surface": ${JSON.stringify({ ...(spec.inset ? { inset: spec.inset } : {}), maxStack: 3 })}` : null,
    `"role": null`,
  ].filter(Boolean)
  return `    { ${fields.join(', ')} },`
}

function patchTilesJson() {
  const file = path.join(root, 'src/data/adaptation/maps/tiles.json')
  let text = fs.readFileSync(file, 'utf8')
  text = text
    .split('\n')
    .filter((line) => !/"id":\s*"cal/.test(line))
    .join('\n')
  text = text.replace(/Next free symbol: \S+/, 'Next free symbol: Ľ')
  const groups = GROUPS.map((group, index) => {
    const line = `    ${JSON.stringify({ id: group.id, section: group.section, label: group.label, tiles: group.tiles })}`
    return index === GROUPS.length - 1 ? line : `${line},`
  }).join('\n')
  if (!text.includes('"id": "glassPlains"')) throw new Error('palette anchor missing')
  text = text.replace(
    /(\{ "id": "glassPlains"[^\n]*)\n/,
    (_, line) => `${line.replace(/,?\s*$/, '')},\n${groups}\n`,
  )
  const tiles = TILES.map(tileLine).join('\n')
  const nullLine = text.split('\n').find((line) => line.includes('"id": "null"'))
  if (!nullLine) throw new Error('null tile missing')
  text = text.replace(nullLine, `${tiles}\n${nullLine}`)
  fs.writeFileSync(file, text)
}

function itemLine(item) {
  const href = `/art/sprites/environment/items/${item.id}.png`
  const body = {
    id: item.id,
    name: item.name,
    category: 'calibration',
    icon: href,
    worldImage: href,
    description: `Calibration fixture. Intended world size ${item.w}×${item.d}×${item.h}.`,
    tags: ['calibration', item.tag],
    equipSlot: null,
    sourceType: 'original',
    statsSourceType: 'adaptation',
  }
  return `    ${JSON.stringify(body)},`
}

function patchItemsJson() {
  const file = path.join(root, 'src/data/adaptation/items.json')
  let text = fs.readFileSync(file, 'utf8')
  text = text
    .split('\n')
    .filter((line) => !/"id":"cal/.test(line) && !/"id": "cal/.test(line))
    .join('\n')
  if (!text.includes('"calibration"')) {
    text = text.replace('"engineering": "Engineering"\n  },', '"engineering": "Engineering",\n    "calibration": "Calibration"\n  },')
    text = text.replace('"engineering": "#f6b928"\n  },', '"engineering": "#f6b928",\n    "calibration": "#7dffd1"\n  },')
  }
  text = text.replace(/,(\n  \]\n\}\n?)$/, '$1')
  const itemLines = ITEMS.map(itemLine)
  itemLines[itemLines.length - 1] = itemLines[itemLines.length - 1].replace(/,$/, '')
  const lines = itemLines.join('\n')
  if (!text.endsWith('\n')) text += '\n'
  text = text.replace(/\n  \]\n\}\n?$/, `,\n${lines}\n  ]\n}\n`)
  fs.writeFileSync(file, text)
}

function anchor(tileX, tileY, footprint, col, row) {
  const round = (n) => Math.round(n * 1000) / 1000
  return [round(tileX - 0.5 + (col + 1) * footprint), round(tileY - 0.5 + (row + 1) * footprint)]
}

function buildMap() {
  const W = 40
  const H = 30
  const byId = Object.fromEntries(TILES.map((tile) => [tile.id, tile.symbol]))
  const grid = Array.from({ length: H }, () => Array(W).fill('ġ'))
  const fill = (x0, y0, x1, y1, id) => {
    const sym = id === 'null' ? 'ġ' : byId[id]
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = sym
  }
  const set = (x, y, id) => {
    grid[y][x] = byId[id]
  }
  fill(1, 1, 12, 8, 'calFloorGrid')
  fill(14, 1, 25, 8, 'calFloor')
  fill(27, 1, 38, 8, 'calFloorCenter')
  fill(1, 10, 18, 19, 'calFloorCorners')
  fill(20, 10, 38, 19, 'calFloor')
  fill(1, 21, 18, 28, 'calFloor')
  fill(20, 21, 38, 28, 'calFloorGrid')

  for (const [x, id] of [
    [29, 'calBlock8'],
    [31, 'calBlock16'],
    [33, 'calBlock32'],
    [35, 'calBlock64'],
    [37, 'calBlock92'],
  ]) set(x, 3, id)
  set(29, 6, 'calBlock16')
  set(32, 6, 'calBlock32')
  set(35, 6, 'calBlock8')
  set(37, 6, 'calBlock92')

  set(4, 13, 'calTable')
  set(8, 13, 'calCrate')
  set(12, 13, 'calPlatformLow')
  set(15, 13, 'calPlatformMid')
  set(17, 13, 'calPlatformTall')
  set(4, 17, 'calSteps')
  set(8, 17, 'calPlatformLow')
  set(12, 17, 'calPlatformLow')

  for (const [x, id] of [
    [22, 'calChair'],
    [24, 'calStool'],
    [26, 'calBench'],
    [28, 'calBed'],
    [30, 'calConsole'],
    [32, 'calLocker'],
    [34, 'calShelf'],
  ]) set(x, 22, id)

  for (let x = 22; x <= 28; x++) set(x, 13, 'calWall')
  set(22, 16, 'calWallCorner')
  set(26, 16, 'calWallCross')
  set(30, 16, 'calWallEnd')
  for (let x = 22; x <= 27; x++) set(x, 18, 'calWallHalf')

  const items = []
  const put = (id, itemId, tileX, tileY, col, row, footprint, onTile = null) => {
    const [x, y] = anchor(tileX, tileY, footprint, col, row)
    const entry = { id, itemId, position: [x, y] }
    if (onTile) entry.on = { tile: onTile }
    items.push(entry)
  }
  put('reg-a-64', 'calFoot64Gray', 3, 3, 0, 0, 1)
  put('reg-a-32a', 'calFoot32Red', 6, 3, 0, 0, 0.5)
  put('reg-a-32b', 'calFoot32Blue', 6, 3, 1, 0, 0.5)
  put('reg-a-32c', 'calFoot32Red', 6, 3, 0, 1, 0.5)
  put('reg-a-32d', 'calFoot32Blue', 6, 3, 1, 1, 0.5)
  put('reg-a-16a', 'calFoot16Red', 9, 3, 0, 0, 0.25)
  put('reg-a-16b', 'calFoot16Green', 9, 3, 2, 0, 0.25)
  put('reg-a-8a', 'calFoot8Red', 3, 6, 0, 0, 0.125)
  put('reg-a-8b', 'calFoot8Green', 3, 6, 1, 0, 0.125)
  put('reg-a-8c', 'calFoot8Blue', 3, 6, 2, 0, 0.125)
  put('reg-a-8d', 'calFoot8Yellow', 3, 6, 3, 0, 0.125)

  put('reg-b-side-a', 'calBoxRed', 16, 3, 0, 0, 0.5)
  put('reg-b-side-b', 'calBoxGreen', 16, 3, 1, 0, 0.5)
  put('reg-b-back', 'calBoxBlue', 20, 3, 0, 0, 0.5)
  put('reg-b-front', 'calBoxYellow', 21, 4, 1, 1, 0.5)
  put('reg-b-hidden', 'calFoot8Red', 23, 2, 0, 0, 0.125)
  put('reg-b-cover', 'calFoot64Gray', 23, 4, 0, 0, 1)
  set(18, 6, 'calPlatformTall')
  put('reg-b-high', 'calBoxRed', 18, 6, 0, 0, 0.5, [18, 6])
  put('reg-b-low', 'calBoxBlue', 19, 7, 0, 0, 0.5)
  put('reg-b-hollow', 'calHollow', 16, 6, 0, 0, 0.5)
  put('reg-b-partial', 'calPartial', 16, 6, 1, 1, 0.5)
  put('reg-b-solid', 'calBoxGreen', 16, 6, 1, 0, 0.5)
  put('reg-b-irregular', 'calIrregular', 22, 6, 0, 0, 0.5)
  put('reg-b-tall', 'calTallNarrow', 24, 6, 0, 0, 0.125)
  put('reg-b-wide', 'calWideLow', 24, 7, 0, 0, 0.5)

  put('reg-d-t1', 'calFoot8Red', 4, 13, 2, 2, 0.125, [4, 13])
  put('reg-d-t2', 'calFoot8Green', 4, 13, 4, 2, 0.125, [4, 13])
  put('reg-d-t3', 'calFoot8Blue', 4, 13, 2, 4, 0.125, [4, 13])
  put('reg-d-t4', 'calFoot8Yellow', 4, 13, 4, 4, 0.125, [4, 13])
  put('reg-d-c1', 'calFoot16Red', 8, 13, 0, 0, 0.25, [8, 13])
  put('reg-d-c2', 'calFoot16Blue', 8, 13, 2, 2, 0.25, [8, 13])
  put('reg-d-low', 'calFoot16Green', 12, 13, 1, 1, 0.25, [12, 13])
  put('reg-d-tall-a', 'calFoot8Red', 17, 13, 1, 1, 0.125, [17, 13])
  put('reg-d-tall-b', 'calFoot8Blue', 17, 13, 4, 4, 0.125, [17, 13])
  put('reg-d-stack', 'calFoot8Yellow', 12, 17, 3, 3, 0.125, [12, 17])

  put('reg-e-behind', 'calBoxRed', 25, 12, 0, 0, 0.5)
  put('reg-e-front', 'calBoxGreen', 25, 14, 1, 1, 0.5)
  put('reg-e-beside', 'calBoxBlue', 21, 13, 1, 0, 0.5)
  put('reg-e-corner', 'calBoxYellow', 23, 17, 0, 0, 0.5)
  put('reg-e-narrow', 'calTallNarrow', 26, 14, 2, 2, 0.125)

  put('reg-f-8', 'calFoot8Red', 4, 24, 0, 0, 0.125)
  put('reg-f-16', 'calFoot16Green', 6, 24, 0, 0, 0.25)
  put('reg-f-32', 'calFoot32Blue', 8, 24, 0, 0, 0.5)
  put('reg-f-tricorder', 'standardTricorder', 11, 24, 0, 0, 0.25)
  put('reg-f-phaser', 'phaserType1', 13, 24, 0, 0, 0.25)
  put('reg-f-box', 'stackBoxRed', 15, 24, 0, 0, 0.5)
  put('reg-exp-bed', 'calFoot8Blue', 28, 22, 2, 4, 0.125, [28, 22])
  put('reg-exp-console', 'calFoot8Yellow', 30, 22, 2, 3, 0.125, [30, 22])

  return {
    schemaVersion: 2,
    name: 'Object Systems Regression',
    episodeName: 'Object Systems Regression',
    card: null,
    mapType: 'starshipDeck',
    biome: 'temperate',
    weather: 'clear',
    ambient: 100,
    ambientColour: '#02040a',
    objects: [],
    rows: grid.map((row) => row.join('')),
    stackOver: {
      '29,6': ['calBlock16'],
      '32,6': ['calBlock16', 'calBlock8'],
      '35,6': ['calBlock64'],
      '8,17': ['calPlatformMid'],
      '12,17': ['calPlatformMid', 'calPlatformTall'],
    },
    areas: [
      { name: 'Zone A — Scale', position: [2, 1] },
      { name: 'Zone B — Selection', position: [15, 1] },
      { name: 'Zone C — Stacking', position: [28, 1] },
      { name: 'Zone D — Surfaces', position: [2, 11] },
      { name: 'Zone E — Walls', position: [21, 11] },
      { name: 'Zone F — Inventory', position: [2, 22] },
      { name: 'Experiment', position: [21, 22] },
    ],
    markers: {
      playerStarts: [
        [3, 26, 90],
        [4, 26, 90],
        [5, 26, 90],
        [6, 26, 90],
      ],
      enemySpawns: [],
    },
    groundItemPlacements: items,
    briefing:
      'Object Systems Regression. A is scale and footprints on the grid floor. B is selection: side by side, in front, behind a wide cover, on a tall platform, and through a hollow top. C is authored block heights 8, 16, 32, 64 and 92, including two- and three-high stacks (the prop stack cap is 3). D is tables, crates and platforms with small items on them. E is 92-tall calibration walls, a 46-tall wall, and items in front, behind and beside them. F is an open drop space with a few real inventory items. The south-east grid has a row of mock furniture along its north edge; the rest of it is empty.',
    stardate: 9999.4,
  }
}

const tileDir = path.join(root, 'public/art/sprites/environment/calibration')
const itemDir = path.join(root, 'public/art/sprites/environment/items')
fs.mkdirSync(tileDir, { recursive: true })
const drawn = new Map()
for (const spec of TILES) {
  const art = drawTileArt(spec)
  if (art.width !== 64 * S) throw new Error(`${spec.id} width ${art.width}`)
  const expectH = (imageHeightFor(spec.height) ?? TILE_CANVAS) * S
  if (art.height !== expectH) throw new Error(`${spec.id} height ${art.height}, expected ${expectH}`)
  drawn.set(spec.id, art)
  fs.writeFileSync(path.join(tileDir, `${spec.id}.png`), art.png)
}
for (const item of ITEMS) {
  const art = paintItem(item.prisms, { hollow: item.hollow, alpha: item.alpha ?? 255 })
  const decoded = decodePng(art.png)
  assertSquare(item, decoded)
  fs.writeFileSync(path.join(itemDir, `${item.id}.png`), art.png)
}
patchTilesJson()
patchItemsJson()
writeMeasuredPixels()
const map = buildMap()
const widths = new Set(map.rows.map((row) => [...row].length))
if (widths.size !== 1) throw new Error(`row widths ${[...widths].join(',')}`)
fs.writeFileSync(path.join(root, 'maps/Object Systems Regression.json'), `${JSON.stringify(map, null, 2)}\n`)
console.log(`calibration tiles ${TILES.length}, items ${ITEMS.length}, map ${map.rows[0].length}×${map.rows.length}, placements ${map.groundItemPlacements.length}`)
