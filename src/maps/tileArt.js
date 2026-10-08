// Tile lighting effects (tileEffects.json): glows, flipbook animations and wall variants. Presentation only.
import effects from '../data/adaptation/maps/tileEffects.json'
import { getTile, imageSize } from './mapFormat.js'

// A flipbook: a tile's animation (tileEffects.json animations) for one of its images, as { id, loop, frameTime,
// frames, sprites }. sprites: [{ href, emission }], whole images of the tile, one per image index; frames: the image
// index shown in each frameTime-second step of the loop. emission: the sprite's lit parts alone, kept at full
// brightness in a dark map (null on floors). id: the animation's tile id (its CSS keyframes, flipbookStyles.js).
const flipbooks = new Map()
function flipbook(id, variant, pick) {
  const key = `${id}|${variant}`
  if (!flipbooks.has(key)) {
    const animation = effects.animations[id]
    const sprites = animation?.images.map(pick)
    flipbooks.set(
      key,
      sprites?.every((sprite) => sprite.href)
        ? { id, loop: animation.frames.length * animation.frameTime, frameTime: animation.frameTime, frames: animation.frames, sprites }
        : null,
    )
  }
  return flipbooks.get(key)
}
const isActiveOnly = (tile) => Boolean(effects.animations[tile.id]?.active)

// The tile's own image animated (the size of its image), or null.
export const tileFlipbook = (tile) => (isActiveOnly(tile) ? null : flipbook(tile.id, 'image', (item) => ({ href: item.image, emission: item.emission ?? null })))
// The tile animated while it is active (a live hazard), or null.
export const activeFlipbook = (tile) => (isActiveOnly(tile) ? flipbook(tile.id, 'active', (item) => ({ href: item.image, emission: item.emission ?? null })) : null)
// A big object's 2x2 image animated (tiles.json big), or null.
export const bigFlipbook = (tile) => flipbook(tile.id, 'big', (item) => ({ href: item.bigImage, emission: item.bigEmission ?? null }))
// A wall's two-tile panel image along axis animated (tiles.json panelImages), or null.
export const panelFlipbook = (tile, axis) =>
  flipbook(tile.id, `panel.${axis}`, (item) => ({ href: item.panel?.[axis], emission: item.panelEmission?.[axis] ?? null }))

// The image index a flipbook shows `seconds` into its loop.
export const frameAt = (book, seconds) => book.frames[Math.floor((((seconds % book.loop) + book.loop) % book.loop) / book.frameTime) % book.frames.length]

// Every animation, for building their CSS keyframes: [{ id, frames }].
export const allAnimations = () => Object.entries(effects.animations).map(([id, animation]) => ({ id, frames: animation.frames }))

// A steady pseudo-random number in [0, 1) for a map position, so choices made from it never change between visits.
function positionRandom({ x, y }, seed) {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(seed, 982451653)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// The wall variant drawn at a position ({ href }, the size of the wall's own image), or null for the plain wall.
export function wallVariant(tile, position) {
  const set = effects.wallVariants[tile.id]
  if (!set || positionRandom(position, 1) >= set.share) return null
  const variant = set.variants[Math.floor(positionRandom(position, 2) * set.variants.length)]
  return { href: variant.image }
}

// Two-tile panel art (tiles.json panelImages): one image per direction a panel runs, with both tiles standing side by
// side, 32 wider and 16 taller than the wall's own image (mapFormat.js imageSize). Each tile draws its own slot of it,
// the size of its own image, PANEL_OFFSETS[axis][half] from the image's top left (scripts/v2/panels.mjs draws them to
// match).
const PANEL_OFFSETS = {
  x: [{ x: 0, y: 0 }, { x: 32, y: 16 }],
  y: [{ x: 32, y: 0 }, { x: 0, y: 16 }],
}

// The panel art a wall tile draws ({ href, flipbook, size, offset, timing }), or null for its own image: window walls
// show it on window panels, long wall fittings (panelFitting) on every panel. flipbook: the panel image animated, or
// null. size: the panel image's. timing: the panel's first tile, so both halves animate together.
export function panelArt(tile, panel, position) {
  if (!panel || !tile.panelImages || !(tile.panelFitting || panel.window)) return null
  const { axis, half } = panel
  const slot = imageSize(tile)
  return {
    href: tile.panelImages[axis],
    flipbook: panelFlipbook(tile, axis),
    size: { width: slot.width + 32, height: slot.height + 16 },
    offset: PANEL_OFFSETS[axis][half],
    timing: half === 0 ? position : axis === 'x' ? { x: position.x - 1, y: position.y } : { x: position.x, y: position.y - 1 },
  }
}

// A steady per-tile offset into an animation (seconds), so neighbouring machines are out of step.
export const animationOffset = ({ x, y }) => (((x * 7 + y * 13) % 17) / 17) * 3
export const animationDelay = (position) => `${-animationOffset(position)}s`

export const tileGlow = (tileId) => effects.glows[tileId] ?? null

// A wall fitting's pool is smaller than a glowing block's (1.5 tiles across each way), so it lights its own wall's floor.
export const WALL_GLOW_SIZE = 1.1

// A lit wall fitting's light pool ({ colour, centre }), or null: it sits half a tile out from the wall over the open
// floor its fitting faces (+y, else +x; the faces the map views draw).
export function wallGlow(map, { x, y }) {
  const colour = effects.wallGlows?.[map.tiles[y][x]]
  if (!colour) return null
  const open = (px, py) => px >= 0 && py >= 0 && px < map.width && py < map.height && !getTile(map.tiles[py][px]).solid
  if (open(x, y + 1)) return { colour, centre: { x, y: y + 0.5 } }
  if (open(x + 1, y)) return { colour, centre: { x: x + 0.5, y } }
  return null
}
export const tileActiveGlow = (tileId) => effects.activeGlows[tileId] ?? null
