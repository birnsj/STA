import { CanvasSource, CanvasTextMetrics, ImageSource, Text, TextStyle, Texture } from 'pixi.js'

// Small drawing helpers for the Pixi board: labels placed like SVG text, dashed outlines, canvas-drawn textures.
// Presentation only.

// base.css --display-font.
const DISPLAY_FONT = ['Bahnschrift SemiCondensed', 'Bahnschrift', 'Arial Narrow', 'Roboto Condensed', 'sans-serif']
// Labels are drawn at this many pixels per world unit, so they stay sharp zoomed in on a high-density screen.
const TEXT_RESOLUTION = 4
const OUTLINE = '#03060e'

// A board label: centred, with an outline outlineWidth wide drawn under the fill unless outline is false (a colour
// for an outline other than the board's near-black). Place it with placeLabel.
export function makeLabel(text, { size, weight = '700', fill, letterSpacing = 0, outline = true, outlineWidth = 3 }) {
  const style = new TextStyle({
    fontFamily: DISPLAY_FONT,
    fontSize: size,
    fontWeight: weight,
    fill,
    letterSpacing,
    stroke: outline !== false ? { color: outline === true ? OUTLINE : outline, width: outlineWidth, join: 'round' } : undefined,
  })
  const label = new Text({ text, style, resolution: TEXT_RESOLUTION })
  label.anchor.set(0.5, 0)
  label.baselineOffset = CanvasTextMetrics.measureText(text || ' ', style).fontProperties.ascent + (outline !== false ? outlineWidth / 2 : 0)
  return label
}

// Puts a label's text baseline at (x, y), as SVG text's x and y.
export function placeLabel(label, x, y) {
  label.position.set(x, y - label.baselineOffset)
}

// A dashed straight line (SVG stroke-dasharray `dash gap`), as path segments; stroke it after.
export function dashedLine(graphics, from, to, dash, gap) {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  if (!length) return
  const at = (d) => ({ x: from.x + ((to.x - from.x) * d) / length, y: from.y + ((to.y - from.y) * d) / length })
  for (let along = 0; along < length; along += dash + gap) {
    const [a, b] = [at(along), at(Math.min(length, along + dash))]
    graphics.moveTo(a.x, a.y).lineTo(b.x, b.y)
  }
}

// A dashed ellipse outline (SVG stroke-dasharray), drawn as short arcs.
export function dashedEllipse(graphics, cx, cy, rx, ry, dash, gap, stroke) {
  const steps = 96
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const angle = (i / steps) * Math.PI * 2
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry }
  })
  let along = 0
  for (let i = 0; i < steps; i++) {
    const a = points[i]
    const b = points[i + 1]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const on = along % (dash + gap) < dash
    if (on) graphics.moveTo(a.x, a.y).lineTo(b.x, b.y)
    along += length
  }
  graphics.stroke(stroke)
}

// A texture of its own for a canvas or a loaded image (Texture.from caches by resource, and these are destroyed with
// the board).
export const textureOf = (resource) => new Texture({ source: resource instanceof HTMLImageElement ? new ImageSource({ resource }) : new CanvasSource({ resource }) })

// A canvas covering a world area at `resolution` pixels per unit, drawn by draw(context) in world units.
export function drawnCanvas(area, resolution, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(area.width * resolution))
  canvas.height = Math.max(1, Math.ceil(area.height * resolution))
  const context = canvas.getContext('2d')
  context.setTransform(resolution, 0, 0, resolution, -area.x * resolution, -area.y * resolution)
  draw(context, canvas)
  return canvas
}

// A ColorMatrixFilter matrix (4 rows of 5) for the CSS filter `brightness() sepia() saturate() hue-rotate()` in that
// order, with the Filter Effects spec's matrices (Pixi's own sepia, saturate and hue helpers use other formulas).
// hue in degrees. (CSS clamps between the functions; this doesn't, which only matters for very bright pixels.)
export function cssFilterMatrix({ brightness = 1, sepia = 0, saturate = 1, hue = 0 }) {
  const k = 1 - sepia
  const sepiaM = [
    [0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k],
    [0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k],
    [0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k],
  ]
  const s = saturate
  const saturateM = [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ]
  const c = Math.cos((hue * Math.PI) / 180)
  const n = Math.sin((hue * Math.PI) / 180)
  const hueM = [
    [0.213 + c * 0.787 - n * 0.213, 0.715 - c * 0.715 - n * 0.715, 0.072 - c * 0.072 + n * 0.928],
    [0.213 - c * 0.213 + n * 0.143, 0.715 + c * 0.285 + n * 0.14, 0.072 - c * 0.072 - n * 0.283],
    [0.213 - c * 0.213 - n * 0.787, 0.715 - c * 0.715 + n * 0.715, 0.072 + c * 0.928 + n * 0.072],
  ]
  const times = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]))
  const m = times(hueM, times(saturateM, sepiaM)).map((row) => row.map((value) => value * brightness))
  return [...m[0], 0, 0, ...m[1], 0, 0, ...m[2], 0, 0, 0, 0, 0, 1, 0]
}

// CSS colour strings used as Pixi colours with their alpha.
export function rgba(r, g, b, a) {
  return { color: (r << 16) | (g << 8) | b, alpha: a }
}
