// Live Auto-Paint ruleset catalogue. Seeded from autoPaintRulesets.json; editor updates memory and persists via /__autopaint.
import seed from '../../data/adaptation/maps/autoPaintRulesets.json'
import { TILES } from '../mapFormat.js'
import { resolveAutoPaintTileId } from './templatePalette.js'

export const AUTO_PAINT_ENVIRONMENTS = Object.freeze([
  { id: 'starshipStation', label: 'Starship / Station' },
  { id: 'indoorBuilding', label: 'Indoor Building' },
  { id: 'outdoorSettlement', label: 'Outdoor Settlement' },
  { id: 'naturalTerrain', label: 'Natural Terrain' },
])

// Tile walls only (Template Pieces path retired). Kept for older JSON that still writes wallMode.
export const AUTO_PAINT_WALL_MODES = Object.freeze([{ id: 'tiles', label: 'Wall tiles' }])

const ENV_IDS = new Set(AUTO_PAINT_ENVIRONMENTS.map((entry) => entry.id))
const WALL_MODE_IDS = new Set(AUTO_PAINT_WALL_MODES.map((entry) => entry.id))
// Wall roles may be Template Piece ids (Template 32) or true wall tile ids (bulkhead path).
const WALL_TILE_KEYS = ['straight', 'straightLong', 'corner', 'hull', 'hullLong', 'hullCorner', 'doorFrame']
const REQUIRED_WALL_KEYS = ['straight', 'corner']

const FALLBACK = Object.freeze({
  schemaVersion: 1,
  id: 'template-32',
  label: 'Template 32',
  environment: 'starshipStation',
  wallMode: 'tiles',
  floors: { defaultTile: 'floor', variants: [] },
  walls: {
    straight: 'tplStarshipWall32',
    straightLong: 'tplStarshipWall32PlainLong',
    corner: 'tplStarshipWall32Corner',
    hull: null,
    hullLong: null,
    hullCorner: null,
    doorFrame: null,
    fittings: [],
    fittingChance: 0,
  },
  doors: { underlayTile: 'doorway', minGap: 1, preferOpenings: true },
  props: { enabled: false, rules: [] },
})

const knownTile = (id) => typeof id === 'string' && TILES.some((tile) => tile.id === id)

function clampChance(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

function normalizeTileId(value) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return null
  const id = value.trim()
  return id || null
}

/** Normalize a ruleset without inventing replacement catalogue ids. */
export function resolveAutoPaintRuleset(raw = {}) {
  const base = raw && typeof raw === 'object' ? raw : {}
  const floorsIn = base.floors && typeof base.floors === 'object' ? base.floors : {}
  const wallsIn = base.walls && typeof base.walls === 'object' ? base.walls : {}
  const doorsIn = base.doors && typeof base.doors === 'object' ? base.doors : {}
  const propsIn = base.props && typeof base.props === 'object' ? base.props : {}

  const walls = {
    fittings: Array.isArray(wallsIn.fittings)
      ? wallsIn.fittings.map(normalizeTileId).filter(Boolean)
      : [],
    fittingChance: clampChance(wallsIn.fittingChance, 0),
  }
  for (const key of WALL_TILE_KEYS) {
    walls[key] = normalizeTileId(wallsIn[key])
  }

  const defaultTile =
    typeof floorsIn.defaultTile === 'string' && floorsIn.defaultTile.trim()
      ? floorsIn.defaultTile.trim()
      : FALLBACK.floors.defaultTile

  return {
    schemaVersion: 1,
    id: typeof base.id === 'string' && base.id.trim() ? base.id.trim() : FALLBACK.id,
    label: typeof base.label === 'string' && base.label.trim() ? base.label.trim() : FALLBACK.label,
    environment: ENV_IDS.has(base.environment) ? base.environment : FALLBACK.environment,
    wallMode: WALL_MODE_IDS.has(base.wallMode) ? base.wallMode : FALLBACK.wallMode,
    floors: {
      defaultTile,
      variants: Array.isArray(floorsIn.variants)
        ? floorsIn.variants.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())
        : [],
    },
    walls,
    doors: {
      underlayTile:
        typeof doorsIn.underlayTile === 'string' && doorsIn.underlayTile.trim()
          ? doorsIn.underlayTile.trim()
          : FALLBACK.doors.underlayTile,
      minGap: Number.isFinite(Number(doorsIn.minGap)) ? Math.max(1, Math.floor(Number(doorsIn.minGap))) : 1,
      preferOpenings: doorsIn.preferOpenings !== false,
    },
    props: {
      enabled: Boolean(propsIn.enabled),
      rules: Array.isArray(propsIn.rules) ? propsIn.rules : [],
    },
  }
}

