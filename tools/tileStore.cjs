const fs = require('fs')
const path = require('path')
const { writeFileAtomic } = require('./atomicWrite.cjs')
const { collectArtHrefs, deleteOrphanArtFiles } = require('./artHrefUtils.cjs')
const { putSprite } = require('./spriteStore.cjs')

// Dev map editor: cover/fade/layer, palette CRUD, create/rename/import tile art, or permanent delete.

const FLAGS = ['cover', 'fade']
const LAYER_IDS = ['ground', 'walls', 'furniture', 'characters', 'markers']
const LAYER_ID_SET = new Set(LAYER_IDS)
const PROTECTED_IDS = new Set(['null'])
const DEFAULT_TILE_PNG = path.join('art', 'sprites', 'environment', '_defaults', 'newTile.png')

function loadData(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function saveData(file, data) {
  writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`)
}

function slugify(text) {
  const base = String(text ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join('')
  const slug = base.replace(/[^a-zA-Z0-9_]/g, '') || 'tile'
  return /^[0-9]/.test(slug) ? `tile${slug}` : slug
}

function uniqueSlug(desired, taken) {
  let id = slugify(desired)
  if (!taken.has(id)) return id
  let n = 2
  while (taken.has(`${id}${n}`)) n += 1
  return `${id}${n}`
}

function* symbolCandidates() {
  for (let c = 33; c <= 126; c += 1) {
    const ch = String.fromCharCode(c)
    if (ch !== '"' && ch !== '\\') yield ch
  }
  for (let c = 0xc0; c <= 0xff; c += 1) {
    if (c === 0xd7 || c === 0xf7) continue
    yield String.fromCharCode(c)
  }
  for (let c = 0x100; c <= 0x24f; c += 1) yield String.fromCharCode(c)
}

function nextFreeSymbol(tiles) {
  const used = new Set((tiles ?? []).map((tile) => tile.symbol).filter((symbol) => symbol != null && symbol !== ''))
  for (const ch of symbolCandidates()) {
    if (!used.has(ch)) return ch
  }
  throw new Error('No free tile symbols left')
}

function updateNotesNextSymbol(data, symbol) {
  if (!Array.isArray(data.notes) || !data.notes.length) {
    data.notes = [`Shared tile catalogue. Next free symbol: ${symbol} (allocation order in docs/tiles.md).`]
    return
  }
  const line = String(data.notes[0])
  if (/Next free symbol:\s*.+?(?=\s*\(|$)/.test(line)) {
    data.notes[0] = line.replace(/Next free symbol:\s*.+?(?=\s*\(|$)/, `Next free symbol: ${symbol}`)
  } else {
    data.notes[0] = `${line} Next free symbol: ${symbol}.`
  }
}

function findGroup(data, id) {
  const group = (data.paletteGroups ?? []).find((entry) => entry.id === id)
  if (!group) throw new Error(`No palette group with id ${id}`)
  return group
}

function copyDefaultTilePng(publicRoot, imageUrl) {
  if (!publicRoot) throw new Error('publicRoot is required to create tile art')
  const defaultFile = path.join(publicRoot, DEFAULT_TILE_PNG)
  if (!fs.existsSync(defaultFile)) throw new Error(`Missing default tile art at ${DEFAULT_TILE_PNG}`)
  const relative = imageUrl.replace(/^\//, '').split('/')
  const dest = path.join(publicRoot, ...relative)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(defaultFile, dest)
}

// Top-level "tiles" array (not a paletteGroups[].tiles list).
function tilesArrayStart(text) {
  const match = /\n  "tiles":\s*\[/.exec(text)
  if (!match) throw new Error('Could not find top-level tiles array')
  return match.index
}

function tileIdOffset(text, id) {
  const idAt = text.indexOf(`"id": ${JSON.stringify(id)}`, tilesArrayStart(text))
  if (idAt < 0) throw new Error(`No tile with id ${id}`)
  return idAt
}

// End of this tile object in the hand-formatted file (exclusive), or text.length.
function tileObjectEnd(text, idAt) {
  let depth = 0
  let started = false
  // Walk back to the opening { of this tile.
  let start = idAt
  while (start > 0 && text[start] !== '{') start -= 1
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') {
      depth += 1
      started = true
    } else if (ch === '}') {
      depth -= 1
      if (started && depth === 0) return i + 1
    }
  }
  return text.length
}

function setTileFlag(file, change) {
  const flag = FLAGS.find((name) => name in change)
  if (!flag) throw new Error(`Only ${FLAGS.join(' or ')} can be changed`)
  const value = change[flag]
  const { id } = change
  if (typeof value !== 'boolean') throw new Error(`${flag} must be true or false`)
  const text = fs.readFileSync(file, 'utf8')
  const tile = JSON.parse(text).tiles.find((other) => other.id === id)
  if (!tile) throw new Error(`No tile with id ${id}`)
  if (typeof tile[flag] !== 'boolean') throw new Error(`Tile ${id} has no ${flag} value to change`)

  const idAt = tileIdOffset(text, id)
  const end = tileObjectEnd(text, idAt)
  const pattern = new RegExp(`"${flag}":\\s*(true|false)`)
  const slice = text.slice(idAt, end)
  const match = pattern.exec(slice)
  if (!match) throw new Error(`Could not find ${flag} for tile ${id}`)
  const at = idAt + match.index
  const updated = `${text.slice(0, at)}"${flag}": ${value}${text.slice(at + match[0].length)}`

  if (JSON.parse(updated).tiles.find((other) => other.id === id)[flag] !== value) throw new Error(`Could not update tile ${id}`)
  writeFileAtomic(file, updated)
  return { id, [flag]: value }
}

// Authoring layer (LAYER_IDS). Updates or inserts "layer" inside the tile object.
function setTileLayer(file, change) {
  const { id, layer } = change ?? {}
  if (!id || typeof id !== 'string') throw new Error('id is required')
  if (!LAYER_ID_SET.has(layer)) throw new Error(`layer must be one of ${LAYER_IDS.join(', ')}`)
  const text = fs.readFileSync(file, 'utf8')
  const tile = JSON.parse(text).tiles.find((other) => other.id === id)
  if (!tile) throw new Error(`No tile with id ${id}`)

  const idAt = tileIdOffset(text, id)
  const end = tileObjectEnd(text, idAt)
  const slice = text.slice(idAt, end)
  const existing = /"layer":\s*"[^"]*"/.exec(slice)
  let updated
  if (existing) {
    const at = idAt + existing.index
    updated = `${text.slice(0, at)}"layer": ${JSON.stringify(layer)}${text.slice(at + existing[0].length)}`
  } else {
    const idToken = `"id": ${JSON.stringify(id)}`
    const at = idAt + idToken.length
    updated = `${text.slice(0, at)}, "layer": ${JSON.stringify(layer)}${text.slice(at)}`
  }

  if (JSON.parse(updated).tiles.find((other) => other.id === id).layer !== layer) {
    throw new Error(`Could not update layer for tile ${id}`)
  }
  writeFileAtomic(file, updated)
  return { id, layer }
}

// Seed missing layer fields. Never overwrites a valid existing layer. Returns { updated, skipped, counts }.
function seedTileLayers(file, classify) {
  if (typeof classify !== 'function') throw new Error('classify(tile) is required')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const counts = Object.fromEntries(LAYER_IDS.map((id) => [id, 0]))
  let updated = 0
  let skipped = 0
  for (const tile of data.tiles ?? []) {
    if (LAYER_ID_SET.has(tile.layer)) {
      counts[tile.layer] += 1
      skipped += 1
      continue
    }
    const layer = classify({ ...tile, layer: undefined })
    if (!LAYER_ID_SET.has(layer)) throw new Error(`classify returned invalid layer for ${tile.id}`)
    const result = setTileLayer(file, { id: tile.id, layer })
    counts[result.layer] += 1
    updated += 1
  }
  return { updated, skipped, counts }
}

function scrubIdFromList(list, id) {
  if (!Array.isArray(list)) return list
  return list.filter((entry) => entry !== id)
}

function scrubGeneratorFiles({ deckGeneratorsFile, wallVariantsFile, templateDeckStyleFile }, id, fallbackTileId) {
  const scrubbed = []
  if (deckGeneratorsFile && fs.existsSync(deckGeneratorsFile)) {
    const data = JSON.parse(fs.readFileSync(deckGeneratorsFile, 'utf8'))
    let dirty = false
    for (const [key, style] of Object.entries(data)) {
      if (!style || typeof style !== 'object' || Array.isArray(style) || key === 'notes') continue
      for (const field of ['floor', 'wall', 'door', 'crate', 'machinery']) {
        if (style[field] === id) {
          if (!fallbackTileId) throw new Error(`Cannot delete “${id}”: no fallback tile left for deckGenerators.${key}.${field}`)
          style[field] = fallbackTileId
          dirty = true
        }
      }
      if (style.corner === id) {
        style.corner = null
        dirty = true
      }
    }
    if (dirty) {
      writeFileAtomic(deckGeneratorsFile, `${JSON.stringify(data, null, 2)}\n`)
      scrubbed.push('deckGenerators')
    }
  }
  if (wallVariantsFile && fs.existsSync(wallVariantsFile)) {
    const data = JSON.parse(fs.readFileSync(wallVariantsFile, 'utf8'))
    let dirty = false
    if (data.walls?.[id]) {
      delete data.walls[id]
      dirty = true
    }
    for (const set of Object.values(data.walls ?? {})) {
      const beforePanel = set.panelVariants?.length ?? 0
      const beforeTile = set.tileVariants?.length ?? 0
      set.panelVariants = scrubIdFromList(set.panelVariants, id)
      set.tileVariants = scrubIdFromList(set.tileVariants, id)
      if ((set.panelVariants?.length ?? 0) !== beforePanel || (set.tileVariants?.length ?? 0) !== beforeTile) dirty = true
    }
    if (dirty) {
      writeFileAtomic(wallVariantsFile, `${JSON.stringify(data, null, 2)}\n`)
      scrubbed.push('wallVariants')
    }
  }
  if (templateDeckStyleFile && fs.existsSync(templateDeckStyleFile)) {
    const data = JSON.parse(fs.readFileSync(templateDeckStyleFile, 'utf8'))
    let dirty = false
    for (const field of ['floor', 'door', 'crate', 'machinery']) {
      if (data[field] === id) {
        if (!fallbackTileId) throw new Error(`Cannot delete “${id}”: no fallback tile left for templateDeckStyle.${field}`)
        data[field] = fallbackTileId
        dirty = true
      }
    }
    if (dirty) {
      writeFileAtomic(templateDeckStyleFile, `${JSON.stringify(data, null, 2)}\n`)
      scrubbed.push('templateDeckStyle')
    }
  }
  return scrubbed
}

function deleteTile(file, change, extras = {}) {
  const { id } = change ?? {}
  if (!id || typeof id !== 'string') throw new Error('id is required')
  if (PROTECTED_IDS.has(id)) throw new Error(`Tile “${id}” cannot be deleted`)

  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const index = (data.tiles ?? []).findIndex((tile) => tile.id === id)
  if (index < 0) throw new Error(`No tile with id ${id}`)
  const [removed] = data.tiles.splice(index, 1)

  for (const group of data.paletteGroups ?? []) {
    if (Array.isArray(group.tiles)) group.tiles = group.tiles.filter((entry) => entry !== id)
  }

  const doomed = collectArtHrefs(removed)
  let effectsRemoved = false
  if (extras.effectsFile && fs.existsSync(extras.effectsFile)) {
    const effects = JSON.parse(fs.readFileSync(extras.effectsFile, 'utf8'))
    if (effects.animations?.[id]) {
      collectArtHrefs(effects.animations[id], doomed)
      delete effects.animations[id]
      writeFileAtomic(extras.effectsFile, `${JSON.stringify(effects, null, 2)}\n`)
      effectsRemoved = true
    }
  }

  writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`)

  const stillUsed = collectArtHrefs(data)
  if (extras.effectsFile && fs.existsSync(extras.effectsFile)) {
    collectArtHrefs(JSON.parse(fs.readFileSync(extras.effectsFile, 'utf8')), stillUsed)
  }
  if (extras.templatePiecesFile && fs.existsSync(extras.templatePiecesFile)) {
    collectArtHrefs(JSON.parse(fs.readFileSync(extras.templatePiecesFile, 'utf8')), stillUsed)
  }

  const deletedArt = extras.publicRoot
    ? deleteOrphanArtFiles(extras.publicRoot, doomed, stillUsed)
    : []

  const fallbackTileId = data.tiles.find((tile) => tile.id && tile.id !== 'null')?.id ?? data.tiles[0]?.id ?? null
  const scrubbed = scrubGeneratorFiles(extras, id, fallbackTileId)

  return {
    id,
    label: removed.label ?? id,
    deleted: true,
    effectsRemoved,
    deletedArt,
    scrubbed,
  }
}

