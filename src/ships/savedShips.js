import { shipDisplayName } from './shipModel.js'
import { persistedShip } from './persistence.js'

// Confirmed ships: [{ id, savedAt, name, record }]. record is the same object Export JSON downloads.
// Separate from the in-progress draft and from the saved-character list.
const SAVED_SHIPS_KEY = 'st-adventures.savedShips'
const LIST_VERSION = 1

function readList() {
  try {
    const stored = JSON.parse(localStorage.getItem(SAVED_SHIPS_KEY))
    if (!stored || stored.version !== LIST_VERSION || !Array.isArray(stored.ships)) return []
    return stored.ships.filter((entry) => entry && typeof entry.id === 'string' && entry.record)
  } catch {
    return []
  }
}

function writeList(ships) {
  localStorage.setItem(SAVED_SHIPS_KEY, JSON.stringify({ version: LIST_VERSION, ships }))
}

export function loadSavedShips() {
  return readList()
}

// Adds the ship, or replaces the entry with savedId. Returns the id and the list.
export function saveConfirmedShip(ship, savedId = null) {
  const ships = readList()
  const id = savedId && ships.some((entry) => entry.id === savedId)
    ? savedId
    : (globalThis.crypto?.randomUUID?.() ?? `ship-${Date.now()}`)
  const entry = {
    id,
    savedAt: new Date().toISOString(),
    name: shipDisplayName(ship) || 'Unnamed ship',
    record: persistedShip(ship),
  }
  const next = ships.some((existing) => existing.id === id)
    ? ships.map((existing) => (existing.id === id ? entry : existing))
    : [...ships, entry]
  try {
    writeList(next)
  } catch {
    // Storage full or disabled: the screen keeps the ship in the draft.
  }
  return { id, ships: next }
}

export function deleteSavedShip(id) {
  const next = readList().filter((entry) => entry.id !== id)
  try {
    writeList(next)
  } catch {
    // Leave the previous list in place if storage cannot be written.
  }
  return next
}
