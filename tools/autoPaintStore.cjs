const fs = require('fs')
const path = require('path')
const { writeFileAtomic } = require('./atomicWrite.cjs')

// Dev Auto-Paint Ruleset Editor: CRUD into autoPaintRulesets.json (/__autopaint).
// Role fields accept a string id or [{ id, weight }, ...] (relative mix).

const ENVIRONMENTS = new Set(['starshipStation', 'indoorBuilding', 'outdoorSettlement', 'naturalTerrain'])
const WALL_MODES = new Set(['templatePieces', 'tiles'])
const PIECE_KEYS = ['straight', 'straightLong', 'corner', 'hull', 'hullLong', 'hullCorner', 'doorFrame']
const REQUIRED_PIECE_KEYS = ['straight', 'corner']

const TILES_FILE = path.join(__dirname, '../src/data/adaptation/maps/tiles.json')
const TEMPLATE_PIECES_FILE = path.join(__dirname, '../src/data/adaptation/maps/templatePieces.json')

function catalogueTileIds() {
  return new Set(JSON.parse(fs.readFileSync(TILES_FILE, 'utf8')).tiles.map((tile) => tile.id))
}

function cataloguePieceIds() {
  return new Set(JSON.parse(fs.readFileSync(TEMPLATE_PIECES_FILE, 'utf8')).pieces.map((piece) => piece.id))
}

