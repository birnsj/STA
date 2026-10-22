// Live deck Generate Map styles (floor / wall / door / crate / machinery / hazard) for the three pure
// makeDeckGenerator Locations. Seeded from deckGenerators.json; Dev Edit can update the in-memory copy
// and persist via /__deck-generators. Invalid tile ids fall back to baked defaults.
import seed from '../../data/adaptation/maps/deckGenerators.json'
import { FLOOR_TILE, TILES, WALL_TILE } from '../mapFormat.js'
import { CRATE_TILE, DOOR_TILE, MACHINERY_TILE } from './shared.js'

export const DECK_GENERATOR_IDS = ['starshipDeck', 'laboratory', 'alienVessel']

export const DECK_GENERATOR_META = [
  { id: 'starshipDeck', label: 'Starship Deck' },
  { id: 'laboratory', label: 'Research Lab' },
  { id: 'alienVessel', label: 'Alien Vessel' },
]

const FALLBACK = {
  starshipDeck: {
    floor: FLOOR_TILE,
    wall: WALL_TILE,
    corner: null,
    door: DOOR_TILE,
    crate: CRATE_TILE,
    machinery: MACHINERY_TILE,
    hazard: true,
  },
  laboratory: {
    floor: 'labFloor',
    wall: 'labWall',
    corner: null,
    door: DOOR_TILE,
    crate: 'labBench',
    machinery: 'containmentPod',
    hazard: true,
  },
  alienVessel: {
    floor: 'alienDeck',
    wall: 'alienBulkhead',
    corner: null,
    door: DOOR_TILE,
    crate: 'bioPod',
    machinery: 'alienConsole',
    hazard: false,
  },
}

const TILE_KEYS = ['floor', 'wall', 'door', 'crate', 'machinery']
const knownTile = (id) => typeof id === 'string' && TILES.some((tile) => tile.id === id)
const optionalTile = (id) => (id == null || id === '' ? null : knownTile(id) ? id : null)

function cloneStyles(source) {
  const next = {}
  for (const id of DECK_GENERATOR_IDS) {
    next[id] = { ...(source?.[id] ?? {}) }
  }
  return next
}

let styles = cloneStyles(seed)

export function isDeckGeneratorId(id) {
  return DECK_GENERATOR_IDS.includes(id)
}

// Resolved style safe for makeDeckGenerator (unknown tiles / missing keys use FALLBACK).
export function getDeckStyle(id) {
  const key = isDeckGeneratorId(id) ? id : 'starshipDeck'
  const base = FALLBACK[key]
  const raw = styles[key] ?? {}
  const resolved = {
    hazard: typeof raw.hazard === 'boolean' ? raw.hazard : base.hazard,
    corner: 'corner' in raw ? optionalTile(raw.corner) : base.corner,
  }
  for (const field of TILE_KEYS) {
    resolved[field] = knownTile(raw[field]) ? raw[field] : base[field]
  }
  return resolved
}

export function listDeckStyles() {
  return DECK_GENERATOR_META.map(({ id, label }) => ({ id, label, style: getDeckStyle(id) }))
}

// Apply a full or partial style for one id in memory. Returns the resolved style.
export function setDeckStyleLocal(id, patch) {
  if (!isDeckGeneratorId(id)) throw new Error(`Unknown deck generator ${id}`)
  const merged = { ...getDeckStyle(id), ...(patch && typeof patch === 'object' ? patch : {}) }
  styles[id] = {
    floor: merged.floor,
    wall: merged.wall,
    corner: optionalTile(merged.corner),
    door: merged.door,
    crate: merged.crate,
    machinery: merged.machinery,
    hazard: Boolean(merged.hazard),
  }
  return getDeckStyle(id)
}

// Replace all styles from a JSON object (e.g. after load). Unknown ids ignored.
export function replaceDeckStylesLocal(next) {
  styles = cloneStyles(next)
  return listDeckStyles()
}

// Snapshot suitable for writing deckGenerators.json.
export function deckStylesSnapshot() {
  const out = {}
  for (const id of DECK_GENERATOR_IDS) {
    out[id] = { ...getDeckStyle(id) }
  }
  return out
}