function reorderPaletteGroups(file, change) {
  const groupIds = change?.groupIds
  if (!Array.isArray(groupIds) || !groupIds.length) throw new Error('groupIds must be a non-empty array')
  const data = loadData(file)
  const byId = new Map((data.paletteGroups ?? []).map((group) => [group.id, group]))
  if (groupIds.length !== byId.size) throw new Error('groupIds must list every palette group exactly once')
  const seen = new Set()
  const next = []
  for (const id of groupIds) {
    if (typeof id !== 'string' || !id) throw new Error('group id must be a string')
    if (seen.has(id)) throw new Error(`Duplicate group id ${id}`)
    const group = byId.get(id)
    if (!group) throw new Error(`Unknown palette group ${id}`)
    seen.add(id)
    next.push(group)
  }
  data.paletteGroups = next
  saveData(file, data)
  return { groupIds: next.map((group) => group.id) }
}

function putPaletteGroup(file, change, extras = {}) {
  const label = typeof change?.label === 'string' ? change.label.trim() : ''
  const section = typeof change?.section === 'string' ? change.section.trim() : ''
  if (!label) throw new Error('label is required')
  if (!section) throw new Error('section is required')
  const data = loadData(file)
  data.paletteGroups = data.paletteGroups ?? []

  if (change.id) {
    const group = findGroup(data, change.id)
    group.label = label
    group.section = section
    if (Array.isArray(change.tiles)) group.tiles = change.tiles.map(String)
    saveData(file, data)
    return { id: group.id, label: group.label, section: group.section, tiles: [...group.tiles] }
  }

  const taken = new Set(data.paletteGroups.map((group) => group.id))
  const id = uniqueSlug(change.idHint || label, taken)
  const group = { id, section, label, tiles: Array.isArray(change.tiles) ? change.tiles.map(String) : [] }
  data.paletteGroups.push(group)
  saveData(file, data)
  if (extras.publicRoot) {
    fs.mkdirSync(path.join(extras.publicRoot, 'art', 'sprites', 'environment', id), { recursive: true })
  }
  return { id: group.id, label: group.label, section: group.section, tiles: [...group.tiles], created: true }
}

