const fs = require('fs')
const path = require('path')
const { writeFileAtomic } = require('./atomicWrite.cjs')

// Dev Auto-Paint Ruleset Editor: CRUD into autoPaintRulesets.json (/__autopaint).

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

function normalizeRuleset(raw, fallbackId) {
  if (!raw || typeof raw !== 'object') throw new Error('ruleset required')
  const id = normalizeId(raw.id ?? fallbackId)
  const environment = ENVIRONMENTS.has(raw.environment) ? raw.environment : 'starshipStation'
  const wallMode = WALL_MODES.has(raw.wallMode) ? raw.wallMode : 'templatePieces'
  const floors = raw.floors && typeof raw.floors === 'object' ? raw.floors : {}
  const walls = raw.walls && typeof raw.walls === 'object' ? raw.walls : {}
  const doors = raw.doors && typeof raw.doors === 'object' ? raw.doors : {}
  const props = raw.props && typeof raw.props === 'object' ? raw.props : {}
  const defaultTile = typeof floors.defaultTile === 'string' && floors.defaultTile.trim() ? floors.defaultTile.trim() : 'floor'
  const underlayWallTile =
    typeof raw.underlayWallTile === 'string' && raw.underlayWallTile.trim() ? raw.underlayWallTile.trim() : 'templateWall'

  const nextWalls = {}
  for (const key of PIECE_KEYS) {
    const value = walls[key]
    nextWalls[key] = typeof value === 'string' && value.trim() ? value.trim() : null
  }
  if (!nextWalls.straight) throw new Error('walls.straight required')
  if (!nextWalls.corner) throw new Error('walls.corner required')

  const fittings = Array.isArray(walls.fittings)
    ? walls.fittings.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())
    : []
  const fittingChance = Number(walls.fittingChance)
  nextWalls.fittings = fittings
  nextWalls.fittingChance = Number.isFinite(fittingChance) ? Math.min(1, Math.max(0, fittingChance)) : 0

  const tileIds = catalogueTileIds()
  const pieceIds = cataloguePieceIds()
  const errors = []
  if (!tileIds.has(underlayWallTile)) errors.push(`underlayWallTile: unknown tile “${underlayWallTile}”`)
  if (!tileIds.has(defaultTile)) errors.push(`floors.defaultTile: unknown tile “${defaultTile}”`)
  const variants = Array.isArray(floors.variants)
    ? floors.variants.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())
    : []
  for (const variant of variants) {
    if (!tileIds.has(variant)) errors.push(`floors.variants: unknown tile “${variant}”`)
  }
  for (const key of PIECE_KEYS) {
    const pieceId = nextWalls[key]
    if (!pieceId) {
      if (REQUIRED_PIECE_KEYS.includes(key)) errors.push(`walls.${key} is required`)
      continue
    }
    if (!pieceIds.has(pieceId)) errors.push(`walls.${key}: unknown Template Piece “${pieceId}”`)
  }
  for (const pieceId of fittings) {
    if (!pieceIds.has(pieceId)) errors.push(`walls.fittings: unknown Template Piece “${pieceId}”`)
  }
  const underlayDoor =
    typeof doors.underlayTile === 'string' && doors.underlayTile.trim() ? doors.underlayTile.trim() : 'doorway'
  if (!tileIds.has(underlayDoor)) errors.push(`doors.underlayTile: unknown tile “${underlayDoor}”`)
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
