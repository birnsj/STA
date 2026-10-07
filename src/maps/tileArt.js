// Alternative tile art sets (tileArtSets.json), for comparing new art with the placeholder tiles. The chosen set is a
// browser preference, not map or character data, and is applied to the tile catalogue once at load, so switching reloads.
import catalogue from '../data/adaptation/maps/tileArtSets.json'

const STORAGE_KEY = 'st-adventures.tileArt'
// Stored when the player turns the art sets off, so the default set doesn't come back.
const NO_SET = 'none'

export const TILE_ART_SETS = catalogue.sets

function storedSetId() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

const chosenSetId = storedSetId() ?? catalogue.defaultSet ?? null
export const ACTIVE_TILE_ART = TILE_ART_SETS.find((set) => set.id === chosenSetId) ?? null

export function setTileArt(id) {
  localStorage.setItem(STORAGE_KEY, id ?? NO_SET)
  window.location.reload()
}

// Points the catalogue's image paths at the active set's files where it has them.
export function applyTileArt(tiles) {
  if (!ACTIVE_TILE_ART) return
  const files = new Set(ACTIVE_TILE_ART.files)
  const swap = (image) => {
    const file = image?.split('/').pop()
    return image?.startsWith('/art/tiles/') && files.has(file) ? `${ACTIVE_TILE_ART.folder}${file}` : image
  }
  for (const tile of tiles) {
    for (const field of ['image', 'altImage', 'activeImage']) if (tile[field]) tile[field] = swap(tile[field])
    if (tile.heightVariants) tile.heightVariants = { mid: swap(tile.heightVariants.mid), low: swap(tile.heightVariants.low) }
  }
}

// Whether a tile is currently drawn with the active set's art (its own trim and detail are painted in).
export const usesSetArt = (tile) => Boolean(ACTIVE_TILE_ART && tile.image?.startsWith(ACTIVE_TILE_ART.folder))

// [{ href, style }] light overlays for a tile: the active set's for it, else the tile's own (tiles.json lights), or none.
const NO_ANIMATIONS = []
export const tileAnimations = (tile) =>
  ACTIVE_TILE_ART?.animations?.[tile.id]?.map((item) => ({ href: `${ACTIVE_TILE_ART.folder}${item.file}`, style: item.style })) ??
  tile.lights?.map((item) => ({ href: item.image, style: item.style })) ??
  NO_ANIMATIONS

// A steady pseudo-random number in [0, 1) for a map position, so choices made from it never change between visits.
function positionRandom({ x, y }, seed) {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(seed, 982451653)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// The wall variant drawn at a position ({ href, lights: [{ href, style }] }), or null for the plain wall.
export function wallVariant(tile, position) {
  const set = ACTIVE_TILE_ART?.wallVariants?.[tile.id]
  if (!set || positionRandom(position, 1) >= set.share) return null
  const variant = set.variants[Math.floor(positionRandom(position, 2) * set.variants.length)]
  return {
    href: `${ACTIVE_TILE_ART.folder}${variant.file}`,
    lights: (variant.animations ?? []).map((item) => ({ href: `${ACTIVE_TILE_ART.folder}${item.file}`, style: item.style })),
  }
}

// A steady per-tile offset into an animation, so neighbouring machines are out of step.
export const animationDelay = ({ x, y }) => `${-(((x * 7 + y * 13) % 17) / 17) * 3}s`

export const tileGlow = (tileId) => (ACTIVE_TILE_ART?.effects ? (ACTIVE_TILE_ART.glows?.[tileId] ?? null) : null)
export const tileActiveGlow = (tileId) => (ACTIVE_TILE_ART?.effects ? (ACTIVE_TILE_ART.activeGlows?.[tileId] ?? null) : null)
export const tileEffectsOn = () => Boolean(ACTIVE_TILE_ART?.effects)