function deletePaletteGroup(file, change) {
  const { id } = change ?? {}
  if (!id || typeof id !== 'string') throw new Error('id is required')
  const data = loadData(file)
  const index = (data.paletteGroups ?? []).findIndex((group) => group.id === id)
  if (index < 0) throw new Error(`No palette group with id ${id}`)
  const [removed] = data.paletteGroups.splice(index, 1)
  saveData(file, data)
  return { id, label: removed.label ?? id, deleted: true, tiles: [...(removed.tiles ?? [])] }
}

function renameSection(file, change) {
  const from = typeof change?.from === 'string' ? change.from.trim() : ''
  const to = typeof change?.to === 'string' ? change.to.trim() : ''
  if (!from) throw new Error('from is required')
  if (!to) throw new Error('to is required')
  if (from === to) return { from, to, updated: 0 }
  const data = loadData(file)
  let updated = 0
  for (const group of data.paletteGroups ?? []) {
    if (group.section === from) {
      group.section = to
      updated += 1
    }
  }
  if (!updated) throw new Error(`No palette groups use section “${from}”`)
  saveData(file, data)
  return { from, to, updated }
}

function deleteSection(file, change) {
  const section = typeof change?.section === 'string' ? change.section.trim() : ''
  if (!section) throw new Error('section is required')
  const data = loadData(file)
  const still = (data.paletteGroups ?? []).filter((group) => group.section === section)
  if (still.length) {
    throw new Error(`Section “${section}” still has ${still.length} tileset${still.length === 1 ? '' : 's'}; move or delete them first`)
  }
  return { section, deleted: true }
}

