const fs = require('node:fs')
const path = require('node:path')

// Each confirmed character is its own .json file (the same record Export JSON downloads), named after the
// character and species: "Aaron Kowalski - Human.json", then "Aaron Kowalski - Human (2).json" for a repeat.
// The file name without .json is the entry id, so any .json placed in the folder shows up too.
// Shared by the desktop app (electron/characterFiles.cjs) and the dev server (vite.config.js).

// Windows forbids these characters (and control characters) in file names.
const FORBIDDEN = new Set('<>:"/\\|?*')
const isAllowedChar = (char) => !FORBIDDEN.has(char) && char.charCodeAt(0) >= 32

const safeName = (name, fallback = 'Unnamed Character') =>
  [...(name || '')]
    .filter(isAllowedChar)
    .join('')
    .trim()
    .replace(/\.+$/, '')
    .slice(0, 60) || fallback

// The id becomes a file path, so anything that could leave the folder is refused.
function checkId(id) {
  const valid = typeof id === 'string' && id.trim() !== '' && id !== '.' && id !== '..' && [...id].every(isAllowedChar)
  if (!valid) throw new Error(`Invalid character id: ${id}`)
}

const fileFor = (folder, id) => path.join(folder, `${id}.json`)

function listIds(folder) {
  if (!fs.existsSync(folder)) return []
  return fs
    .readdirSync(folder)
    .filter((file) => file.toLowerCase().endsWith('.json'))
    .map((file) => file.slice(0, -'.json'.length))
}

// Mixed heritage joins the parents with "-" ("/" is not allowed in file names); a New Species uses its custom name.
function speciesLabel(record) {
  const species = record?.character?.species
  if (!species) return ''
  if (Array.isArray(species.parents)) {
    const parents = species.parents.filter(Boolean).map((parent) => parent.name)
    if (parents.length) return parents.join('-')
  }
  return species.customName?.trim() || species.name || ''
}

function baseName(entry) {
  const species = safeName(speciesLabel(entry.record), '')
  return species ? `${safeName(entry.name)} - ${species}` : safeName(entry.name)
}

// First of "Name - Species", "Name - Species (2)"... not used by another file (Windows names ignore case).
function availableId(folder, entry, ownId) {
  const taken = new Set(listIds(folder).filter((id) => id !== ownId).map((id) => id.toLowerCase()))
  const base = baseName(entry)
  let id = base
  for (let n = 2; taken.has(id.toLowerCase()); n += 1) id = `${base} (${n})`
  return id
}

// Oldest first, matching the order characters were first confirmed.
function listCharacters(folder) {
  return listIds(folder)
    .map((id) => {
      try {
        const fullPath = fileFor(folder, id)
        const record = JSON.parse(fs.readFileSync(fullPath, 'utf8'))
        const stats = fs.statSync(fullPath)
        const name = record?.character?.identity?.name?.trim() ?? ''
        return { id, savedAt: stats.mtime.toISOString(), name, record, createdMs: stats.birthtimeMs }
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.createdMs - b.createdMs)
    .map(({ createdMs: _createdMs, ...entry }) => entry)
}

// Writes the entry and returns its id, which changes when the character's name or species does. An id with no file yet
// (a brand-new character) gets a file named after the character. Renaming rather than rewriting keeps the
// file's creation time, and with it the list order.
function putCharacter(folder, entry) {
  checkId(entry?.id)
  fs.mkdirSync(folder, { recursive: true })
  const exists = fs.existsSync(fileFor(folder, entry.id))
  const id = availableId(folder, entry, exists ? entry.id : null)
  if (exists && id !== entry.id) fs.renameSync(fileFor(folder, entry.id), fileFor(folder, id))
  fs.writeFileSync(fileFor(folder, id), JSON.stringify(entry.record, null, 2))
  return id
}

function removeCharacter(folder, id) {
  checkId(id)
  fs.rmSync(fileFor(folder, id), { force: true })
}

module.exports = { listCharacters, putCharacter, removeCharacter }
