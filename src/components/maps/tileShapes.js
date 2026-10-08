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
