const fs = require('node:fs')
const path = require('node:path')
const { checkId } = require('./mapStore.cjs')

// Conversation files for the dev conversation editor: one conversations/{id}.json each, where the id (file name) is
// the conversation's id. Used only by the dev server endpoint in vite.config.js; builds bundle the folder instead.

const fileFor = (folder, id) => path.join(folder, `${id}.json`)
const sameId = (a, b) => a.toLowerCase() === b.toLowerCase()

function readRecord(folder, id) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(folder, id), 'utf8'))
  } catch {
    return null
  }
}

// [{ id, name, record }], sorted by name.
function listConversations(folder) {
  if (!fs.existsSync(folder)) return []
  return fs
    .readdirSync(folder)
    .filter((file) => file.toLowerCase().endsWith('.json'))
    .map((file) => {
      const id = file.slice(0, -'.json'.length)
      const record = readRecord(folder, id)
      return record && { id, name: record.name || id, record }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Writes conversations/{id}.json; previousId (the file it was opened from) is removed after a rename.
function putConversation(folder, { id, previousId = null, record }) {
  checkId(id)
  if (previousId) checkId(previousId)
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(fileFor(folder, id), `${JSON.stringify(record, null, 2)}\n`)
  if (previousId && !sameId(previousId, id)) fs.rmSync(fileFor(folder, previousId), { force: true })
  return listConversations(folder)
}

function removeConversation(folder, id) {
  checkId(id)
  fs.rmSync(fileFor(folder, id), { force: true })
  return listConversations(folder)
}

module.exports = { listConversations, putConversation, removeConversation }
