import { serializeCharacter } from '../export/serializeCharacter.js'
import {
  insertSavedCharacterAfter,
  loadSavedCharacters,
  putSavedCharacter,
  readSavedCharacterData,
  removeSavedCharacter,
} from './persistence.js'

export const getSavedCharacters = loadSavedCharacters
export const getSavedCharacterData = readSavedCharacterData

// Browser saves keep this id; saved files replace it with one based on the character's name.
const newSavedId = () => crypto.randomUUID().slice(0, 8)

export function deleteSavedCharacter(id) {
  removeSavedCharacter(id)
  return loadSavedCharacters()
}

// Dev: empties the saved list for testing.
export function deleteAllSavedCharacters() {
  loadSavedCharacters().forEach((entry) => removeSavedCharacter(entry.id))
  return loadSavedCharacters()
}

// Dev: copies an entry (new id) so the list can be filled for testing.
export function duplicateSavedCharacter(id) {
  const original = loadSavedCharacters().find((entry) => entry.id === id)
  if (original) insertSavedCharacterAfter(id, { ...original, id: newSavedId() })
  return loadSavedCharacters()
}

// Adds a confirmed character to the saved list, or replaces its earlier entry when savedId is given
// (the player went back to edit a character they had already confirmed). Returns the entry id and the new list.
export function saveConfirmedCharacter(character, savedId = null) {
  const existingId = savedId && loadSavedCharacters().some((entry) => entry.id === savedId) ? savedId : newSavedId()
  const id = putSavedCharacter({
    id: existingId,
    savedAt: new Date().toISOString(),
    name: character.identity.name.trim(),
    record: serializeCharacter(character),
  })
  return { id, characters: loadSavedCharacters() }
}
