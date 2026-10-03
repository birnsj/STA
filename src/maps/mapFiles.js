// Map files live in the project's maps/ folder, one {name}.json per map. The dev server reads and writes them live
// through its /__maps endpoint; built copies (Netlify, the desktop app) use the files bundled at build time, read-only.
import { parseMapFile, serializeMap } from './mapFormat.js'

const BUNDLED = import.meta.glob('/maps/*.json', { eager: true, import: 'default' })
const bundledEntries = () =>
  Object.entries(BUNDLED)
    .map(([file, record]) => {
      const id = file.slice('/maps/'.length, -'.json'.length)
      return { id, name: record.name || id, record }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

// Only the dev server can write files.
export const canSaveMaps = import.meta.env.DEV

async function callEndpoint(method, body) {
  const response = await fetch('/__maps', {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = await response.json()
  if (!response.ok || result?.error) throw new Error(result?.error ?? `${response.status} ${response.statusText}`)
  return result
}

// [{ id, name, record }]
const allEntries = () => (import.meta.env.DEV ? callEndpoint('GET') : Promise.resolve(bundledEntries()))

const summary = (entries) => entries.map(({ id, name, record }) => ({ id, name, episodeName: record?.episodeName ?? '', card: record?.card ?? null }))

// [{ id, name, episodeName, card }]
export async function listMaps() {
  return summary(await allEntries())
}

export async function loadMap(id) {
  const entry = (await allEntries()).find((other) => other.id === id)
  if (!entry) throw new Error('no such map file')
  return parseMapFile(entry.record, entry.id)
}

// Deletes maps/{id}.json. Returns the updated list of maps.
export async function deleteMap(id) {
  return summary(await callEndpoint('DELETE', { id }))
}

// Saves maps/{map.id}.json; previousId renames the file the map was opened from. Returns the updated list of maps.
export async function saveMap(map, previousId = null) {
  return summary(await callEndpoint('PUT', { id: map.id, previousId, record: serializeMap(map) }))
}
