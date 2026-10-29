// Shared party-picker roster: saved characters, authored playtest redshirts, then loaded files.
import { getPlaytestParty } from './authoredCharacters.js'
import { normalizeCharacterRecord } from './runtimeCharacter.js'

function asEntry(character, group, label = null) {
  return {
    id: character.id,
    label: label || character.name || character.id,
    character,
    error: null,
    group,
  }
}

// [{ id, label, character, error, group }] for ExplorationSetup / CombatSetup.
// Order: saved → playtest redshirts → loaded files.
// A save that reuses an authored id wins; later groups skip already-listed ids.
export function partyPickerRoster(savedCharacters, { loaded = [] } = {}) {
  const listed = new Set()
  const saved = savedCharacters.map((entry) => {
    listed.add(entry.id)
    const { character, error } = normalizeCharacterRecord(entry.record, { id: entry.id })
    return { id: entry.id, label: entry.name || entry.id, character, error, group: 'saved' }
  })
  const playtest = getPlaytestParty()
    .filter((character) => character && !listed.has(character.id))
    .map((character) => {
      listed.add(character.id)
      return asEntry(character, 'playtest')
    })
  const files = loaded
    .filter((character) => character && !listed.has(character.id))
    .map((character) => {
      listed.add(character.id)
      return asEntry(character, 'file', `${character.name} (file)`)
    })
  return [...saved, ...playtest, ...files]
}

// Section labels for grouped pickers (ExplorationSetup). Empty groups are omitted by the caller.
export const ROSTER_GROUP_LABELS = {
  saved: 'Saved Characters',
  playtest: 'Playtest Ensigns',
  file: 'Imported Files',
}
