// Two-tile wall panels (tiles.json panelImages): one image per direction a panel runs, both tiles drawn standing side
// by side, which the map views cut into each tile's share (src/maps/tileArt.js panelArt). The window and the long
// Star Trek wall fittings are painted in here rather than drawn over the walls by the views.
import { bevel, DESIGN_H, DESIGN_W, inside, mix, render, renderLights, RESOLUTION, rgb, scale, smoothstep } from './engine.mjs'

export const PANEL_W = (DESIGN_W + 32) * RESOLUTION
export const PANEL_H = (DESIGN_H + 16) * RESOLUTION
// Where each tile's 64 x 96 slot sits in a panel image (design pixels); must match tileArt.js PANEL_OFFSETS. Half 0 is
// the tile nearer the map's origin, half 1 the next one along x (axis 'x') or y (axis 'y'), which stands in front.
export const PANEL_OFFSETS = {
  x: [{ x: 0, y: 0 }, { x: 32, y: 16 }],
  y: [{ x: 32, y: 0 }, { x: 0, y: 16 }],
}

// A panel's scene from each tile's (sceneFor(half) -> a tile scene); the front tile covers the back one.
export function panelScene(axis, sceneFor) {
  const scenes = [sceneFor(0), sceneFor(1)]
  const at = (half, px, py) => {
    const x = px - PANEL_OFFSETS[axis][half].x
    const y = py - PANEL_OFFSETS[axis][half].y
    return x >= 0 && x < DESIGN_W && y >= 0 && y < DESIGN_H ? scenes[half](x, y) : null
  }
  return (px, py) => at(1, px, py) ?? at(0, px, py)
}

export const renderPanel = (scene) => ({ width: PANEL_W, height: PANEL_H, bytes: render(scene, { width: PANEL_W, height: PANEL_H }) })
export const renderPanelLights = (scene, tags, options = {}) => ({
  width: PANEL_W,
  height: PANEL_H,
  bytes: renderLights(scene, tags, { ...options, width: PANEL_W, height: PANEL_H }),
})

// A feature in panel coordinates (P along the panel in texels, 0..64 with the tiles meeting at 32; z up the drawn wall)
// as one tile's fitting ({ height, surface } of (u, z, face), null outside it): only on the face the panel runs along,
// the left face for axis 'x' and the right face for 'y'.
export function onPanelFace(axis, half, feature) {
  const face = axis === 'x' ? 'left' : 'right'
  const along = (u) => half * 32 + (axis === 'x' ? u : 32 - u)
  return {
    height: (u, z, f) => (f === face ? feature.height(along(u), z) : null),
    surface: (u, z, f) => (f === face ? feature.surface(along(u), z) : null),
  }
}

// A wall material with a fitting built into its side faces.
export const withFitting = (material, fitting) => ({
  height: (u, v, face) => (face === 'top' ? null : fitting.height(u, v, face)) ?? material.height(u, v, face),
  surface: (u, v, face) => (face === 'top' ? null : fitting.surface(u, v, face)) ?? material.surface(u, v, face),
})

const within = (value, from, to) => value >= from && value <= to
const glowing = (colour, strength, tag = null) => ({ albedo: scale(colour, 0.5), emit: scale(colour, strength), tag })

// The panel window: a raised frame, recessed dark glass lit faintly from below, two reflection bands, the centre
// mullion where the tiles meet and a lit sill. Its extent matches the views' WINDOW and FRAME
// (src/components/maps/tileShapes.js) so the stars they twinkle on top land on the glass.
const WINDOW = { from: 0.3 * 32, to: 1.7 * 32, bottom: 0.4, top: 0.8, frameAlong: 0.07 * 32, frameHeight: 3 }
export function windowFeature(drawnHeight) {
  const bottom = drawnHeight * WINDOW.bottom
  const top = drawnHeight * WINDOW.top
  const glass = (P, z) => inside(P, z, WINDOW.from, bottom, WINDOW.to, top)
  const frame = (P, z) => inside(P, z, WINDOW.from - WINDOW.frameAlong, bottom - WINDOW.frameHeight, WINDOW.to + WINDOW.frameAlong, top + WINDOW.frameHeight)
  const mullion = (P) => Math.abs(P - 32) < 1.1
  const reflection = (P, z) => {
    const slant = P + (z - bottom) * 0.3
    return within(slant, 20, 25) || within(slant, 45, 46.6)
  }
  return {
    height(P, z) {
      if (frame(P, z) <= 0) return null
      const g = glass(P, z)
      if (g > 0) return mullion(P) ? 0.3 : -1.6 * smoothstep(0, 1, g)
      return 0.5 + bevel(frame(P, z), 1, 0.5)
    },
    surface(P, z) {
      if (frame(P, z) <= 0) return null
      const g = glass(P, z)
      if (g <= 0 || mullion(P)) {
        if (g <= 0 && z < bottom && z > bottom - WINDOW.frameHeight + 1) return { albedo: rgb('#b8c4ce'), spec: 0.6, shininess: 45 }
        return { albedo: rgb('#2c343b'), spec: 0.45, shininess: 34 }
      }
      const low = 1 - smoothstep(bottom, bottom + (top - bottom) * 0.45, z)
      const tint = mix(rgb('#060c18'), rgb('#0c1a2e'), low)
      if (reflection(P, z)) return { albedo: mix(tint, rgb('#9cc4ea'), 0.18), spec: 0.95, shininess: 90, emit: scale(rgb('#5a96dc'), 0.05) }
      return { albedo: tint, spec: 0.9, shininess: 80, emit: scale(rgb('#5a96dc'), 0.1 * low), ao: 0.85 + 0.15 * smoothstep(0, 2, g) }
    },
  }
}

