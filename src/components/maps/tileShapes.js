// Shapes shared by the SVG tiles (IsoTiles.jsx) and the editor's canvas (canvasTiles.js), so both draw them the same.
import { project } from '../../maps/iso.js'

// Soft contact shadows: three bands of decreasing darkness along each floor edge that meets a block.
// [from, to, opacity], as fractions of the tile inward from the edge.
export const SHADE_BANDS = [
  [0, 0.07, 0.34],
  [0.07, 0.16, 0.2],
  [0.16, 0.3, 0.09],
]
export const SIDES = [
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
]
// The floor strip of tile (x, y) between from and to inward from its edge facing side.
export function edgeStrip({ x, y }, side, from, to) {
  const corner = (u, v) => project({ x: x - 0.5 + u, y: y - 0.5 + v })
  if (side.dx === -1) return [corner(from, 0), corner(to, 0), corner(to, 1), corner(from, 1)]
  if (side.dx === 1) return [corner(1 - from, 0), corner(1 - to, 0), corner(1 - to, 1), corner(1 - from, 1)]
  if (side.dy === -1) return [corner(0, from), corner(0, to), corner(1, to), corner(1, from)]
  return [corner(0, 1 - from), corner(0, 1 - to), corner(1, 1 - to), corner(1, 1 - from)]
}

// A panel window's extent along the two-tile panel (U 0..2) and up the wall (fractions of its height), and its frame.
export const WINDOW = { from: 0.3, to: 1.7, bottom: 0.4, top: 0.8 }
export const FRAME = { along: 0.07, height: 3 }

// Long Star Trek wall fittings (tiles.json panelFitting), drawn across the whole two-tile panel.
// Shapes: [u0, u1, v0, v1 (fractions of the wall height), className, colour, animated, animation].
const LCARS_ROWS = [0.47, 0.53, 0.59, 0.65]
export const FITTINGS = {
  lcars: () => [
    [0.12, 1.88, 0.3, 0.82, 'wall-fit-frame'],
    [0.16, 1.84, 0.33, 0.79, null, '#04060b'],
    [0.2, 0.36, 0.38, 0.76, null, '#c890d8'],
    [0.38, 1.8, 0.72, 0.76, null, '#f0a040'],
    [0.38, 1.18, 0.36, 0.39, null, '#7aa0e0'],
    [1.22, 1.8, 0.36, 0.39, null, '#e07040'],
    ...LCARS_ROWS.flatMap((v, row) => [
      [0.44, 0.44 + 0.3 + row * 0.08, v, v + 0.025, null, '#f0c070'],
      [0.9 + row * 0.07, 1.46, v, v + 0.025, null, row % 2 ? '#9ab8f0' : '#e09060', row === 1],
      [1.52, 1.74, v, v + 0.025, null, '#c890d8', row === 3],
    ]),
  ],
  conduit: () => [
    [0, 2, 0.4, 0.62, 'wall-fit-frame'],
    [0.04, 1.96, 0.47, 0.55, null, '#1c6a88'],
    [0.04, 1.96, 0.48, 0.54, null, '#7ae4ff', true, 'wall-fit-pulse'],
    ...[0.22, 0.72, 1.22, 1.72].map((u) => [u, u + 0.07, 0.38, 0.64, null, '#5c6a72']),
    [0.9, 1.1, 0.66, 0.7, null, '#d8b020'],
  ],
  hatch: () => [
    [0.52, 1.48, 0.05, 0.64, 'wall-fit-frame'],
    [0.57, 1.43, 0.09, 0.6, null, '#4a545a'],
    ...Array.from({ length: 8 }, (_, i) => [0.57 + i * 0.1075, 0.57 + (i + 1) * 0.1075, 0.53, 0.58, null, i % 2 ? '#1a1a1a' : '#d8b020']),
    [0.985, 1.015, 0.09, 0.53, null, '#262c30'],
    [1.52, 1.6, 0.42, 0.46, null, '#50ff70', true],
    [0.4, 0.48, 0.42, 0.46, null, '#ff6040'],
  ],
  computer: (seed) => [
    [0.1, 1.9, 0.18, 0.86, 'wall-fit-frame'],
    ...Array.from({ length: 8 * 9 }, (_, i) => {
      const column = i % 8
      const row = Math.floor(i / 8)
      const u = 0.2 + column * 0.205
      const v = 0.24 + row * 0.065
      const pick = (seed * 31 + i * 17) % 11
      const colour = ['#ff5040', '#ffc040', '#50ff70', '#5ac8ff', '#ffffff'][pick % 5]
      return [u, u + 0.09, v, v + 0.028, null, pick < 3 ? '#2a3238' : colour, pick > 7]
    }),
  ],
}
