// Every authored person in the game (adaptation/characters.json): Klingons, allies, civilians, anyone the world or an
// encounter places. Each entry becomes a character export record of exactly the shape the creator exports (the same
// schemaVersion, the creator's default character sections, final.speciesAbility / equipment / faction resolved the same
// way) and then a RuntimeCharacter through the same normalizer as a player character. There is no second schema.
import characterData from '../data/adaptation/characters.json'
import { SCHEMA_VERSION } from '../export/serializeCharacter.js'
import { getGenderById, getNpcBackdropById, getNpcPortraitById } from '../rules/appearance.js'
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

// [{ id, name }] of every authored character, for pickers (the map editor's NPC tool).
export const listAuthoredCharacters = () => characterData.characters.map((entry) => ({ id: entry.id, name: entry.character.identity?.name || entry.id }))

// Authored ids marked playtestParty (the map editor's default away team: redshirt ensigns).
export const listPlaytestPartyIds = () => characterData.characters.filter((entry) => entry.playtestParty).map((entry) => entry.id)

// RuntimeCharacters for the editor Play team (up to `limit`).
export function getPlaytestParty(limit = 4) {
  return listPlaytestPartyIds()
    .slice(0, Math.max(0, limit))
    .map((id) => getAuthoredCharacter(id))
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

// Pronouns only change with the gender for an NPC shown as the other gender than authored (presentation only).
const PRONOUNS = { male: 'He / him', female: 'She / her' }
function withAppearance(record, { genderId, portraitId, backdropId = null }) {
  const portrait = getNpcPortraitById(portraitId)
  const gender = getGenderById(genderId)
  if (!portrait || !gender) return record
  const identity = record.character.identity ?? {}
  const pronouns = identity.gender?.id === gender.id ? identity.pronouns : (PRONOUNS[gender.id] ?? identity.pronouns)
  const backdrop = getNpcBackdropById(backdropId)
  const shown = {
    ...identity,
    gender: { id: gender.id, name: gender.name },
    pronouns,
    portrait: { id: portrait.id, name: portrait.name, image: portrait.image },
    backdrop: backdrop ? { id: backdrop.id, name: backdrop.name } : (identity.backdrop ?? null),
  }
  return { ...record, character: { ...record.character, identity: shown } }
}

// The RuntimeCharacter for an authored character id (its id is the character id). npcRules: the book's streamlined
// NPC rules ('minor' | 'notable' | 'major'), only when an actor or encounter explicitly authors them for this instance.
// appearance: { genderId, portraitId, backdropId } from npcAppearance.js assignNpcAppearances, or null for the
// authored portrait.
export function getAuthoredCharacter(characterId, { npcRules = null, appearance = null } = {}) {
  const authored = getAuthoredRecord(characterId)
  if (!authored) throw new Error(`Unknown character: ${characterId}`)
  const record = appearance ? withAppearance(authored, appearance) : authored
  const { character, error } = normalizeCharacterRecord(record, { id: characterId })
  if (error) throw new Error(`Character ${characterId}: ${error}`)
  return npcRules ? { ...character, npcRules } : character
}
