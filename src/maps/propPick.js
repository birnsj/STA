// Where a dropped prop is drawn, and which one a click on the board lands on.
//
// The Pixi board (GroundLootView) and the picker below share spriteGeometry/spriteHref, so the pixels the player sees
// and the pixels that answer a click cannot drift apart. The board sorts props by `depth` (container.zIndex); ties keep
// the order they were added in, which is the order of the list the board is given. drawOrder reproduces exactly that.
import { propImageBox } from './iso.js'
import { getTile, TILE_IMAGE } from './mapFormat.js'

// Alpha (0-255) a pixel must exceed to take a click. Low enough that soft anti-aliased edges still count, high enough
// that the near-invisible halo some PNG exports leave around a sprite does not.
export const ALPHA_PICK_THRESHOLD = 16
// The image loaded and is drawn, but its pixels could not be read (for example, a browser security restriction).
// In that case the documented fallback is the sprite bounds rather than making the visible prop unclickable.
export const BOUNDS_ALPHA_MASK = Symbol('bounds-alpha-mask')

// The art a prop is drawn with: its own world picture, else its tile's picture, else the crate.
export const spriteHref = (object) => object.worldImage || getTile(object.worldTile ?? 'crate')?.image || getTile('crate')?.image || null

// The sprite's size, its world lift and the box it covers on the board (board px, origin at the bottom corner of the iso
// graphic, raised by z). object: { position, z?, spriteSize? }. Size is the picture's design pixels; there is no per-item scale.
export function spriteGeometry(object) {
  const size = object.spriteSize ?? { width: TILE_IMAGE.width, height: TILE_IMAGE.height }
  const z = Math.max(0, Number(object.z) || 0)
  const base = propImageBox(object.position, size)
  return { size, z, box: z ? { ...base, y: base.y - z } : base }
}

// Back to front, as the board draws them.
export function drawOrder(objects) {
  return objects
    .map((object, index) => ({ object, index }))
    .sort((a, b) => a.object.depth - b.object.depth || a.index - b.index)
    .map(({ object }) => object)
}

// ---------------------------------------------------------------- alpha masks

// One byte of alpha per pixel of the source picture. Built once per picture (never per pointer event), from its pixels
// as loaded, so it needs no read back from the screen.
export function makeAlphaMask(width, height, rgba) {
  const alpha = new Uint8Array(width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]
  return { width, height, alpha }
}

// Alpha under (u, v), each 0-1 across the picture. Outside the picture is transparent.
export function alphaAt(mask, u, v) {
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0
  return mask.alpha[Math.floor(v * mask.height) * mask.width + Math.floor(u * mask.width)]
}

// Where the picker gets a mask for a picture: href -> mask, BOUNDS_ALPHA_MASK when a loaded image cannot be read,
// undefined while it has not loaded, or null when it failed to load. Loading/failed sprites take no click; the bounds
// fallback does. The browser installs one (components/maps/alphaMasks.js).
let maskSource = () => undefined
export const setAlphaMaskSource = (source) => {
  maskSource = source
}

// The topmost prop with a drawn pixel under the board point, or null. objects: [{ position, z, depth, spriteSize,
// worldImage, worldTile, ... }] in the order the board was given them. The point is in board (SVG) px, the same space the
// sprite boxes are in, so camera pan and zoom (the viewBox the pointer is converted through) do not enter into it.
export function pickProp(objects, point, { maskOf = (href) => maskSource(href), threshold = ALPHA_PICK_THRESHOLD } = {}) {
  if (!point) return null
  const ordered = drawOrder(objects)
  for (let i = ordered.length - 1; i >= 0; i--) {
    const object = ordered[i]
    const { box } = spriteGeometry(object)
    const u = (point.x - box.x) / box.width
    const v = (point.y - box.y) / box.height
    if (u < 0 || v < 0 || u >= 1 || v >= 1) continue
    // The box is the broad phase. Only an opaque pixel of the art takes the click; a picture that has not loaded yet
    // (or failed) is skipped, so it cannot hide the sprite behind it. An unreadable loaded picture uses its bounds.
    const mask = maskOf(spriteHref(object))
    if (mask === BOUNDS_ALPHA_MASK) return object
    if (mask && alphaAt(mask, u, v) > threshold) return object
  }
  return null
}