// The long Star Trek wall fittings (tiles.json panelFitting), laid out across the panel: [u0, u1, v0, v1 (U along the
// panel 0..2, v up the wall as fractions of its height), kind, colour, animated]. kind 'frame' is the fitting's
// recessed surround. Animated shapes are lights: dim in the panel image, lit in its light overlay (panelLights).
const LCARS_ROWS = [0.47, 0.53, 0.59, 0.65]
const FITTINGS = {
  lcars: {
    style: 'blink',
    shapes: [
      [0.12, 1.88, 0.3, 0.82, 'frame'],
      [0.16, 1.84, 0.33, 0.79, 'glass', '#04060b'],
      [0.2, 0.36, 0.38, 0.76, 'light', '#c890d8'],
      [0.38, 1.8, 0.72, 0.76, 'light', '#f0a040'],
      [0.38, 1.18, 0.36, 0.39, 'light', '#7aa0e0'],
      [1.22, 1.8, 0.36, 0.39, 'light', '#e07040'],
      ...LCARS_ROWS.flatMap((v, row) => [
        [0.44, 0.44 + 0.3 + row * 0.08, v, v + 0.025, 'light', '#f0c070'],
        [0.9 + row * 0.07, 1.46, v, v + 0.025, 'light', row % 2 ? '#9ab8f0' : '#e09060', row === 1],
        [1.52, 1.74, v, v + 0.025, 'light', '#c890d8', row === 3],
      ]),
    ],
  },
  conduit: {
    style: 'pulse',
    shapes: [
      [0, 2, 0.4, 0.62, 'frame'],
      [0.04, 1.96, 0.47, 0.55, 'light', '#1c6a88'],
      [0.04, 1.96, 0.48, 0.54, 'light', '#7ae4ff', true],
      ...[0.22, 0.72, 1.22, 1.72].map((u) => [u, u + 0.07, 0.38, 0.64, 'metal', '#5c6a72']),
      [0.9, 1.1, 0.66, 0.7, 'paint', '#d8b020'],
    ],
  },
  hatch: {
    style: 'blink',
    shapes: [
      [0.52, 1.48, 0.05, 0.64, 'frame'],
      [0.57, 1.43, 0.09, 0.6, 'metal', '#4a545a'],
      ...Array.from({ length: 8 }, (_, i) => [0.57 + i * 0.1075, 0.57 + (i + 1) * 0.1075, 0.53, 0.58, 'paint', i % 2 ? '#1a1a1a' : '#d8b020']),
      [0.985, 1.015, 0.09, 0.53, 'metal', '#262c30'],
      [1.52, 1.6, 0.42, 0.46, 'light', '#50ff70', true],
      [0.4, 0.48, 0.42, 0.46, 'light', '#ff6040'],
    ],
  },
  computer: {
    style: 'blink',
    shapes: [
      [0.1, 1.9, 0.18, 0.86, 'frame'],
      ...Array.from({ length: 8 * 9 }, (_, i) => {
        const u = 0.2 + (i % 8) * 0.205
        const v = 0.24 + Math.floor(i / 8) * 0.065
        const pick = (i * 17) % 11
        const colour = ['#ff5040', '#ffc040', '#50ff70', '#5ac8ff', '#ffffff'][pick % 5]
        return pick < 3 ? [u, u + 0.09, v, v + 0.028, 'metal', '#2a3238'] : [u, u + 0.09, v, v + 0.028, 'light', colour, pick > 7]
      }),
    ],
  },
}
export const fittingStyle = (kind) => FITTINGS[kind].style

// lights: the light overlay's scene (only the animated lights, tagged 'lights') instead of the panel image's.
export function fittingFeature(kind, drawnHeight, { lights = false } = {}) {
  const shapes = FITTINGS[kind].shapes.map(([u0, u1, v0, v1, part, colour, animated = false]) => ({
    P0: u0 * 32,
    P1: u1 * 32,
    z0: v0 * drawnHeight,
    z1: v1 * drawnHeight,
    part,
    colour: colour && rgb(colour),
    animated,
  }))
  const frame = shapes.find((shape) => shape.part === 'frame')
  const inFrame = (P, z) => inside(P, z, frame.P0, frame.z0, frame.P1, frame.z1)
  const hit = (P, z) => shapes.findLast((shape) => shape.part !== 'frame' && within(P, shape.P0, shape.P1) && within(z, shape.z0, shape.z1))
  return {
    height(P, z) {
      const shape = hit(P, z)
      const d = inFrame(P, z)
      if (d <= 0) return shape ? 0.4 : null
      if (!shape) return -0.4 + bevel(d, 1, 0.5)
      return shape.part === 'metal' || shape.part === 'paint' ? 0 : -0.7
    },
    surface(P, z) {
      const shape = hit(P, z)
      if (!shape && inFrame(P, z) <= 0) return null
      if (lights) return shape?.animated ? glowing(shape.colour, 1, 'lights') : { albedo: [0, 0, 0] }
      if (!shape) return { albedo: rgb('#1a2026'), spec: 0.45, shininess: 34 }
      if (shape.part === 'glass') return { albedo: shape.colour, spec: 0.9, shininess: 80 }
      if (shape.part === 'metal') return { albedo: shape.colour, spec: 0.5, shininess: 38 }
      if (shape.part === 'paint') return { albedo: shape.colour, spec: 0.2, shininess: 18 }
      return glowing(shape.colour, shape.animated ? 0.25 : 0.75)
    },
  }
}
