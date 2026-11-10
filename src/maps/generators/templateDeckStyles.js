// Live Template Deck Generate Map style (underlay tiles + Template Piece wall kit).
// Seeded from templateDeckStyle.json; Generator Editor updates memory and persists via /__template-deck-style.
import seed from '../../data/adaptation/maps/templateDeckStyle.json'
import { FLOOR_TILE, TILES } from '../mapFormat.js'
import { getTemplatePiece } from '../templatePieces.js'
import { CRATE_TILE, DOOR_TILE, MACHINERY_TILE } from './shared.js'

export const TEMPLATE_DECK_ID = 'templateDeck'
export const TEMPLATE_DECK_LABEL = 'Template Deck'

const TILE_KEYS = ['floor', 'door', 'crate', 'machinery']
const PIECE_KEYS = ['straight', 'straightLong', 'corner', 'hull', 'hullLong', 'hullCorner', 'doorFrame']

const FALLBACK = Object.freeze({
  floor: FLOOR_TILE,
  door: DOOR_TILE,
  crate: CRATE_TILE,
  machinery: MACHINERY_TILE,
  hazard: true,
  straight: 'tplStarshipWall32',
  straightLong: 'tplStarshipWall32PlainLong',
  corner: 'tplStarshipWall32Corner',
  hull: 'tplStarshipHull32',
  hullLong: 'tplStarshipHull32Long',
  hullCorner: 'tplStarshipHull32Corner',
  doorFrame: 'tplStarshipDoorFrame',
  fittings: [
    'tplStarshipWall32Window',
    'tplStarshipWall32Lcars',
    'tplStarshipWall32Conduit',
    'tplStarshipWall32Hatch',
    'tplStarshipWall32Computer',
  ],
  fittingChance: 0.28,
})

const knownTile = (id) => typeof id === 'string' && TILES.some((tile) => tile.id === id)
const knownPiece = (id) => typeof id === 'string' && Boolean(getTemplatePiece(id))

function clampChance(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

function resolveFittings(raw, fallback) {
  const list = Array.isArray(raw) ? raw : fallback
  const next = list.filter(knownPiece)
  return next.length ? [...new Set(next)] : [...fallback]
}

export function resolveTemplateDeckStyle(raw = {}) {
  const resolved = {
    hazard: typeof raw.hazard === 'boolean' ? raw.hazard : FALLBACK.hazard,
    fittingChance: clampChance(raw.fittingChance, FALLBACK.fittingChance),
    fittings: resolveFittings(raw.fittings, FALLBACK.fittings),
  }
  for (const key of TILE_KEYS) {
    resolved[key] = knownTile(raw[key]) ? raw[key] : FALLBACK[key]
  }
  for (const key of PIECE_KEYS) {
    resolved[key] = knownPiece(raw[key]) ? raw[key] : FALLBACK[key]
  }
  return resolved
}

let style = resolveTemplateDeckStyle(seed)

export function getTemplateDeckStyle() {
  return { ...style, fittings: [...style.fittings] }
}

export function setTemplateDeckStyleLocal(patch) {
  style = resolveTemplateDeckStyle({ ...style, ...(patch && typeof patch === 'object' ? patch : {}) })
  return getTemplateDeckStyle()
}

export function replaceTemplateDeckStyleLocal(next) {
  style = resolveTemplateDeckStyle(next && typeof next === 'object' ? next : {})
  return getTemplateDeckStyle()
}

export function templateDeckStyleSnapshot() {
  return getTemplateDeckStyle()
}

export function templateDeckStyleEqual(a, b) {
  if (!a || !b) return false
  if (Boolean(a.hazard) !== Boolean(b.hazard)) return false
  if (clampChance(a.fittingChance, -1) !== clampChance(b.fittingChance, -2)) return false
  for (const key of TILE_KEYS) if (a[key] !== b[key]) return false
  for (const key of PIECE_KEYS) if (a[key] !== b[key]) return false
  const af = [...(a.fittings ?? [])].sort()
  const bf = [...(b.fittings ?? [])].sort()
  if (af.length !== bf.length) return false
  return af.every((id, index) => id === bf[index])
}
