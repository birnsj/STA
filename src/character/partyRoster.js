// Shared party-picker roster: saved characters plus authored playtest redshirts (characters.json playtestParty).
import { getPlaytestParty } from './authoredCharacters.js'
import { normalizeCharacterRecord } from './runtimeCharacter.js'

// [{ id, label, character, error }] for ExplorationSetup / CombatSetup. Saved entries first, then playtest
// redshirts not already listed (a save that reuses an authored id wins).
export function partyPickerRoster(savedCharacters, { loaded = [] } = {}) {
  const saved = savedCharacters.map((entry) => {
    const { character, error } = normalizeCharacterRecord(entry.record, { id: entry.id })
    return { id: entry.id, label: entry.name || entry.id, character, error }
  })
  const listed = new Set(saved.map((entry) => entry.id))
  const playtest = getPlaytestParty()
    .filter((character) => character && !listed.has(character.id))
    .map((character) => {
      listed.add(character.id)
      return { id: character.id, label: character.name || character.id, character, error: null }
    })
  const files = loaded
    .filter((character) => character && !listed.has(character.id))
    .map((character) => {
      listed.add(character.id)
      return { id: character.id, label: `${character.name} (file)`, character, error: null }
    })
  return [...saved, ...playtest, ...files]
}
