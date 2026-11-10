const fs = require('fs')
const { writeFileAtomic } = require('./atomicWrite.cjs')

// Dev Generator Editor: writes Template Deck style into templateDeckStyle.json (/__template-deck-style).

const TILE_KEYS = ['floor', 'door', 'crate', 'machinery']
const PIECE_KEYS = ['straight', 'straightLong', 'corner', 'hull', 'hullLong', 'hullCorner', 'doorFrame']

function putTemplateDeckStyle(file, change) {
  if (change == null || typeof change !== 'object') throw new Error('body required')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const next = { ...data }

  for (const key of TILE_KEYS) {
    if (change[key] == null) continue
    if (typeof change[key] !== 'string' || !change[key].trim()) throw new Error(`${key} must be a tile id`)
    next[key] = change[key].trim()
  }
  for (const key of PIECE_KEYS) {
    if (change[key] == null) continue
    if (typeof change[key] !== 'string' || !change[key].trim()) throw new Error(`${key} must be a template piece id`)
    next[key] = change[key].trim()
  }
  if ('hazard' in change) {
    if (typeof change.hazard !== 'boolean') throw new Error('hazard must be true or false')
    next.hazard = change.hazard
  }
  if ('fittingChance' in change) {
    const n = Number(change.fittingChance)
    if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error('fittingChance must be 0–1')
    next.fittingChance = Math.round(n * 1000) / 1000
  }
  if ('fittings' in change) {
    if (!Array.isArray(change.fittings)) throw new Error('fittings must be an array of piece ids')
    next.fittings = change.fittings.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())
  }

  for (const key of TILE_KEYS) {
    if (typeof next[key] !== 'string' || !next[key]) throw new Error(`missing ${key}`)
  }
  for (const key of PIECE_KEYS) {
    if (typeof next[key] !== 'string' || !next[key]) throw new Error(`missing ${key}`)
  }
  if (typeof next.hazard !== 'boolean') next.hazard = Boolean(next.hazard)
  if (!Array.isArray(next.fittings)) next.fittings = []
  if (!Number.isFinite(Number(next.fittingChance))) next.fittingChance = 0.28

  const out = {
    notes: data.notes ?? 'Generator Editor style for Generate Map → Template Deck.',
    floor: next.floor,
    door: next.door,
    crate: next.crate,
    machinery: next.machinery,
    hazard: next.hazard,
    straight: next.straight,
    straightLong: next.straightLong,
    corner: next.corner,
    hull: next.hull,
    hullLong: next.hullLong,
    hullCorner: next.hullCorner,
    doorFrame: next.doorFrame,
    fittings: next.fittings,
    fittingChance: next.fittingChance,
  }
  writeFileAtomic(file, `${JSON.stringify(out, null, 2)}\n`)
  return out
}

module.exports = { putTemplateDeckStyle }
