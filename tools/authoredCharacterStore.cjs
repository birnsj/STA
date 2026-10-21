const fs = require('node:fs')
const { writeFileAtomic } = require('./atomicWrite.cjs')

// Authored NPC pool (src/data/adaptation/characters.json): one file holding { notes, characters[] }.
// Used only by the Vite DEV endpoint; builds bundle the JSON instead. Preserves notes on every rewrite.

const FORBIDDEN = /[^a-zA-Z0-9_-]/

function checkId(id) {
  const valid =
    typeof id === 'string' &&
    id.trim() === id &&
    id !== '' &&
    id.length <= 80 &&
    /^[a-zA-Z]/.test(id) &&
    !FORBIDDEN.test(id)
  if (!valid) throw new Error(`Invalid character id: ${id}`)
}

function readFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeFile(file, data) {
  writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`)
}

function load(file) {
  const data = readFile(file)
  if (!Array.isArray(data.characters)) throw new Error('characters.json is missing a characters array')
  return {
    notes: Array.isArray(data.notes) ? data.notes : [],
    characters: data.characters,
  }
}

// { notes, characters } for the client catalogue.
function listAuthoredCharacters(file) {
  return load(file)
}

function putAuthoredCharacter(file, entry) {
  if (!entry || typeof entry !== 'object') throw new Error('Missing character entry')
  checkId(entry.id)
  if (!entry.character || !entry.final) throw new Error('Authored character needs character and final')
  const data = load(file)
  const index = data.characters.findIndex((other) => other.id === entry.id)
  const next = {
    id: entry.id,
    ...(entry.playtestParty ? { playtestParty: true } : {}),
    ...(entry.sourceClassification ? { sourceClassification: entry.sourceClassification } : {}),
    character: entry.character,
    final: entry.final,
  }
  if (index >= 0) data.characters[index] = next
  else data.characters.push(next)
  writeFile(file, data)
  return data
}

function removeAuthoredCharacter(file, id) {
  checkId(id)
  const data = load(file)
  const next = data.characters.filter((entry) => entry.id !== id)
  if (next.length === data.characters.length) throw new Error(`Unknown character: ${id}`)
  data.characters = next
  writeFile(file, data)
  return data
}

module.exports = { listAuthoredCharacters, putAuthoredCharacter, removeAuthoredCharacter, checkId }
