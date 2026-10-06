// Every authored person in the game (adaptation/characters.json): Klingons, allies, civilians, anyone the world or an
// encounter places. Each entry becomes a character export record of exactly the shape the creator exports (the same
// schemaVersion, the creator's default character sections, final.speciesAbility / equipment / faction resolved the same
// way) and then a RuntimeCharacter through the same normalizer as a player character. There is no second schema.
import characterData from '../data/adaptation/characters.json'
import { SCHEMA_VERSION } from '../export/serializeCharacter.js'
import { getEquippedItems } from '../rules/equipment.js'
import { getSpeciesAbility, withSpeciesAbility } from '../rules/species.js'
import { createEmptyCharacter } from './characterModel.js'
import { normalizeCharacterRecord } from './runtimeCharacter.js'

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const entriesById = new Map(characterData.characters.map((entry) => [entry.id, entry]))

// The creator's default sections, with the entry's own on top (one level deep, as persistence.js upgrades saves).
function withCreatorShape(authored) {
  const character = createEmptyCharacter()
  Object.entries(authored).forEach(([key, value]) => {
    character[key] = isPlainObject(character[key]) && isPlainObject(value) ? { ...character[key], ...value } : value
  })
  return { ...character, species: withSpeciesAbility(character.species) }
}

// The full character record for an authored character id, or null.
export function getAuthoredRecord(characterId) {
  const entry = entriesById.get(characterId)
  if (!entry) return null
  const character = withCreatorShape(entry.character)
  return {
    schemaVersion: SCHEMA_VERSION,
    sourceType: 'authored',
    status: { confirmed: true, authored: true },
    sourceClassification: entry.sourceClassification ?? null,
    character,
    final: {
      faction: character.faction,
      ...entry.final,
      speciesAbility: getSpeciesAbility(character.species),
      equipment: getEquippedItems(character).map(({ id, name }) => ({ itemId: id, name })),
    },
  }
}

// The RuntimeCharacter for an authored character id (its id is the character id). npcRules: the book's streamlined
// NPC rules ('minor' | 'notable' | 'major'), only when an actor or encounter explicitly authors them for this instance.
export function getAuthoredCharacter(characterId, { npcRules = null } = {}) {
  const record = getAuthoredRecord(characterId)
  if (!record) throw new Error(`Unknown character: ${characterId}`)
  const { character, error } = normalizeCharacterRecord(record, { id: characterId })
  if (error) throw new Error(`Character ${characterId}: ${error}`)
  return npcRules ? { ...character, npcRules } : character
}