function createTile(file, change, extras = {}) {
  const groupId = change?.groupId
  const label = typeof change?.label === 'string' ? change.label.trim() : ''
  if (!groupId || typeof groupId !== 'string') throw new Error('groupId is required')
  if (!label) throw new Error('label is required')
  const data = loadData(file)
  const group = findGroup(data, groupId)
  const taken = new Set((data.tiles ?? []).map((tile) => tile.id))
  const id = uniqueSlug(change.id || label, taken)
  const symbol = nextFreeSymbol(data.tiles)
  const image = `/art/sprites/environment/${groupId}/${id}.png`
  const tile = {
    id,
    layer: 'ground',
    symbol,
    label,
    image,
    solid: false,
    blocksSight: false,
    cover: false,
    fade: false,
    height: 0,
    role: null,
  }
  data.tiles.push(tile)
  group.tiles = group.tiles ?? []
  group.tiles.push(id)
  updateNotesNextSymbol(data, nextFreeSymbol(data.tiles))
  saveData(file, data)
  copyDefaultTilePng(extras.publicRoot, image)
  return { id, label, symbol, image, groupId, layer: tile.layer, tile }
}

function renameTile(file, change) {
  const { id } = change ?? {}
  const label = typeof change?.label === 'string' ? change.label.trim() : ''
  if (!id || typeof id !== 'string') throw new Error('id is required')
  if (!label) throw new Error('label is required')
  if (PROTECTED_IDS.has(id)) throw new Error(`Tile “${id}” cannot be renamed`)
  const data = loadData(file)
  const tile = (data.tiles ?? []).find((entry) => entry.id === id)
  if (!tile) throw new Error(`No tile with id ${id}`)
  tile.label = label
  saveData(file, data)
  return { id, label }
}

