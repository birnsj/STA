// Flat-shape drawing for the mock portrait art scripts (makePortraitLayers.mjs, makePortraitBackdrops.mjs): shapes are
// { box: [x0, y0, x1, y1], inside(x, y) }, painted anti-aliased onto RGBA layers and written as PNG.
import fs from 'node:fs'
import path from 'node:path'
import { encodePng } from './png.mjs'

export const ellipse = (cx, cy, rx, ry) => ({
  box: [cx - rx, cy - ry, cx + rx, cy + ry],
  inside: (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
})

export function polygon(points) {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return {
    box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    inside: (x, y) => {
      let inside = false
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i]
        const [xj, yj] = points[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
      }
      return inside
    },
  }
}

export function roundRect(x0, y0, x1, y1, r) {
  return {
    box: [x0, y0, x1, y1],
    inside: (x, y) => {
      if (x < x0 || x > x1 || y < y0 || y > y1) return false
      const dx = Math.max(x0 + r - x, 0, x - (x1 - r))
      const dy = Math.max(y0 + r - y, 0, y - (y1 - r))
      return dx * dx + dy * dy <= r * r
    },
  }
}

// A stroke along a polyline, `width` wide.
export function stroke(points, width) {
  const half = width / 2
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return {
    box: [Math.min(...xs) - half, Math.min(...ys) - half, Math.max(...xs) + half, Math.max(...ys) + half],
    inside: (x, y) =>
      points.slice(1).some(([bx, by], index) => {
        const [ax, ay] = points[index]
        const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)))
        return (x - ax - t * (bx - ax)) ** 2 + (y - ay - t * (by - ay)) ** 2 <= half * half
      }),
  }
}

export const smile = (cx, cy, rx, ry, width) =>
  stroke(Array.from({ length: 13 }, (_, i) => [cx + rx * Math.cos(((30 + i * 10) * Math.PI) / 180), cy + ry * Math.sin(((30 + i * 10) * Math.PI) / 180)]), width)

export const union = (...shapes) => ({
  box: [Math.min(...shapes.map((s) => s.box[0])), Math.min(...shapes.map((s) => s.box[1])), Math.max(...shapes.map((s) => s.box[2])), Math.max(...shapes.map((s) => s.box[3]))],
  inside: (x, y) => shapes.some((shape) => shape.inside(x, y)),
})

export const intersect = (a, b) => ({
  box: [Math.max(a.box[0], b.box[0]), Math.max(a.box[1], b.box[1]), Math.min(a.box[2], b.box[2]), Math.min(a.box[3], b.box[3])],
  inside: (x, y) => a.inside(x, y) && b.inside(x, y),
})

export const above = (y0) => ({ box: [-1e9, -1e9, 1e9, y0], inside: (x, y) => y < y0 })

const SAMPLES = [0.25, 0.75]

export const createLayer = (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) })

function over(layer, x, y, colour, alpha) {
  const i = (y * layer.width + x) * 4
  const below = layer.data[i + 3] / 255
  const out = alpha + below * (1 - alpha)
  for (let c = 0; c < 3; c++) layer.data[i + c] = (colour[c] * alpha + layer.data[i + c] * below * (1 - alpha)) / out
  layer.data[i + 3] = out * 255
}

// Paints `shape` in `colour` over the layer, anti-aliased by 2 x 2 supersampling.
export function fill(layer, shape, colour, opacity = 1) {
  const [x0, y0, x1, y1] = shape.box
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(layer.height, Math.ceil(y1) + 1); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(layer.width, Math.ceil(x1) + 1); x++) {
      let hits = 0
      for (const sy of SAMPLES) for (const sx of SAMPLES) if (shape.inside(x + sx, y + sy)) hits++
      if (hits) over(layer, x, y, colour, (hits / 4) * opacity)
    }
  }
}

// An opaque vertical gradient, top colour to bottom colour.
export function verticalGradient(layer, top, bottom) {
  for (let y = 0; y < layer.height; y++) {
    const t = y / (layer.height - 1)
    for (let x = 0; x < layer.width; x++) {
      const i = (y * layer.width + x) * 4
      for (let c = 0; c < 3; c++) layer.data[i + c] = top[c] + (bottom[c] - top[c]) * t
      layer.data[i + 3] = 255
    }
  }
}

// An opaque radial gradient from `inner` at (cx, cy) to `outer` at the farthest corner.
export function radialBackground(layer, { inner, outer }, cx, cy) {
  const reach = Math.hypot(Math.max(cx, layer.width - cx), Math.max(cy, layer.height - cy))
  for (let y = 0; y < layer.height; y++) {
    for (let x = 0; x < layer.width; x++) {
      const t = Math.min(1, Math.hypot(x - cx, y - cy) / reach) ** 1.1
      const i = (y * layer.width + x) * 4
      for (let c = 0; c < 3; c++) layer.data[i + c] = inner[c] + (outer[c] - inner[c]) * t
      layer.data[i + 3] = 255
    }
  }
}

export function writeLayer(folder, name, layer) {
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, `${name}.png`), encodePng(layer.width, layer.height, layer.data))
}
