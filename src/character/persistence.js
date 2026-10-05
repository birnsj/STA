import { createEmptyCharacter } from './characterModel.js'
import { devCharacterFiles } from './devCharacterFiles.js'
import { getSpeciesById, withSpeciesAbility } from '../rules/species.js'

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
  if (isPlainObject(character.species) && getSpeciesById(character.species.id)) character.species = withSpeciesAbility(character.species)
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
// The desktop app (electron/preload.cjs) and the dev server keep each one as its own .json file in ./characters;
// a static build (Netlify) keeps the list in local storage.
const characterFiles = globalThis.window?.characterFiles ?? (import.meta.env.DEV ? devCharacterFiles : null)

const isValidEntry = (entry) => isPlainObject(entry) && typeof entry.id === 'string' && isPlainObject(entry.record)

function readStoredList() {
  const saved = read(SAVED_CHARACTERS_KEY)
  if (!isPlainObject(saved) || saved.version !== SAVED_CHARACTERS_VERSION || !Array.isArray(saved.characters)) return []
  return saved.characters.filter(isValidEntry)
}

const writeStoredList = (characters) => write(SAVED_CHARACTERS_KEY, { version: SAVED_CHARACTERS_VERSION, characters })

// Characters saved in the browser before files were used move from local storage into files once.
if (characterFiles) {
  const stored = readStoredList()
  if (stored.length) {
    stored.forEach((entry) => characterFiles.put(entry))
    localStorage.removeItem(SAVED_CHARACTERS_KEY)
  }
}

export function loadSavedCharacters() {
  return characterFiles ? characterFiles.list().filter(isValidEntry) : readStoredList()
}

// Adds the entry, or replaces the one with the same id (keeping its place in the list). Returns the id it was
// saved under: files are named after the character and species, so their id changes when either does.
export function putSavedCharacter(entry) {
  if (characterFiles) return characterFiles.put(entry)
  const characters = readStoredList()
  const exists = characters.some((existing) => existing.id === entry.id)
  writeStoredList(exists ? characters.map((existing) => (existing.id === entry.id ? entry : existing)) : [...characters, entry])
  return entry.id
}

// Dev duplicate: the browser list places the copy right after the original; files list by creation time.
export function insertSavedCharacterAfter(afterId, entry) {
  if (characterFiles) return characterFiles.put(entry)
  const characters = readStoredList()
  const index = characters.findIndex((existing) => existing.id === afterId)
  const next = [...characters]
  next.splice(index < 0 ? next.length : index + 1, 0, entry)
  writeStoredList(next)
}

export function removeSavedCharacter(id) {
  if (characterFiles) return characterFiles.remove(id)
  writeStoredList(readStoredList().filter((entry) => entry.id !== id))
}

// The creator-state character inside a saved entry, upgraded to the current shape like the autosave.
export function readSavedCharacterData(entry) {
  return isPlainObject(entry?.record?.character) ? withCurrentShape(entry.record.character) : null
}

// Player preferences (Settings screen). Not character data; never exported.
export const loadSettings = () => read(SETTINGS_KEY)
export const saveSettings = (settings) => write(SETTINGS_KEY, settings)
