// Every authored person in the game (adaptation/characters.json): Klingons, allies, civilians, anyone the world or an
// encounter places. Each entry becomes a character export record of exactly the shape the creator exports (the same
// schemaVersion, the creator's default character sections, final.speciesAbility / equipment / faction resolved the same
// way) and then a RuntimeCharacter through the same normalizer as a player character. There is no second schema.
// Mutable in DEV after Character Library Save/Delete so pickers refresh without a full reload.
import characterData from '../data/adaptation/characters.json'
import { SCHEMA_VERSION } from '../export/serializeCharacter.js'
import { getGenderById, getNpcBackdropById, getNpcPortraitById } from '../rules/appearance.js'
import { getEquippedItems } from '../rules/equipment.js'
import { getSpeciesAbility } from '../rules/species.js'
import { createEmptyCharacter } from './characterModel.js'
import { withCreatorShape } from './characterImport.js'
import { normalizeCharacterRecord } from './runtimeCharacter.js'

let catalogueNotes = Array.isArray(characterData.notes) ? [...characterData.notes] : []
let entriesById = buildIndex(characterData.characters || [])
let catalogueVersion = 0
const catalogueListeners = new Set()

function buildIndex(entries) {
  return new Map((entries || []).map((entry) => [entry.id, entry]))
}

function notifyCatalogue() {
  catalogueVersion += 1
  catalogueListeners.forEach((listener) => {
    try {
      listener(catalogueVersion)
    } catch {
      /* ignore subscriber errors */
    }
  })
}

export function getAuthoredCatalogueVersion() {
  return catalogueVersion
}

export function subscribeAuthoredCatalogue(listener) {
  catalogueListeners.add(listener)
  return () => catalogueListeners.delete(listener)
}

/** Replace the in-memory catalogue (after DEV disk write or delete). */
export function reloadAuthoredCatalogue(data) {
  const characters = Array.isArray(data?.characters) ? data.characters : Array.isArray(data) ? data : []
  catalogueNotes = Array.isArray(data?.notes) ? [...data.notes] : catalogueNotes
  entriesById = buildIndex(characters)
  notifyCatalogue()
  return listAuthoredCharacters()
}

export function listAuthoredCatalogueNotes() {
  return [...catalogueNotes]
}

export function listAuthoredCharacterEntries() {
  return [...entriesById.values()].map((entry) => structuredClone(entry))
}

// [{ id, name, faction?, playtestParty? }] of every authored character, for pickers (the map editor's NPC tool).
export function listAuthoredCharacters() {
  return [...entriesById.values()].map((entry) => ({
    id: entry.id,
    name: entry.character?.identity?.name || entry.id,
    faction: entry.character?.faction || 'unknown',
    playtestParty: Boolean(entry.playtestParty),
  }))
}

// Authored ids marked playtestParty (the map editor's default away team: redshirt ensigns).
export const listPlaytestPartyIds = () =>
  [...entriesById.values()].filter((entry) => entry.playtestParty).map((entry) => entry.id)

// RuntimeCharacters for the editor Play / party pickers (up to `limit`; there are four authored redshirts).
export function getPlaytestParty(limit = 8) {
  return listPlaytestPartyIds()
    .slice(0, Math.max(0, limit))
    .map((id) => getAuthoredCharacter(id))
}

// Import-screen entries for the playtest ensigns: the same { id, name, record } shape as a saved character, but not a
// save (playtest: true). Importing one opens it in the creator; it is written to the saved list only if confirmed.
export function playtestImportEntries() {
  return listPlaytestPartyIds()
    .map((id) => {
      const record = getAuthoredRecord(id)
      if (!record) return null
      return { id, name: record.character.identity?.name?.trim() || id, savedAt: null, record, playtest: true }
    })
    .filter(Boolean)
}

// The full character record for an authored character id, or null.
export function getAuthoredRecord(characterId) {
  const entry = entriesById.get(characterId)
  if (!entry) return null
  const character = withCreatorShape(structuredClone(entry.character), createEmptyCharacter())
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

// The NPC rules a placed NPC or enemy plays under (VIDEOGAME ADAPTATION, designer decision 2026-10-20): the one the map
// or encounter authors ('main' = the full character rules), else the book category of the stat block the character was
// transcribed from (sourceClassification.npcCategory), else none (full character rules). Only placements use this: a
// character in the away team never does, whatever stat block it came from.
const NPC_CATEGORIES = ['supporting', 'minor', 'notable', 'major']
export function npcRulesFor(characterId, authored = null) {
  if (authored) return authored
  const category = entriesById.get(characterId)?.sourceClassification?.npcCategory
  return NPC_CATEGORIES.includes(category) ? category : null
}

export function hasAuthoredCharacter(id) {
  return entriesById.has(id)
}

/**
 * Stable camelCase id from a display name. Adds a numeric suffix on collision
 * unless `excludeId` is the same id (edit rename of display name only).
 */
export function allocateAuthoredCharacterId(name, { excludeId = null } = {}) {
  const base = slugifyCharacterId(name)
  if (!entriesById.has(base) || base === excludeId) return base
  let n = 2
  while (entriesById.has(`${base}${n}`)) n += 1
  return `${base}${n}`
}

function slugifyCharacterId(name) {
  const raw = String(name || '')
    .trim()
    .replace(/['']/g, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
  if (raw.length === 0) return 'character'
  const [first, ...rest] = raw
  const camel =
    first.charAt(0).toLowerCase() +
    first.slice(1).replace(/[^a-zA-Z0-9]/g, '') +
    rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1).replace(/[^a-zA-Z0-9]/g, '')).join('')
  const cleaned = camel.replace(/[^a-zA-Z0-9_-]/g, '')
  if (!cleaned) return 'character'
  if (!/^[a-zA-Z]/.test(cleaned)) return `c${cleaned}`
  return cleaned.slice(0, 80)
}
