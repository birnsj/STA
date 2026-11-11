const fs = require('fs')
const { writeFileAtomic } = require('./atomicWrite.cjs')
const { collectArtHrefs, deleteOrphanArtFiles } = require('./artHrefUtils.cjs')
const { trackAuthoringChange } = require('./gitTrack.cjs')

// Dev map editor: cover / fade / layer / emissive / emitColour on templatePieces.json (/__templates), or permanent delete.

const FLAGS = ['cover', 'fade']
const LAYER_IDS = ['ground', 'walls', 'furniture', 'characters', 'markers']
const LAYER_ID_SET = new Set(LAYER_IDS)
const EMISSIVE_MIN = 0
const EMISSIVE_MAX = 2
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function piecesArrayStart(text) {
  const match = /\n  "pieces":\s*\[/.exec(text)
  if (!match) throw new Error('Could not find top-level pieces array')
  return match.index
}

function pieceIdOffset(text, id) {
  const idAt = text.indexOf(`"id": ${JSON.stringify(id)}`, piecesArrayStart(text))
  if (idAt < 0) throw new Error(`No template piece with id ${id}`)
  return idAt
}

function pieceObjectEnd(text, idAt) {
  let depth = 0
  let started = false
  let start = idAt
  while (start > 0 && text[start] !== '{') start -= 1
  for (let i = start; i < text.length; i += 1) {
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

function load(file) {
  return { text: fs.readFileSync(file, 'utf8'), data: JSON.parse(fs.readFileSync(file, 'utf8')) }
}

function findPiece(data, id) {
  const piece = data.pieces?.find((entry) => entry.id === id)
  if (!piece) throw new Error(`No template piece with id ${id}`)
  return piece
}

function setTemplatePieceFlag(file, change) {
  const flag = FLAGS.find((name) => name in change)
  if (!flag) throw new Error(`Only ${FLAGS.join(' or ')} can be changed`)
  const value = change[flag]
  const { id } = change
  if (typeof value !== 'boolean') throw new Error(`${flag} must be true or false`)
  const { text, data } = load(file)
  const piece = findPiece(data, id)
  if (typeof piece[flag] !== 'boolean') throw new Error(`Template piece ${id} has no ${flag} value to change`)

  const idAt = text.indexOf(`"id": ${JSON.stringify(id)}`, text.indexOf('"pieces"'))
  const pattern = new RegExp(`"${flag}":\\s*(true|false)`, 'g')
  pattern.lastIndex = idAt
  const match = pattern.exec(text)
  if (idAt < 0 || !match) throw new Error(`Could not find ${flag} for template piece ${id}`)
  // Bound the search to this piece object so a later piece's flag is not rewritten.
  const pieceEnd = text.indexOf('\n    },', match.index)
  if (pieceEnd >= 0 && match.index > pieceEnd) throw new Error(`Could not locate ${flag} inside ${id}`)
  const updated = `${text.slice(0, match.index)}"${flag}": ${value}${text.slice(match.index + match[0].length)}`
  if (JSON.parse(updated).pieces.find((entry) => entry.id === id)[flag] !== value) {
    throw new Error(`Could not update template piece ${id}`)
  }
  writeFileAtomic(file, updated)
  return { id, [flag]: value }
}

function forEachAnimation(piece, visit) {
  if (piece.animation) visit(piece.animation)
  for (const orient of Object.values(piece.orients ?? {})) {
    if (orient.animation) visit(orient.animation)
  }
}

// Authoring layer (LAYER_IDS). Updates or inserts "layer" inside the piece object.
function setTemplatePieceLayer(file, change) {
  const { id, layer } = change ?? {}
  if (!id || typeof id !== 'string') throw new Error('id is required')
  if (!LAYER_ID_SET.has(layer)) throw new Error(`layer must be one of ${LAYER_IDS.join(', ')}`)
  const text = fs.readFileSync(file, 'utf8')
  const piece = JSON.parse(text).pieces.find((entry) => entry.id === id)
  if (!piece) throw new Error(`No template piece with id ${id}`)

  const idAt = pieceIdOffset(text, id)
  const end = pieceObjectEnd(text, idAt)
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

  if (JSON.parse(updated).pieces.find((entry) => entry.id === id).layer !== layer) {
    throw new Error(`Could not update layer for template piece ${id}`)
  }
  writeFileAtomic(file, updated)
  return { id, layer }
}

// Seed missing layer fields. Never overwrites a valid existing layer. Returns { updated, skipped, counts }.
function seedTemplatePieceLayers(file, classify) {
  if (typeof classify !== 'function') throw new Error('classify(piece) is required')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const counts = Object.fromEntries(LAYER_IDS.map((id) => [id, 0]))
  let updated = 0
  let skipped = 0
  for (const piece of data.pieces ?? []) {
    if (LAYER_ID_SET.has(piece.layer)) {
      counts[piece.layer] += 1
      skipped += 1
      continue
    }
    const layer = classify({ ...piece, layer: undefined })
    if (!LAYER_ID_SET.has(layer)) throw new Error(`classify returned invalid layer for ${piece.id}`)
    const result = setTemplatePieceLayer(file, { id: piece.id, layer })
    counts[result.layer] += 1
    updated += 1
  }
  return { updated, skipped, counts }
}

function setTemplatePieceEmissive(file, change) {
  const { id } = change
  const value = Math.round(Number(change.emissive) * 10) / 10
  if (!id || typeof id !== 'string') throw new Error('id is required')
  if (!Number.isFinite(value) || value < EMISSIVE_MIN || value > EMISSIVE_MAX) {
    throw new Error(`emissive must be between ${EMISSIVE_MIN} and ${EMISSIVE_MAX}`)
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const piece = findPiece(data, id)
  if (!piece.animation?.overlay) throw new Error(`No overlay animation for ${id}`)
  forEachAnimation(piece, (anim) => {
    if (value === 1) delete anim.emissive
    else anim.emissive = value
  })
  writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`)
  return { id, emissive: value }
}

function setTemplatePieceEmitColour(file, change) {
  const { id } = change
  if (!id || typeof id !== 'string') throw new Error('id is required')
  const colour = change.emitColour
  if (colour != null && colour !== '' && !HEX.test(colour)) throw new Error('emitColour must be #rgb or #rrggbb')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const piece = findPiece(data, id)
  if (!piece.animation?.overlay) throw new Error(`No overlay animation for ${id}`)
  const next = colour == null || colour === '' ? null : colour.toLowerCase()
  forEachAnimation(piece, (anim) => {
    if (next) anim.emitColour = next
    else delete anim.emitColour
  })
  writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`)
  return { id, emitColour: next }
}

function scrubTemplateDeckStyle(templateDeckStyleFile, id, fallbackPieceId) {
  if (!templateDeckStyleFile || !fs.existsSync(templateDeckStyleFile)) return false
  const data = JSON.parse(fs.readFileSync(templateDeckStyleFile, 'utf8'))
  let dirty = false
  for (const field of ['straight', 'straightLong', 'corner', 'hull', 'hullLong', 'hullCorner', 'doorFrame']) {
    if (data[field] === id) {
      if (!fallbackPieceId) throw new Error(`Cannot delete “${id}”: no fallback piece left for templateDeckStyle.${field}`)
      data[field] = fallbackPieceId
      dirty = true
    }
  }
  if (Array.isArray(data.fittings)) {
    const next = data.fittings.filter((entry) => entry !== id)
    if (next.length !== data.fittings.length) {
      data.fittings = next
      dirty = true
    }
  }
  if (dirty) writeFileAtomic(templateDeckStyleFile, `${JSON.stringify(data, null, 2)}\n`)
  return dirty
}

function deleteTemplatePiece(file, change, extras = {}) {
  const { id } = change ?? {}
  if (!id || typeof id !== 'string') throw new Error('id is required')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const index = (data.pieces ?? []).findIndex((piece) => piece.id === id)
  if (index < 0) throw new Error(`No template piece with id ${id}`)
  const [removed] = data.pieces.splice(index, 1)
  const doomed = collectArtHrefs(removed)
  writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`)

  const stillUsed = collectArtHrefs(data)
  if (extras.tilesFile && fs.existsSync(extras.tilesFile)) {
    collectArtHrefs(JSON.parse(fs.readFileSync(extras.tilesFile, 'utf8')), stillUsed)
  }
  if (extras.effectsFile && fs.existsSync(extras.effectsFile)) {
    collectArtHrefs(JSON.parse(fs.readFileSync(extras.effectsFile, 'utf8')), stillUsed)
  }
  const deletedArt = extras.publicRoot ? deleteOrphanArtFiles(extras.publicRoot, doomed, stillUsed) : []
  const fallbackPieceId = data.pieces[0]?.id ?? null
  const scrubbedStyle = scrubTemplateDeckStyle(extras.templateDeckStyleFile, id, fallbackPieceId)

  const trackFiles = [file]
  if (scrubbedStyle && extras.templateDeckStyleFile) trackFiles.push(extras.templateDeckStyleFile)
  const git = trackAuthoringChange(extras.publicRoot, { files: trackFiles, artHrefs: deletedArt })

  return {
    id,
    label: removed.label ?? id,
    deleted: true,
    deletedArt,
    scrubbed: scrubbedStyle ? ['templateDeckStyle'] : [],
    git,
  }
}

function applyTemplatePieceChange(file, change, extras = {}) {
  if (!change || typeof change !== 'object') throw new Error('body required')
  if (change.delete) return deleteTemplatePiece(file, change, extras)
  if ('layer' in change) return setTemplatePieceLayer(file, change)
  if ('cover' in change || 'fade' in change) return setTemplatePieceFlag(file, change)
  if ('emissive' in change) return setTemplatePieceEmissive(file, change)
  if ('emitColour' in change) return setTemplatePieceEmitColour(file, change)
  throw new Error('cover, fade, layer, emissive, emitColour, or delete required')
}

module.exports = {
  applyTemplatePieceChange,
  setTemplatePieceFlag,
  setTemplatePieceLayer,
  seedTemplatePieceLayers,
  setTemplatePieceEmissive,
  setTemplatePieceEmitColour,
  deleteTemplatePiece,
}
