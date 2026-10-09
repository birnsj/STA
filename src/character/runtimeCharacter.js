// RuntimeCharacter: the one in-game character model, built from a character export record (the JSON Export
// downloads and the saved files hold, and every authored person in adaptation/characters.json, see
// authoredCharacters.js). Player characters, allies and enemies all come through here, so every game system reads the
// same fields and never asks who controls the character. Read-only game data, never written back to the record; runtime
// state (condition, position, awareness) lives with the world actor or combatant that uses the character.
import attributeData from '../data/source/attributes.json'
import disciplineData from '../data/source/disciplines.json'
import { getPortraitById } from '../rules/appearance.js'
import { getCreatorFaction } from '../rules/factions.js'
import { getSpeciesAbility, getSpeciesDisplayName } from '../rules/species.js'
import { getUniformColour } from '../rules/uniform.js'

export const ATTRIBUTE_IDS = attributeData.attributes.map((attribute) => attribute.id)
export const DISCIPLINE_IDS = disciplineData.disciplines.map((discipline) => discipline.id)

export const getAttributeName = (id) => attributeData.attributes.find((attribute) => attribute.id === id)?.name ?? id
export const getDisciplineName = (id) => disciplineData.disciplines.find((discipline) => discipline.id === id)?.name ?? id

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isScore = (value) => Number.isInteger(value) && value >= 0

function readScores(scores, ids, label) {
  if (!isPlainObject(scores)) return { error: `The file has no final ${label}.` }
  const missing = ids.filter((id) => !isScore(scores[id]))
  if (missing.length) return { error: `The file is missing ${label}: ${missing.join(', ')}.` }
  return { values: Object.fromEntries(ids.map((id) => [id, scores[id]])) }
}

const idName = (value) => (isPlainObject(value) && value.id ? { id: value.id, name: value.name ?? value.id } : null)

function readSpeciesAbility(ability) {
  if (!isPlainObject(ability) || !ability.id) return null
  return {
    id: ability.id,
    name: ability.name ?? ability.id,
    description: typeof ability.description === 'string' ? ability.description : '',
    effects: Array.isArray(ability.effects) ? ability.effects.filter(isPlainObject) : [],
  }
}

function readRole(role) {
  if (!isPlainObject(role) || !role.id) return null
  const benefit = isPlainObject(role.benefit) ? role.benefit : {}
  return {
    id: role.id,
    name: role.name ?? role.id,
    benefit: {
      id: benefit.id ?? role.id,
      name: benefit.name ?? null,
      description: typeof benefit.description === 'string' ? benefit.description : '',
      effects: Array.isArray(benefit.effects) ? benefit.effects.filter(isPlainObject) : [],
    },
  }
}

function readTalent(talent) {
  return {
    id: talent.id,
    name: talent.name ?? talent.id,
    choice: idName(talent.choice),
    description: typeof talent.description === 'string' ? talent.description : '',
    effects: Array.isArray(talent.effects) ? talent.effects.filter(isPlainObject) : [],
    step: talent.source?.step ?? null,
  }
}

// Returns { character } or { error } (a message for the player when the JSON is not a usable character export).
export function normalizeCharacterRecord(record, { id } = {}) {
  if (!isPlainObject(record) || !isPlainObject(record.final)) return { error: 'This is not a character export (no "final" section).' }
  const attributes = readScores(record.final.attributes, ATTRIBUTE_IDS, 'attributes')
  if (attributes.error) return { error: attributes.error }
  const disciplines = readScores(record.final.disciplines, DISCIPLINE_IDS, 'disciplines')
  if (disciplines.error) return { error: disciplines.error }

  const details = isPlainObject(record.character) ? record.character : {}
  const identity = isPlainObject(details.identity) ? details.identity : {}
  const career = isPlainObject(details.career) ? details.career : {}
  const portraitId = identity.portrait?.id ?? null
  const name = typeof identity.name === 'string' && identity.name.trim() ? identity.name.trim() : 'Unnamed Character'
  const strings = (list) => (Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [])
  const items = (list) => (Array.isArray(list) ? list.filter((item) => isPlainObject(item)) : [])
  // Exports before schema 0.9.0 carry none; they all come from the creator, whose characters share one faction.
  const faction = idName(record.final.faction ?? details.faction) ?? getCreatorFaction()
  const department = idName(career.department)

  return {
    character: {
      id: id ?? name,
      name,
      faction,
      pronouns: typeof identity.pronouns === 'string' ? identity.pronouns : '',
      species: details.species ? { id: details.species.id ?? null, name: getSpeciesDisplayName(details.species) ?? '' } : null,
      portrait: {
        id: portraitId,
        name: identity.portrait?.name ?? name,
        image: getPortraitById(portraitId)?.image ?? identity.portrait?.image ?? null,
        // Shirt colour (rules/uniform.js); only Starfleet uniforms follow the department, other factions keep their art.
        uniform: faction.id === getCreatorFaction().id ? getUniformColour(department?.id) : null,
      },
      rank: idName(career.rank),
      department,
      assignment: idName(career.assignment),
      // Data only for now; exports before schema 0.8.0 have none.
      role: readRole(record.final.role),
      attributes: attributes.values,
      disciplines: disciplines.values,
      focuses: strings(record.final.focuses),
      values: strings(record.final.values),
      traits: items(record.final.traits).map((trait) => ({ id: trait.id ?? null, name: trait.name ?? '' })),
      // Exports before schema 0.6.0 have none stored: the character then gets their species' ability from the species data.
      speciesAbility: readSpeciesAbility(record.final.speciesAbility ?? getSpeciesAbility(details.species)),
      // Data only for now; exports before schema 0.7.0 have none.
      talents: items(record.final.talents).filter((talent) => talent.id).map(readTalent),
      equipment: items(record.final.equipment).map((item) => ({ itemId: item.itemId, name: item.name ?? item.itemId })),
      // Metadata only, never read by the rules: the book stat block an authored character was based on
      // ({ book, page, statBlock, npcCategory, personalThreat, protection }), or null.
      sourceClassification: isPlainObject(record.sourceClassification) ? { ...record.sourceClassification } : null,
      source: { schemaVersion: record.schemaVersion ?? null, sourceType: record.sourceType ?? 'export' },
    },
  }
}
