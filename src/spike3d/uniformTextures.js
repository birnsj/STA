/**
 * Division tunic textures for spike3d figures.
 * No mask shader — each Starfleet division has its own pre-coloured albedo PNG.
 * Colours match src/data/adaptation/uniforms.json.
 *
 * Procedural capsules often sample a missing/broken map as black (colour × map).
 * So we always set the material colour to the division hex first; the PNG map is
 * applied only after a successful load (then colour goes white so the texture shows).
 */

import * as THREE from 'three'
import uniformsData from '../data/adaptation/uniforms.json'

const DIVISION_COLOURS = Object.fromEntries(
  (uniformsData.divisions ?? []).map((d) => [d.id, parseHex(d.colour)]),
)

export const UNIFORM_DIVISION_IDS = (uniformsData.divisions ?? []).map((d) => d.id)

export const UNIFORM_TEXTURE_DIR = '/art/models/characters/shared'

/** @returns {number} */
export function parseHex(hexOrString, fallback = 0xc9a227) {
  if (typeof hexOrString === 'number' && Number.isFinite(hexOrString)) return hexOrString >>> 0
  if (typeof hexOrString !== 'string') return fallback
  const raw = hexOrString.replace('#', '')
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw
  const n = parseInt(full, 16)
  return Number.isFinite(n) ? n >>> 0 : fallback
}

export function uniformTextureUrl(divisionId) {
  return `${UNIFORM_TEXTURE_DIR}/uniform-${divisionId}.png`
}

/** Map any hex to nearest division id (command / operations / sciences). */
export function nearestDivisionId(hexOrString) {
  const hex = parseHex(hexOrString)
  const r = (hex >> 16) & 255
  const g = (hex >> 8) & 255
  const b = hex & 255
  let best = UNIFORM_DIVISION_IDS[0] ?? 'command'
  let bestDist = Infinity
  for (const id of UNIFORM_DIVISION_IDS) {
    const c = DIVISION_COLOURS[id] ?? 0
    const dr = r - ((c >> 16) & 255)
    const dg = g - ((c >> 8) & 255)
    const db = b - (c & 255)
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) {
      bestDist = dist
      best = id
    }
  }
  return best
}

export function divisionColour(divisionId) {
  return DIVISION_COLOURS[divisionId] ?? DIVISION_COLOURS.command ?? 0xc9a227
}

const textureCache = new Map()
/** @type {Map<string, Set<{ robe: THREE.Material, robeDk?: THREE.Material }>>} */
const pendingMats = new Map()
let loader = null

function getLoader() {
  if (!loader) loader = new THREE.TextureLoader()
  return loader
}

function darkenHex(hex, factor) {
  const r = ((hex >> 16) & 255) * factor
  const g = ((hex >> 8) & 255) * factor
  const b = (hex & 255) * factor
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}

function paintFlat(robe, robeDk, hex) {
  if (robe) {
    robe.map = null
    robe.color.setHex(hex)
    robe.needsUpdate = true
  }
  if (robeDk) {
    robeDk.map = null
    robeDk.color.setHex(darkenHex(hex, 0.78))
    robeDk.needsUpdate = true
  }
}

function paintMapped(robe, robeDk, map) {
  if (robe) {
    robe.map = map
    robe.color.setHex(0xffffff)
    robe.needsUpdate = true
  }
  if (robeDk) {
    robeDk.map = map
    robeDk.color.setHex(0xc8c8c8)
    robeDk.needsUpdate = true
  }
}

/**
 * Returns a loaded Texture for the division, or null while loading / on failure.
 * Successful loads are cached; callers that need the colour before load use divisionColour().
 */
export function getUniformTexture(divisionId) {
  const id = UNIFORM_DIVISION_IDS.includes(divisionId) ? divisionId : nearestDivisionId(divisionColour(divisionId))
  if (textureCache.has(id)) return textureCache.get(id)
  return null
}

function ensureUniformTexture(divisionId, robe, robeDk) {
  const id = UNIFORM_DIVISION_IDS.includes(divisionId) ? divisionId : nearestDivisionId(divisionColour(divisionId))
  const ready = textureCache.get(id)
  if (ready) {
    paintMapped(robe, robeDk, ready)
    return id
  }

  // Flat division colour until (if) the PNG loads — avoids black (white × empty map).
  paintFlat(robe, robeDk, divisionColour(id))

  if (typeof window === 'undefined') return id

  let waiters = pendingMats.get(id)
  if (!waiters) {
    waiters = new Set()
    pendingMats.set(id, waiters)
    getLoader().load(
      uniformTextureUrl(id),
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = THREE.RepeatWrapping
        tex.wrapT = THREE.RepeatWrapping
        tex.repeat.set(2, 2)
        tex.needsUpdate = true
        textureCache.set(id, tex)
        const mats = pendingMats.get(id)
        pendingMats.delete(id)
        if (mats) for (const pair of mats) paintMapped(pair.robe, pair.robeDk, tex)
      },
      undefined,
      () => {
        pendingMats.delete(id)
        // Keep flat division colour.
      },
    )
  }
  waiters.add({ robe, robeDk })
  return id
}

/** Apply division tunic: flat colour now; coloured PNG map when loaded. */
export function applyUniformTexture(robe, robeDk, hexOrString) {
  if (!robe) return null
  const divisionId = nearestDivisionId(hexOrString)
  return ensureUniformTexture(divisionId, robe, robeDk)
}

/** Flat armour / no tunic map (Klingon). */
export function clearUniformTexture(robe, robeDk, hex, darkHex) {
  paintFlat(robe, robeDk, hex)
  if (robeDk && darkHex != null) {
    robeDk.color.setHex(darkHex)
    robeDk.needsUpdate = true
  }
}
