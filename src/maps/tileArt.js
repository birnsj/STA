// Tile lighting effects (tileEffects.json): glows, animated light overlays and wall variants. Presentation only.
import effects from '../data/adaptation/maps/tileEffects.json'

// [{ href, style }] light overlays for a tile: tileEffects.json's for it, else the tile's own (tiles.json lights), or none.
const NO_ANIMATIONS = []
export const tileAnimations = (tile) =>
  (effects.animations[tile.id] ?? tile.lights)?.map((item) => ({ href: item.image, style: item.style })) ?? NO_ANIMATIONS

// A steady pseudo-random number in [0, 1) for a map position, so choices made from it never change between visits.
function positionRandom({ x, y }, seed) {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(seed, 982451653)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// The wall variant drawn at a position ({ href, lights: [{ href, style }] }), or null for the plain wall.
export function wallVariant(tile, position) {
  const set = effects.wallVariants[tile.id]
  if (!set || positionRandom(position, 1) >= set.share) return null
  const variant = set.variants[Math.floor(positionRandom(position, 2) * set.variants.length)]
  return {
    href: variant.image,
    lights: variant.lights.map((item) => ({ href: item.image, style: item.style })),
  }
}

// Two-tile panel art (tiles.json panelImages): one image per direction a panel runs, with both tiles standing side by
// side, PANEL_IMAGE in size. Each tile draws its own 64 x 96 slot of it, PANEL_OFFSETS[axis][half] from the image's
// top left (scripts/v2/panels.mjs draws them to match).
export const PANEL_IMAGE = { width: 96, height: 112 }
const PANEL_OFFSETS = {
  x: [{ x: 0, y: 0 }, { x: 32, y: 16 }],
  y: [{ x: 32, y: 0 }, { x: 0, y: 16 }],
}

// The panel art a wall tile draws ({ href, lights: [{ href, style }], offset, timing }), or null for its own image:
// window walls show it on window panels, long wall fittings (panelFitting) on every panel. timing: the panel's first
// tile, so both halves' lights animate together.
export function panelArt(tile, panel, position) {
  if (!panel || !tile.panelImages || !(tile.panelFitting || panel.window)) return null
  const { axis, half } = panel
  return {
    href: tile.panelImages[axis],
    lights: (tile.panelLights ?? []).map((light) => ({ href: light[axis], style: light.style })),
    offset: PANEL_OFFSETS[axis][half],
    timing: half === 0 ? position : axis === 'x' ? { x: position.x - 1, y: position.y } : { x: position.x, y: position.y - 1 },
  }
}

// A steady per-tile offset into an animation, so neighbouring machines are out of step.
export const animationDelay = ({ x, y }) => `${-(((x * 7 + y * 13) % 17) / 17) * 3}s`

export const tileGlow = (tileId) => effects.glows[tileId] ?? null
export const tileActiveGlow = (tileId) => effects.activeGlows[tileId] ?? null
