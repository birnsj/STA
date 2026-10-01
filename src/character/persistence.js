import { createEmptyCharacter } from './characterModel.js'

// Bump when a saved character can no longer be read by the current code; older saves are then discarded.
const STORAGE_VERSION = 2
const CHARACTER_KEY = 'st-adventures.character'
// Where the player was (view and screen). UI state only: saved so a refresh returns there, never exported.
const LOCATION_KEY = 'st-adventures.location'
const SETTINGS_KEY = 'st-adventures.settings'
const SAVED_CHARACTERS_KEY = 'st-adventures.savedCharacters'
const SAVED_CHARACTERS_VERSION = 1

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or disabled: the creator keeps working without persistence.
  }
}

// Fills sections missing from saves made before a screen existed, so the rules always see the full shape.
function withCurrentShape(saved) {
  const empty = createEmptyCharacter()
  const character = { ...empty }
  for (const key of Object.keys(empty)) {
    if (!(key in saved)) continue
    character[key] = isPlainObject(empty[key]) && isPlainObject(saved[key]) ? { ...empty[key], ...saved[key] } : saved[key]
  }
  return character
}

export function loadCharacter() {
  const saved = read(CHARACTER_KEY)
  if (!isPlainObject(saved) || saved.version !== STORAGE_VERSION || !isPlainObject(saved.character)) return null
  return withCurrentShape(saved.character)
}

export function saveCharacter(character) {
  write(CHARACTER_KEY, { version: STORAGE_VERSION, character })
}

export function loadLocation() {
  const saved = read(LOCATION_KEY)
  return isPlainObject(saved) ? saved : {}
}

export function saveLocation(location) {
  write(LOCATION_KEY, location)
}

// Confirmed characters: [{ id, savedAt, name, record }], where record is the same object Export JSON downloads.
export function loadSavedCharacters() {
  const saved = read(SAVED_CHARACTERS_KEY)
  if (!isPlainObject(saved) || saved.version !== SAVED_CHARACTERS_VERSION || !Array.isArray(saved.characters)) return []
  return saved.characters.filter((entry) => isPlainObject(entry) && typeof entry.id === 'string' && isPlainObject(entry.record))
}

// The creator-state character inside a saved entry, upgraded to the current shape like the autosave.
export function readSavedCharacterData(entry) {
  return isPlainObject(entry?.record?.character) ? withCurrentShape(entry.record.character) : null
}

export function saveSavedCharacters(characters) {
  write(SAVED_CHARACTERS_KEY, { version: SAVED_CHARACTERS_VERSION, characters })
}

// Player preferences (Settings screen). Not character data; never exported.
export const loadSettings = () => read(SETTINGS_KEY)
export const saveSettings = (settings) => write(SETTINGS_KEY, settings)
