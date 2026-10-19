import {
  listAuthoredCharacterEntries,
  listAuthoredCatalogueNotes,
  reloadAuthoredCatalogue,
} from './authoredCharacters.js'

// Character Library persistence for the authored NPC pool (characters.json).
// Vite DEV only — same constraint as map Save. Production/Electron stay read-only.

export const canSaveAuthoredCharacters = import.meta.env.DEV

const ENDPOINT = '/__authored-characters'

async function request(method, body) {
  const response = await fetch(ENDPOINT, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    let message = `Authored character ${method} failed (${response.status})`
    try {
      const data = await response.json()
      if (data?.error) message = data.error
    } catch {
      /* keep default */
    }
    throw new Error(message)
  }
  if (response.status === 204) return null
  return response.json()
}

/** Load catalogue from disk and refresh the in-memory index. */
export async function loadAuthoredCatalogueFromDisk() {
  if (!canSaveAuthoredCharacters) {
    return {
      notes: listAuthoredCatalogueNotes(),
      characters: listAuthoredCharacterEntries(),
    }
  }
  const data = await request('GET')
  reloadAuthoredCatalogue(data)
  return data
}

export async function saveAuthoredCharacterEntry(entry) {
  if (!canSaveAuthoredCharacters) {
    throw new Error('Saving authored characters needs the Vite DEV server.')
  }
  const data = await request('PUT', entry)
  reloadAuthoredCatalogue(data)
  return data
}

export async function deleteAuthoredCharacterEntry(id) {
  if (!canSaveAuthoredCharacters) {
    throw new Error('Deleting authored characters needs the Vite DEV server.')
  }
  const data = await request('DELETE', { id })
  reloadAuthoredCatalogue(data)
  return data
}
