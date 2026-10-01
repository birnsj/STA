import { serializeCharacter } from '../export/serializeCharacter.js'
import { loadSavedCharacters, readSavedCharacterData, saveSavedCharacters } from './persistence.js'

export const getSavedCharacters = loadSavedCharacters
export const getSavedCharacterData = readSavedCharacterData

export function deleteSavedCharacter(id) {
  const next = loadSavedCharacters().filter((entry) => entry.id !== id)
  saveSavedCharacters(next)
  return next
}

// Dev: copies an entry (new id, placed right after it) so the list can be filled for testing.
export function duplicateSavedCharacter(id) {
  const characters = loadSavedCharacters()
  const index = characters.findIndex((entry) => entry.id === id)
  if (index < 0) return characters
  const next = [...characters]
  next.splice(index + 1, 0, { ...characters[index], id: crypto.randomUUID() })
  saveSavedCharacters(next)
  return next
}

// Adds a confirmed character to the saved list, or replaces its earlier entry when savedId is given
// (the player went back to edit a character they had already confirmed). Returns the entry id and the new list.
export function saveConfirmedCharacter(character, savedId = null) {
  const characters = loadSavedCharacters()
  const id = savedId && characters.some((entry) => entry.id === savedId) ? savedId : crypto.randomUUID()
  const entry = {
    id,
    savedAt: new Date().toISOString(),
    name: character.identity.name.trim(),
    record: serializeCharacter(character),
  }
  const next = characters.some((existing) => existing.id === id)
    ? characters.map((existing) => (existing.id === id ? entry : existing))
    : [...characters, entry]
  saveSavedCharacters(next)
  return { id, characters: next }
}
