// Shared grid overlay sizes for the map editor (world pixels; 64 = one tile).
// World-pixel cell sizes. 2 = play's 32×32 item grid (TILE_W/32); 4 = 16×16; 8 = 8×8.
import { TILE_W } from '../../maps/iso.js'

export const EDITOR_GRID_SIZES = [2, 4, 8, 16, 32, 64, 128, 256]

// Fine steps that already hit tile edges keep origin 0. Coarse steps (64+) start on tile edges (−0.5) so the
// guide matches floor diamonds and the map boundary — same rule as EditorGridView.
export function guideOrigin(step) {
  return Math.abs(0.5 / step - Math.round(0.5 / step)) > 1e-9 ? -0.5 : 0
}

// Snap a tile-space point to the editor guide grid (same intersections the red mark and grid lines use).
export function snapToGuideGrid(point, cellPx = TILE_W) {
  const size = Number(cellPx) > 0 ? Number(cellPx) : TILE_W
  const step = size / TILE_W
  if (!(step > 0) || !point) return point
  const origin = guideOrigin(step)
  return {
    x: origin + Math.round((point.x - origin) / step) * step,
    y: origin + Math.round((point.y - origin) / step) * step,
  }
}