function importTileArt(file, change, extras = {}) {
  const { id, png } = change ?? {}
  if (!id || typeof id !== 'string') throw new Error('id is required')
  if (PROTECTED_IDS.has(id)) throw new Error(`Tile “${id}” art cannot be replaced`)
  if (!extras.publicRoot) throw new Error('publicRoot is required to import tile art')
  const spritesRoot = path.join(extras.publicRoot, 'art', 'sprites')
  const data = loadData(file)
  const tile = (data.tiles ?? []).find((entry) => entry.id === id)
  if (!tile) throw new Error(`No tile with id ${id}`)
  if (!tile.image || typeof tile.image !== 'string') throw new Error(`Tile ${id} has no image path`)
  const result = putSprite(spritesRoot, { path: tile.image, png })
  return { id, path: result.path, version: result.version, image: tile.image }
}

function applyTileChange(file, change, extras = {}) {
  if (!change || typeof change !== 'object') throw new Error('body required')
  if (change.delete) return deleteTile(file, change, extras)
  switch (change.op) {
    case 'reorderPaletteGroups':
      return reorderPaletteGroups(file, change)
    case 'putPaletteGroup':
      return putPaletteGroup(file, change, extras)
    case 'deletePaletteGroup':
      return deletePaletteGroup(file, change)
    case 'renameSection':
      return renameSection(file, change)
    case 'deleteSection':
      return deleteSection(file, change)
    case 'createTile':
      return createTile(file, change, extras)
    case 'renameTile':
      return renameTile(file, change)
    case 'importTileArt':
      return importTileArt(file, change, extras)
    default:
      break
  }
  if ('layer' in change) return setTileLayer(file, change)
  return setTileFlag(file, change)
}

module.exports = {
  setTileFlag,
  setTileLayer,
  seedTileLayers,
  deleteTile,
  reorderPaletteGroups,
  putPaletteGroup,
  deletePaletteGroup,
  renameSection,
  deleteSection,
  createTile,
  renameTile,
  importTileArt,
  applyTileChange,
  PROTECTED_IDS,
  LAYER_IDS,
}
