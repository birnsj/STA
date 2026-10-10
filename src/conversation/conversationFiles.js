// Conversation files live in the project's conversations/ folder, one {id}.json each. The dev server reads and writes
// them live through its /__conversations endpoint (tools/conversationStore.cjs); built copies (Netlify, the desktop
// app) use the files bundled at build time, read-only. Same arrangement as the map files (maps/mapFiles.js).
import { mapFileId } from '../maps/mapFormat.js'
import { parseConversation, serializeConversation } from './conversationFormat.js'

const BUNDLED = import.meta.glob('/conversations/*.json', { eager: true, import: 'default' })
const bundledEntries = () =>
  Object.entries(BUNDLED)
    .map(([file, record]) => {
      const id = file.slice('/conversations/'.length, -'.json'.length)
      return { id, name: record.name || id, record }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

export const canSaveConversations = import.meta.env.DEV

// A conversation's id is its file name: the same characters a map file name may hold.
export const conversationFileId = mapFileId

async function callEndpoint(method, body) {
  const response = await fetch('/__conversations', {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = await response.json()
  if (!response.ok || result?.error) throw new Error(result?.error ?? `${response.status} ${response.statusText}`)
  return result
}

const allEntries = () => (import.meta.env.DEV ? callEndpoint('GET') : Promise.resolve(bundledEntries()))
const summary = (entries) => entries.map(({ id, name }) => ({ id, name }))

// [{ id, name }]
export async function listConversations() {
  return summary(await allEntries())
}

export async function loadConversation(id) {
  const entry = (await allEntries()).find((other) => other.id === id)
  if (!entry) throw new Error(`no conversation file ${id}`)
  return parseConversation(entry.record, entry.id)
}

// Saves conversations/{conversation.id}.json (previousId renames the file it was opened from). Returns the updated list.
export async function saveConversation(conversation, previousId = null) {
  return summary(await callEndpoint('PUT', { id: conversation.id, previousId, record: serializeConversation(conversation) }))
}

export async function deleteConversation(id) {
  return summary(await callEndpoint('DELETE', { id }))
}