function readCatalogue(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeCatalogue(file, data) {
  writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`)
  return data
}

function normalizeId(value) {
  const id = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!id) throw new Error('ruleset id required')
  return id
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function normalizeRole(raw, { allowEmpty = false } = {}) {
  const collected = []
  const push = (id, weight) => {
    if (typeof id !== 'string' || !id.trim()) return
    const trimmed = id.trim()
    if (collected.some((entry) => entry.id === trimmed)) return
    collected.push({ id: trimmed, weight: weight == null ? 1 : clamp01(Number(weight)) })
  }
  if (raw == null || raw === '') {
    /* empty */
  } else if (typeof raw === 'string') {
    push(raw, 1)
  } else if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === 'string') push(entry, 1)
      else if (entry && typeof entry === 'object') push(entry.id, entry.weight)
    }
  } else if (typeof raw === 'object') {
    push(raw.id, raw.weight)
  }
  if (!collected.length) {
    if (allowEmpty) return []
    throw new Error('role must include at least one id')
  }
  const sum = collected.reduce((total, entry) => total + entry.weight, 0)
  if (sum <= 0) {
    const equal = 1 / collected.length
    return collected.map((entry) => ({ id: entry.id, weight: Math.round(equal * 1000) / 1000 }))
  }
  return collected.map((entry) => ({ id: entry.id, weight: Math.round((entry.weight / sum) * 1000) / 1000 }))
}

function roleIds(role) {
  return normalizeRole(role, { allowEmpty: true }).map((entry) => entry.id)
}

function normalizeRuleset(raw, fallbackId) {
  if (!raw || typeof raw !== 'object') throw new Error('ruleset required')
  const id = normalizeId(raw.id ?? fallbackId)
  const environment = ENVIRONMENTS.has(raw.environment) ? raw.environment : 'starshipStation'
  const wallMode = WALL_MODES.has(raw.wallMode) ? raw.wallMode : 'templatePieces'
  const floors = raw.floors && typeof raw.floors === 'object' ? raw.floors : {}
  const walls = raw.walls && typeof raw.walls === 'object' ? raw.walls : {}
  const doors = raw.doors && typeof raw.doors === 'object' ? raw.doors : {}
  const props = raw.props && typeof raw.props === 'object' ? raw.props : {}
  const defaultTile = normalizeRole(floors.defaultTile ?? 'floor')
  const underlayWallTile =
    typeof raw.underlayWallTile === 'string' && raw.underlayWallTile.trim() ? raw.underlayWallTile.trim() : 'templateWall'

  const nextWalls = {}
  for (const key of PIECE_KEYS) {
    const value = walls[key]
    if (value == null || value === '') {
      nextWalls[key] = null
      continue
    }
    const list = normalizeRole(value, { allowEmpty: true })
    nextWalls[key] = list.length ? list : null
  }
  if (!nextWalls.straight?.length) throw new Error('walls.straight required')
  if (!nextWalls.corner?.length) throw new Error('walls.corner required')

  const fittings = normalizeRole(walls.fittings, { allowEmpty: true })
  const fittingChance = Number(walls.fittingChance)
  nextWalls.fittings = fittings
  nextWalls.fittingChance = Number.isFinite(fittingChance) ? Math.min(1, Math.max(0, fittingChance)) : 0

  const tileIds = catalogueTileIds()
  const pieceIds = cataloguePieceIds()
  const knownRole = (roleId) => tileIds.has(roleId) || pieceIds.has(roleId)
  const errors = []
  if (!tileIds.has(underlayWallTile)) errors.push(`underlayWallTile: unknown tile “${underlayWallTile}”`)
  // Floor roles may be tile ids or Template Piece ids (client resolves pieces → tiles at generate).
  for (const tileId of roleIds(defaultTile)) {
    if (!tileIds.has(tileId) && !pieceIds.has(tileId)) {
      errors.push(`floors.defaultTile: unknown tile “${tileId}”`)
    }
  }
  const variants = Array.isArray(floors.variants)
    ? floors.variants.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim())
    : []
  for (const variant of variants) {
    if (!tileIds.has(variant)) errors.push(`floors.variants: unknown tile “${variant}”`)
  }
  for (const key of PIECE_KEYS) {
    const ids = roleIds(nextWalls[key])
    if (!ids.length) {
      if (REQUIRED_PIECE_KEYS.includes(key)) errors.push(`walls.${key} is required`)
      continue
    }
    for (const pieceId of ids) {
      if (!knownRole(pieceId)) errors.push(`walls.${key}: unknown Template Piece “${pieceId}”`)
    }
  }
  for (const pieceId of roleIds(fittings)) {
    if (!knownRole(pieceId)) errors.push(`walls.fittings: unknown Template Piece “${pieceId}”`)
  }
  const underlayDoor = normalizeRole(doors.underlayTile ?? 'doorway')
  for (const doorId of roleIds(underlayDoor)) {
    if (!knownRole(doorId)) errors.push(`doors.underlayTile: unknown tile “${doorId}”`)
  }
  if (errors.length) throw new Error(`Invalid Auto-Paint ruleset: ${errors.join('; ')}`)

  return {
    schemaVersion: 1,
    id,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : id,
    environment,
    wallMode,
    underlayWallTile,
    floors: {
      defaultTile,
      variants,
    },
    walls: nextWalls,
    doors: {
      underlayTile: underlayDoor,
      minGap: Number.isFinite(Number(doors.minGap)) ? Math.max(1, Math.floor(Number(doors.minGap))) : 1,
      preferOpenings: doors.preferOpenings !== false,
    },
    props: {
      enabled: Boolean(props.enabled),
      rules: Array.isArray(props.rules) ? props.rules : [],
    },
  }
}

function listRulesets(file) {
  const data = readCatalogue(file)
  return {
    notes: data.notes ?? '',
    rulesets: Array.isArray(data.rulesets) ? data.rulesets.map((entry) => normalizeRuleset(entry, entry.id)) : [],
  }
}

function putRuleset(file, change) {
  if (change == null || typeof change !== 'object') throw new Error('body required')
  const data = readCatalogue(file)
  const rulesets = Array.isArray(data.rulesets) ? [...data.rulesets] : []
  const next = normalizeRuleset(change, change.id)
  const index = rulesets.findIndex((entry) => entry.id === next.id)
  if (index >= 0) rulesets[index] = next
  else rulesets.push(next)
  writeCatalogue(file, { notes: data.notes ?? '', rulesets })
  return next
}

function removeRuleset(file, change) {
  const id = normalizeId(change?.id)
  const data = readCatalogue(file)
  const rulesets = Array.isArray(data.rulesets) ? data.rulesets.filter((entry) => entry.id !== id) : []
  writeCatalogue(file, { notes: data.notes ?? '', rulesets })
  return { id, removed: true }
}

function applyAutoPaintChange(file, change) {
  const op = change?.op
  if (op === 'list') return listRulesets(file)
  if (op === 'put') return putRuleset(file, change.ruleset ?? change)
  if (op === 'delete') return removeRuleset(file, change)
  // Default PUT body = full ruleset save (Generator-style).
  if (change?.rulesets) {
    const data = readCatalogue(file)
    const rulesets = change.rulesets.map((entry) => normalizeRuleset(entry, entry.id))
    writeCatalogue(file, { notes: change.notes ?? data.notes ?? '', rulesets })
    return { notes: change.notes ?? data.notes ?? '', rulesets }
  }
  return putRuleset(file, change)
}

module.exports = {
  listRulesets,
  putRuleset,
  removeRuleset,
  applyAutoPaintChange,
  normalizeRuleset,
}
