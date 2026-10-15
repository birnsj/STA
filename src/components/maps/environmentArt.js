// Where the hazard and explosion flipbooks live and how they are cut (art from scripts/makeHazardArt.mjs): each is one
// horizontal strip of equal frames.
import { TILE_W } from '../../maps/iso.js'

export const HAZARD_FRAMES = 8
export const HAZARD_FRAME = { width: TILE_W, height: 64 }
export const hazardStrip = (type) => `/art/sprites/environment/hazards/${type}.png`

export const EXPLOSION_FRAMES = 8
export const EXPLOSION_SIZES = { small: 128, large: 192 }
export const explosionSize = (radius) => (radius >= 2 ? 'large' : 'small')
export const explosionStrip = (size) => `/art/sprites/effects/explosion-${size}.png`
