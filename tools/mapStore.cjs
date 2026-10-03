const fs = require('node:fs')
const path = require('node:path')

// Map files for the dev map editor: one maps/{id}.json per map, where the id (file name) is the map's name.
// Used only by the dev server endpoint in vite.config.js; builds bundle the folder's files instead.

// Windows forbids these characters (and control characters) in file names; anything that could leave the folder is refused.
const FORBIDDEN = new Set('<>:"/\\|?*')
function checkId(id) {
  const valid =
    typeof id === 'string' &&
    id.trim() === id &&
    id !== '' &&
    id.length <= 60 &&
    !id.endsWith('.') &&
    [...id].every((char) => !FORBIDDEN.has(char) && char.charCodeAt(0) >= 32)
  if (!valid) throw new Error(`Invalid map name: ${id}`)
}

const fileFor = (folder, id) => path.join(folder, `${id}.json`)

// [{ id, name, record }], sorted by name.
function listMaps(folder) {
  if (!fs.existsSync(folder)) return []
  return fs
    .readdirSync(folder)
    .filter((file) => file.toLowerCase().endsWith('.json'))
    .map((file) => {
      try {
        const record = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'))
        const id = file.slice(0, -'.json'.length)
        return { id, name: record.name || id, record }
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Writes maps/{id}.json. previousId: the file this map was opened from; when the name changed, that file is renamed
// (removed after the new one is written), so renaming a map doesn't leave a copy behind.
function putMap(folder, { id, previousId, record }) {
  checkId(id)
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(fileFor(folder, id), `${JSON.stringify(record, null, 2)}\n`)
  if (previousId && previousId.toLowerCase() !== id.toLowerCase()) {
    checkId(previousId)
    fs.rmSync(fileFor(folder, previousId), { force: true })
  }
  return listMaps(folder)
}

function removeMap(folder, id) {
  checkId(id)
  fs.rmSync(fileFor(folder, id), { force: true })
  return listMaps(folder)
}

module.exports = { checkId, listMaps, putMap, removeMap }
