// Tile lighting effects (tileEffects.json): glows, flipbook animations and wall variants. Presentation only.
import effects from '../data/adaptation/maps/tileEffects.json'
import { FULL_LIGHT, getTile, imageSize } from './mapFormat.js'
import { TILE_H } from './iso.js'
import { getWallPanels } from './wallPanels.js'

// A flipbook: a tile's animation (tileEffects.json animations) for one of its images, as { id, loop, frameTime,
// frames, sprites, overlay }. sprites: [{ href, emission }], whole images of the tile, one per image index; frames: the
// image index shown in each frameTime-second step of the loop. emission: the sprite's lit parts alone, kept at full
// brightness in a dark map (null on floors). id: the animation's tile id.
// overlay (walls): the sprites are the lights alone (their emission images), drawn over the tile's own image.
const flipbooks = new Map()
function flipbook(id, variant, pick) {
  const key = `${id}|${variant}`
  if (!flipbooks.has(key)) {
    const animation = effects.animations[id]
    const overlay = Boolean(animation?.overlay)
    const sprites = animation?.images.map(pick).map((sprite) => (overlay ? { href: sprite.emission, emission: sprite.emission } : sprite))
    flipbooks.set(
      key,
      sprites?.every((sprite) => sprite.href)
        ? { id, loop: animation.frames.length * animation.frameTime, frameTime: animation.frameTime, frames: animation.frames, sprites, overlay }
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

// An overlay's lights are drawn emissive (designer request 2026-10-11): once as they are, once added over themselves to
// brighten them, and once blurred by OVERLAY_GLOW_BLUR world px and added, a soft halo. OVERLAY_GLOW_SPREAD: how far
// (world px) the halo reaches past the lights, for repainting. Per-tile strength: animations[id].emissive (0–2, default 1),
// edited from the map editor Selection panel. Optional emitColour (Selection Colour) tints only the soft ground
// spill in darkness; the overlay sprite keeps its emission PNG colours.
export const OVERLAY_GLOW_BLUR = 2
export const OVERLAY_GLOW_SPREAD = 3 * OVERLAY_GLOW_BLUR
export const OVERLAY_EMISSIVE_MIN = 0
export const OVERLAY_EMISSIVE_MAX = 2
export const OVERLAY_EMISSIVE_DEFAULT = 1

let emissiveEpoch = 0
export const emissiveEpochOf = () => emissiveEpoch

export function clampOverlayEmissive(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return OVERLAY_EMISSIVE_DEFAULT
  return Math.min(OVERLAY_EMISSIVE_MAX, Math.max(OVERLAY_EMISSIVE_MIN, Math.round(n * 10) / 10))
}

// Live strength for ground spill (and overlay sprite glow when overlay). Default 1. Any animation may store emissive.
export function overlayEmissive(tileId) {
  const anim = effects.animations?.[tileId]
  if (!anim) return OVERLAY_EMISSIVE_DEFAULT
  return clampOverlayEmissive(anim.emissive ?? OVERLAY_EMISSIVE_DEFAULT)
}

// Ground-spill tint from animations[id].emitColour. Null: use glows/wallGlows colour when present, else hole only.
export function overlayEmitColour(tileId) {
  const colour = effects.animations?.[tileId]?.emitColour
  return isGlowColour(colour) ? colour.toLowerCase() : null
}

// Ground spill colour: emitColour, else the tile's glow / wallGlow entry.
export function groundEmitColour(tileId) {
  return overlayEmitColour(tileId) || resolveGlow(effects.glows?.[tileId])?.colour || resolveGlow(effects.wallGlows?.[tileId])?.colour || null
}

// Updates the loaded catalogue so the board redraws without a reload. Bumps emissiveEpoch to invalidate Pixi textures.
export function setOverlayEmissiveLocal(tileId, value) {
  const anim = effects.animations?.[tileId]
  if (!anim) throw new Error(`No animation for ${tileId}`)
  const prev = clampOverlayEmissive(anim.emissive ?? OVERLAY_EMISSIVE_DEFAULT)
  const next = clampOverlayEmissive(value)
  if (next === OVERLAY_EMISSIVE_DEFAULT) delete anim.emissive
  else anim.emissive = next
  if (prev !== next) emissiveEpoch += 1
  return next
}

// Sets or clears (null) the ground-spill tint. Bumps emissiveEpoch when it changes.
export function setOverlayEmitColourLocal(tileId, colour) {
  const anim = effects.animations?.[tileId]
  if (!anim) throw new Error(`No animation for ${tileId}`)
  const prev = overlayEmitColour(tileId)
  const next = colour == null || colour === '' ? null : isGlowColour(colour) ? colour.toLowerCase() : null
  if (colour != null && colour !== '' && !next) throw new Error('colour must be #rgb or #rrggbb')
  if (next) anim.emitColour = next
  else delete anim.emitColour
  if (prev !== next) emissiveEpoch += 1
  return next
}

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

export const GLOW_BRIGHTNESS_MIN = 0
export const GLOW_BRIGHTNESS_MAX = 2
export const GLOW_BRIGHTNESS_DEFAULT = 1

let effectsEpoch = 0
export const effectsEpochOf = () => effectsEpoch
const bumpEffectsEpoch = () => {
  effectsEpoch += 1
}

// wallGlows / glows entry: "#rrggbb" or { colour, brightness (0–2, default 1) }.
export function resolveGlow(entry) {
  if (!entry) return null
  if (typeof entry === 'string') return { colour: entry, brightness: GLOW_BRIGHTNESS_DEFAULT }
  if (typeof entry === 'object' && typeof entry.colour === 'string') {
    return { colour: entry.colour, brightness: clampGlowBrightness(entry.brightness ?? GLOW_BRIGHTNESS_DEFAULT) }
  }
  return null
}

export function clampGlowBrightness(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return GLOW_BRIGHTNESS_DEFAULT
  return Math.min(GLOW_BRIGHTNESS_MAX, Math.max(GLOW_BRIGHTNESS_MIN, Math.round(n * 10) / 10))
}

// Which light-pool table a tile uses in tileEffects.json, if any.
export function glowKindOf(tileId) {
  if (effects.wallGlows?.[tileId] != null) return 'wall'
  if (effects.glows?.[tileId] != null) return 'glow'
  if (effects.activeGlows?.[tileId] != null) return 'active'
  return null
}

export function glowSpec(tileId) {
  const kind = glowKindOf(tileId)
  if (!kind) return null
  const table = kind === 'wall' ? effects.wallGlows : kind === 'glow' ? effects.glows : effects.activeGlows
  const resolved = resolveGlow(table[tileId])
  return resolved ? { ...resolved, kind } : null
}

// Colour string for callers that only need a tint (null when the tile has no pool).
export const tileGlow = (tileId) => resolveGlow(effects.glows[tileId])?.colour ?? null

// Floor or active glow pool spec (not wall fittings).
export function floorGlowSpec(tileId) {
  return resolveGlow(effects.glows?.[tileId]) || resolveGlow(effects.activeGlows?.[tileId])
}

// A wall fitting's pool is smaller than a glowing block's (1.5 tiles across each way), so it lights its own wall's floor.
export const WALL_GLOW_SIZE = 1.1

// A lit wall fitting's light pool ({ colour, brightness, centre }), or null: it sits half a tile out from the wall over
// the open floor its fitting faces (+y, else +x; the faces the map views draw).
export function wallGlow(map, { x, y }) {
  const spec = resolveGlow(effects.wallGlows?.[map.tiles[y][x]])
  if (!spec) return null
  const open = (px, py) => px >= 0 && py >= 0 && px < map.width && py < map.height && !getTile(map.tiles[py][px]).solid
  if (open(x, y + 1)) return { colour: spec.colour, brightness: spec.brightness, centre: { x, y: y + 0.5 } }
  if (open(x + 1, y)) return { colour: spec.colour, brightness: spec.brightness, centre: { x: x + 0.5, y } }
  return null
}
export const tileActiveGlow = (tileId) => resolveGlow(effects.activeGlows[tileId])?.colour ?? null

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
export function isGlowColour(value) {
  return typeof value === 'string' && HEX.test(value)
}

// Live-edit a tile's light pool (colour / brightness). kind: 'wall' | 'glow' | 'active'. Creates the entry when missing.
export function setTileGlowLocal(tileId, { colour, brightness } = {}, kind = null) {
  const resolvedKind = kind || glowKindOf(tileId) || (effects.animations?.[tileId]?.overlay ? 'wall' : 'glow')
  const tableName = resolvedKind === 'wall' ? 'wallGlows' : resolvedKind === 'active' ? 'activeGlows' : 'glows'
  if (!effects[tableName]) effects[tableName] = {}
  const table = effects[tableName]
  const prev = resolveGlow(table[tileId]) || { colour: '#ffffff', brightness: GLOW_BRIGHTNESS_DEFAULT }
  const nextColour = colour != null ? colour : prev.colour
  if (!isGlowColour(nextColour)) throw new Error('colour must be #rgb or #rrggbb')
  const nextBright = brightness != null ? clampGlowBrightness(brightness) : prev.brightness
  if (nextBright === GLOW_BRIGHTNESS_DEFAULT) table[tileId] = nextColour
  else table[tileId] = { colour: nextColour, brightness: nextBright }
  if (prev.colour !== nextColour || prev.brightness !== nextBright) bumpEffectsEpoch()
  return { id: tileId, kind: resolvedKind, colour: nextColour, brightness: nextBright }
}

// Darkness over a dim map (mapFormat.js ambient): how opaque it is (0 in full light). Pitch dark (0) still leaves the map
// faintly visible, so units can be found.
const MAX_DARKNESS = 0.9
export const DARKNESS_COLOUR = '#02040a'
// How far past the map the darkness reaches (world px), so it covers the tallest tiles standing on the back rows.
export const DARK_MARGIN = 200
export const darknessOpacity = (map) => Math.max(0, 1 - (map.ambient ?? FULL_LIGHT) / FULL_LIGHT) * MAX_DARKNESS
export const darknessColour = (map) => map.ambientColour || DARKNESS_COLOUR

// Soft hole on the floor in front of a window panel (axis x → +y face; axis y → +x face). One hole per panel (half 0).
// Radius and cut strength follow overlay emissive (0 = no spill).
function windowFloorLight(map, tileKey, panel) {
  if (!panel.window || panel.half !== 0) return null
  const [x, y] = tileKey.split(',').map(Number)
  const tileId = map.tiles[y][x]
  if (!effects.animations?.[tileId]?.overlay) return null
  const emissive = overlayEmissive(tileId)
  if (!(emissive > 0)) return null
  const open = (px, py) => px >= 0 && py >= 0 && px < map.width && py < map.height && !getTile(map.tiles[py][px]).solid
  const radius = 2 * emissive
  const strength = Math.min(1, emissive)
  const colour = groundEmitColour(tileId)
  if (panel.axis === 'x') {
    if (!open(x, y + 1) && !open(x + 1, y + 1)) return null
    return { position: { x: x + 0.5, y: y + 0.5 }, radius, lift: TILE_H / 2, strength, colour }
  }
  if (!open(x + 1, y) && !open(x + 1, y + 1)) return null
  return { position: { x: x + 0.5, y: y + 0.5 }, radius, lift: TILE_H / 2, strength, colour }
}

// Soft holes lights cut in the darkness: glowing tiles, wall variants, lit fittings, and window panels (floor spill).
// strength (0–1) scales how hard the hole cuts; colour optional for a soft tinted spill. Cache includes emissiveEpoch
// so the Selection emissive slider updates world lighting.
const darkLights = new WeakMap()
export function darknessLights(map) {
  const cached = darkLights.get(map)
  const epoch = `${effectsEpoch}|${emissiveEpoch}`
  if (cached && cached.epoch === epoch) return cached.lights
  const lights = []
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      const position = { x, y }
      const tile = getTile(id)
      if (tileGlow(id)) {
        const emissive = overlayEmissive(id)
        if (emissive > 0) {
          lights.push({
            position,
            radius: 2.6 * emissive,
            lift: 0,
            strength: Math.min(1, emissive),
            colour: groundEmitColour(id),
            floorOnly: true,
          })
        }
      } else if (tile.height > 0 && wallVariant(tile, position)) lights.push({ position, radius: 1.5, lift: TILE_H, strength: 1 })
      const fitting = wallGlow(map, position)
      if (fitting) {
        const emissive = effects.animations?.[id] ? overlayEmissive(id) : 1
        if (emissive > 0) {
          lights.push({
            position: fitting.centre,
            radius: 1.8 * emissive,
            lift: TILE_H / 2,
            strength: Math.min(1, emissive),
            colour: groundEmitColour(id) || fitting.colour,
          })
        }
      }
    }),
  )
  for (const [tileKey, panel] of getWallPanels(map)) {
    const hole = windowFloorLight(map, tileKey, panel)
    if (hole) lights.push(hole)
  }
  darkLights.set(map, { epoch, lights })
  return lights
}
