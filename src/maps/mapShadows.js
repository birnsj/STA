// Soft directional cast shadows shared by map floor lighting (canvasTiles.js) and character figures (figures.js).
// Fixed iso light from the top-left: shadows fall toward +x/+y (screen bottom). Presentation only.
import { project, TILE_H, TILE_W } from './iso.js'
import { getTile } from './mapFormat.js'

// Tile-space offset of a cast shadow's centre from the caster's floor point.
export const CAST_TILE = { dx: 0.38, dy: 0.28 }

// World-pixel offset of that cast (project is linear through the origin).
export const CAST_WORLD = project(CAST_TILE)

// Character foot-shadow nudge in figure body space (same direction as CAST_WORLD; figures sit on the floor diamond).
export const FIGURE_CAST = {
  x: CAST_WORLD.x * 0.55,
  y: CAST_WORLD.y * 0.55,
  scaleX: 1.35,
  scaleY: 0.85,
  skewX: 0.28,
}

// Soft floor blob for one solid block. heightScale 0..1 from tile.height.
// Kept small and light: neighbouring walls share floor, and stacked source-over blobs must not become a black plane.
export function blockCastShadow(position, tileId) {
  const height = getTile(tileId).height || 0
  if (!(height > 0)) return null
  const heightScale = Math.min(1, height / 96)
  const base = project(position)
  return {
    x: base.x + CAST_WORLD.x,
    y: base.y + CAST_WORLD.y,
    rx: TILE_W * (0.3 + 0.1 * heightScale),
    ry: TILE_H * (0.3 + 0.1 * heightScale),
    alpha: 0.045 + 0.04 * heightScale,
  }
}