/** Catalogue checks — does not invent ids. */
export function validateAutoPaintRuleset(raw) {
  const ruleset = resolveAutoPaintRuleset(raw)
  const errors = []
  if (!ruleset.walls.straight) errors.push('walls.straight is required')
  if (!ruleset.walls.corner) errors.push('walls.corner is required')
  if (!knownTile(ruleset.floors.defaultTile)) {
    errors.push(`floors.defaultTile: unknown tile “${ruleset.floors.defaultTile}”`)
  }
  for (const id of ruleset.floors.variants) {
    if (!knownTile(id)) errors.push(`floors.variants: unknown tile “${id}”`)
  }
  for (const key of WALL_TILE_KEYS) {
    const id = ruleset.walls[key]
    if (!id) {
      if (REQUIRED_WALL_KEYS.includes(key)) errors.push(`walls.${key} is required`)
      continue
    }
    if (!resolveAutoPaintTileId(id)) errors.push(`walls.${key}: unknown tile/Template Piece “${id}”`)
  }
  for (const id of ruleset.walls.fittings) {
    if (!resolveAutoPaintTileId(id)) errors.push(`walls.fittings: unknown tile/Template Piece “${id}”`)
  }
  if (!resolveAutoPaintTileId(ruleset.doors.underlayTile) && !knownTile(ruleset.doors.underlayTile)) {
    errors.push(`doors.underlayTile: unknown tile “${ruleset.doors.underlayTile}”`)
  }
  return { ok: errors.length === 0, errors, ruleset }
}

function loadSeed() {
  const list = Array.isArray(seed?.rulesets) ? seed.rulesets : []
  const resolved = []
  for (const entry of list) {
    const { ok, errors, ruleset } = validateAutoPaintRuleset(entry)
    if (!ok) {
      console.warn(`[autoPaint] ruleset “${entry?.id ?? '?'}” has catalogue errors:`, errors.join('; '))
    }
    for (const key of REQUIRED_WALL_KEYS) {
      if (!ruleset.walls[key]) ruleset.walls[key] = FALLBACK.walls[key]
    }
    resolved.push(ruleset)
  }
  return resolved.length ? resolved : [resolveAutoPaintRuleset(FALLBACK)]
}

let rulesets = loadSeed()
let catalogueEpoch = 0

export const autoPaintRulesetEpochOf = () => catalogueEpoch

export function listAutoPaintRulesets() {
  return rulesets.map((entry) => ({
    ...entry,
    floors: { ...entry.floors, variants: [...entry.floors.variants] },
    walls: { ...entry.walls, fittings: [...entry.walls.fittings] },
    doors: { ...entry.doors },
    props: { ...entry.props, rules: [...entry.props.rules] },
  }))
}

export function getAutoPaintRuleset(id) {
  const found = rulesets.find((entry) => entry.id === id)
  return found ? listAutoPaintRulesets().find((entry) => entry.id === id) : listAutoPaintRulesets()[0]
}

export function defaultAutoPaintRulesetId() {
  return rulesets[0]?.id ?? FALLBACK.id
}

export function putAutoPaintRulesetLocal(raw) {
  const { ok, errors, ruleset } = validateAutoPaintRuleset(raw)
  if (!ok) throw new Error(`Invalid Auto-Paint ruleset: ${errors.join('; ')}`)
  const index = rulesets.findIndex((entry) => entry.id === ruleset.id)
  if (index >= 0) rulesets = rulesets.map((entry, i) => (i === index ? ruleset : entry))
  else rulesets = [...rulesets, ruleset]
  catalogueEpoch += 1
  return getAutoPaintRuleset(ruleset.id)
}

export function removeAutoPaintRulesetLocal(id) {
  const before = rulesets.length
  rulesets = rulesets.filter((entry) => entry.id !== id)
  if (!rulesets.length) rulesets = [resolveAutoPaintRuleset(FALLBACK)]
  if (rulesets.length !== before) catalogueEpoch += 1
  return { id, removed: before !== rulesets.length }
}

export function replaceAutoPaintRulesetsLocal(list) {
  const next = []
  for (const entry of Array.isArray(list) ? list : []) {
    const { ok, errors, ruleset } = validateAutoPaintRuleset(entry)
    if (!ok) throw new Error(`Invalid Auto-Paint ruleset “${entry?.id ?? '?'}”: ${errors.join('; ')}`)
    next.push(ruleset)
  }
  rulesets = next.length ? next : [resolveAutoPaintRuleset(FALLBACK)]
  catalogueEpoch += 1
  return listAutoPaintRulesets()
}
