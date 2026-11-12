// Live Auto-Paint ruleset catalogue. Seeded from autoPaintRulesets.json; editor updates memory and persists via /__autopaint.
// Wall / floor / door roles are weighted lists [{ id, weight }]; legacy strings load as equal weights.
import seed from '../../data/adaptation/maps/autoPaintRulesets.json'
import { TILES } from '../mapFormat.js'
import { getTemplatePiece } from '../templatePieces.js'
import {
  normalizeWeightedEntries,
  primaryId,
  serializeWeighted,
  weightedIds,
} from '../generators/weightedChoice.js'
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
const knownRole = (id) => Boolean(resolveAutoPaintTileId(id) || getTemplatePiece(id))
// Floors may store a tile id or a Template Piece that resolves to a floor tile (palette drops).
const knownFloorRole = (id) => {
  if (!id || typeof id !== 'string') return false
  if (knownTile(id)) return true
  const resolved = resolveAutoPaintTileId(id)
  return Boolean(resolved && knownTile(resolved))
}

function clampChance(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

// Keep unknown ids so validateAutoPaintRuleset can report them (do not invent replacements).
const anyId = (id) => typeof id === 'string' && Boolean(id.trim())

function roleList(raw, { required = false, fallback = null, known = anyId } = {}) {
  const list = normalizeWeightedEntries(raw, {
    known,
    allowEmpty: true,
    fallback: null,
  })
  if (required && !list.length && fallback != null) {
    return normalizeWeightedEntries(fallback, { known: anyId, allowEmpty: true })
  }
  return list
}

function optionalRole(raw) {
  const list = roleList(raw, { required: false })
  return list.length ? list : null
}

/** Normalize a ruleset without inventing replacement catalogue ids. */
export function resolveAutoPaintRuleset(raw = {}) {
  const base = raw && typeof raw === 'object' ? raw : {}
  const floorsIn = base.floors && typeof base.floors === 'object' ? base.floors : {}
  const wallsIn = base.walls && typeof base.walls === 'object' ? base.walls : {}
  const doorsIn = base.doors && typeof base.doors === 'object' ? base.doors : {}
  const propsIn = base.props && typeof base.props === 'object' ? base.props : {}

  const walls = {
    fittings: roleList(wallsIn.fittings, { required: false }),
    fittingChance: clampChance(wallsIn.fittingChance, 0),
  }
  for (const key of WALL_TILE_KEYS) {
    const required = REQUIRED_WALL_KEYS.includes(key)
    walls[key] = required
      ? roleList(wallsIn[key], { required: true, fallback: FALLBACK.walls[key] })
      : optionalRole(wallsIn[key])
  }

  const defaultTile = roleList(floorsIn.defaultTile, {
    required: true,
    fallback: FALLBACK.floors.defaultTile,
  })

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
      underlayTile: roleList(doorsIn.underlayTile, {
        required: true,
        fallback: FALLBACK.doors.underlayTile,
      }),
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
  if (!primaryId(ruleset.walls.straight)) errors.push('walls.straight is required')
  if (!primaryId(ruleset.walls.corner)) errors.push('walls.corner is required')
  for (const id of weightedIds(ruleset.floors.defaultTile)) {
    if (!knownFloorRole(id)) errors.push(`floors.defaultTile: unknown tile “${id}”`)
  }
  for (const id of ruleset.floors.variants) {
    if (!knownTile(id)) errors.push(`floors.variants: unknown tile “${id}”`)
  }
  for (const key of WALL_TILE_KEYS) {
    const ids = weightedIds(ruleset.walls[key])
    if (!ids.length) {
      if (REQUIRED_WALL_KEYS.includes(key)) errors.push(`walls.${key} is required`)
      continue
    }
    for (const id of ids) {
      if (!knownRole(id)) errors.push(`walls.${key}: unknown tile/Template Piece “${id}”`)
    }
  }
  for (const id of weightedIds(ruleset.walls.fittings)) {
    if (!knownRole(id)) errors.push(`walls.fittings: unknown tile/Template Piece “${id}”`)
  }
  for (const id of weightedIds(ruleset.doors.underlayTile)) {
    if (!knownRole(id) && !knownTile(id)) errors.push(`doors.underlayTile: unknown tile “${id}”`)
  }
  return { ok: errors.length === 0, errors, ruleset }
}

function cloneRole(value) {
  if (value == null) return null
  if (Array.isArray(value)) return value.map((entry) => ({ ...entry }))
  return value
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
      if (!primaryId(ruleset.walls[key])) {
        ruleset.walls[key] = roleList(FALLBACK.walls[key], { required: true, fallback: FALLBACK.walls[key] })
      }
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
    floors: {
      ...entry.floors,
      defaultTile: cloneRole(entry.floors.defaultTile),
      variants: [...entry.floors.variants],
    },
    walls: {
      ...entry.walls,
      fittings: cloneRole(entry.walls.fittings) ?? [],
      ...Object.fromEntries(WALL_TILE_KEYS.map((key) => [key, cloneRole(entry.walls[key])])),
    },
    doors: {
      ...entry.doors,
      underlayTile: cloneRole(entry.doors.underlayTile),
    },
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

/** Snapshot shape for /__autopaint (weighted roles serialized). */
export function autoPaintRulesetsSnapshot() {
  return {
    notes: seed?.notes ?? '',
    rulesets: listAutoPaintRulesets().map((entry) => ({
      ...entry,
      floors: {
        defaultTile: serializeWeighted(entry.floors.defaultTile),
        variants: [...entry.floors.variants],
      },
      walls: {
        fittingChance: entry.walls.fittingChance,
        fittings: serializeWeighted(entry.walls.fittings, { allowEmpty: true }),
        ...Object.fromEntries(
          WALL_TILE_KEYS.map((key) => [
            key,
            entry.walls[key] == null ? null : serializeWeighted(entry.walls[key], { allowEmpty: true }),
          ]),
        ),
      },
      doors: {
        ...entry.doors,
        underlayTile: serializeWeighted(entry.doors.underlayTile),
      },
    })),
  }
}

export { primaryId, weightedIds }
