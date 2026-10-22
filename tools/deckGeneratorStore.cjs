const fs = require('fs')
const { writeFileAtomic } = require('./atomicWrite.cjs')

// Dev Generator Editor: writes one deck style into deckGenerators.json (/__deck-generators).

const DECK_IDS = new Set(['starshipDeck', 'laboratory', 'alienVessel'])
const TILE_KEYS = ['floor', 'wall', 'door', 'crate', 'machinery']

function putDeckStyle(file, change) {
  if (change == null || typeof change !== 'object') throw new Error('body required')
  const { id } = change
  if (!DECK_IDS.has(id)) throw new Error(`Unknown deck generator ${id}`)

  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const prev = data[id] && typeof data[id] === 'object' ? data[id] : {}
  const next = { ...prev }

  for (const key of TILE_KEYS) {
    if (change[key] == null) continue
    if (typeof change[key] !== 'string' || !change[key].trim()) {
      throw new Error(`${key} must be a tile id`)
    }
    next[key] = change[key].trim()
  }
  if ('corner' in change) {
    if (change.corner == null || change.corner === '') next.corner = null
    else if (typeof change.corner !== 'string' || !change.corner.trim()) throw new Error('corner must be a tile id or empty')
    else next.corner = change.corner.trim()
  }
  if ('hazard' in change) {
    if (typeof change.hazard !== 'boolean') throw new Error('hazard must be true or false')
    next.hazard = change.hazard
  }

  for (const key of TILE_KEYS) {
    if (typeof next[key] !== 'string' || !next[key]) throw new Error(`${id} is missing ${key}`)
  }
  if (typeof next.hazard !== 'boolean') next.hazard = Boolean(next.hazard)
  if (next.corner != null && (typeof next.corner !== 'string' || !next.corner)) next.corner = null

  data[id] = {
    floor: next.floor,
    wall: next.wall,
    corner: next.corner ?? null,
    door: next.door,
    crate: next.crate,
    machinery: next.machinery,
    hazard: next.hazard,
  }
  writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`)
  return { id, ...data[id] }
}

module.exports = { putDeckStyle }
