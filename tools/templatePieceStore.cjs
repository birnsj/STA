const fs = require('fs')
const { writeFileAtomic } = require('./atomicWrite.cjs')

// Dev map editor: cover / fade / emissive / emitColour on templatePieces.json (/__templates).

const FLAGS = ['cover', 'fade']
const EMISSIVE_MIN = 0
const EMISSIVE_MAX = 2
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

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

function applyTemplatePieceChange(file, change) {
  if (!change || typeof change !== 'object') throw new Error('body required')
  if ('cover' in change || 'fade' in change) return setTemplatePieceFlag(file, change)
  if ('emissive' in change) return setTemplatePieceEmissive(file, change)
  if ('emitColour' in change) return setTemplatePieceEmitColour(file, change)
  throw new Error('cover, fade, emissive, or emitColour required')
}

module.exports = { applyTemplatePieceChange, setTemplatePieceFlag, setTemplatePieceEmissive, setTemplatePieceEmitColour }
