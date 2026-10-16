// Where the hazard and explosion flipbooks live and how they are cut (art from scripts/makeHazardArt.mjs): each is one
// horizontal strip of equal frames.
import { TILE_W } from '../../maps/iso.js'

export const HAZARD_FRAMES = 8
export const HAZARD_FRAME = { width: TILE_W, height: 64 }
export const hazardStrip = (type) => `/art/sprites/environment/hazards/${type}.png`
// Torso-framed strips for the figure overlay (scripts/makeHazardArt.mjs); floor boards keep hazardStrip.
export const CHARACTER_HAZARD_FRAME = { width: 48, height: 64 }
// ?v= busts a stale browser / loadImage cache after regenerating the torso strips.
export const characterHazardStrip = (type) => `/art/sprites/environment/hazards/character/${type}.png?v=5`

// Figure overlay art only — never the floor diamond strip (HazardLayer uses hazardStrip). Pure helper for draw + tests.
export function characterHazardOverlayLook(type) {
  if (!type) return null
  return { href: characterHazardStrip(type), frame: CHARACTER_HAZARD_FRAME }
}

export const EXPLOSION_FRAMES = 8
// Source strips (scripts/makeHazardArt.mjs): design frame size before resolution; pick large when the blast is bigger.
export const EXPLOSION_STRIP_PX = { small: 128, large: 256 }
// Which strip to sample: large for radius 2+ so a scaled-up blast stays sharper.
export const explosionSize = (radius) => (radius >= 2 ? 'large' : 'small')
// ?v= busts a stale browser / loadImage cache after regenerating the strips (black-quad bug, 2026-10-15).
export const explosionStrip = (size) => `/art/sprites/effects/explosion-${size}.png?v=3`
// On-board draw size: almost the Chebyshev blast footprint (tile width × (2r+1) on the iso horizontal).
// Radius is tiles from the object's centre; 0.9 keeps the glow just inside the damage edge.
export const explosionDisplayPx = (radius) => Math.round(TILE_W * (2 * Math.max(0, radius ?? 0) + 1) * 0.9)
