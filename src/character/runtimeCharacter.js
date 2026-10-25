// RuntimeCharacter: the one in-game character model, built from a character export record (the JSON Export
// downloads and the saved files hold, and every authored person in adaptation/characters.json, see
// authoredCharacters.js). Player characters, allies and enemies all come through here, so every game system reads the
// same fields and never asks who controls the character. Read-only game data, never written back to the record; runtime
// state (condition, position, awareness) lives with the world actor or combatant that uses the character.
import attributeData from '../data/source/attributes.json'
import disciplineData from '../data/source/disciplines.json'
import finishingSource from '../data/source/finishingTouches.json'
import startingPoints from '../data/source/startingPoints.json'
import { SCHEMA_VERSION } from '../export/serializeCharacter.js'
import { getCharacterBackdrop, getPortraitById, getSpriteSet } from '../rules/appearance.js'
import { getCreatorFaction } from '../rules/factions.js'
import { getSpeciesAbility, getSpeciesDisplayName } from '../rules/species.js'
import { getUniformColour } from '../rules/uniform.js'
import { isPlainObject } from './isPlainObject.js'

export const ATTRIBUTE_IDS = attributeData.attributes.map((attribute) => attribute.id)
export const DISCIPLINE_IDS = disciplineData.disciplines.map((discipline) => discipline.id)

export const getAttributeName = (id) => attributeData.attributes.find((attribute) => attribute.id === id)?.name ?? id
export const getDisciplineName = (id) => disciplineData.disciplines.find((discipline) => discipline.id === id)?.name ?? id

const SCORE_RULES = {
  attributes: {
    min: startingPoints.attributeStart,
    max: startingPoints.finishedCharacterLimits.attributeMax,
    playerTotal: finishingSource.completeCharacter.attributeTotal,
  },
  disciplines: {
    // Authored NPC stat blocks legitimately use 0 for departments they do not have.
    min: startingPoints.disciplineStart,
    authoredMin: 0,
    max: startingPoints.finishedCharacterLimits.disciplineMax,
    playerTotal: finishingSource.completeCharacter.disciplineTotal,
  },
}

function readScores(scores, ids, label, { player }) {
  if (!isPlainObject(scores)) return { error: `The file has no final ${label}.` }
  const rules = SCORE_RULES[label]
  const missing = ids.filter((id) => !Number.isInteger(scores[id]))
  if (missing.length) return { error: `The file is missing ${label}: ${missing.join(', ')}.` }
  const values = Object.fromEntries(ids.map((id) => [id, scores[id]]))
  const min = player ? rules.min : (rules.authoredMin ?? rules.min)
  const outside = ids.filter((id) => values[id] < min || values[id] > rules.max)
  if (outside.length) return { error: `The file has ${label} outside ${min}-${rules.max}: ${outside.join(', ')}.` }
  const total = Object.values(values).reduce((sum, score) => sum + score, 0)
  if (player && total !== rules.playerTotal) return { error: `The file's ${label} total is ${total}; expected ${rules.playerTotal}.` }
  return { values }
}

const idName = (value) => (isPlainObject(value) && value.id ? { id: value.id, name: value.name ?? value.id } : null)

function schemaError(version) {
  if (version == null) return null
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) return `Unsupported character schema "${String(version)}".`
  const parts = version.split('.').map(Number)
  const supported = SCHEMA_VERSION.split('.').map(Number)
  const newer = parts.some((part, index) => part > supported[index] && parts.slice(0, index).every((earlier, earlierIndex) => earlier === supported[earlierIndex]))
  if (parts[0] !== supported[0] || newer) return `Unsupported character schema "${version}" (this build supports through ${SCHEMA_VERSION}).`
  return null
}

const schemaAtLeast = (version, minimum) => {
  if (!version) return false
  const parts = version.split('.').map(Number)
  const floor = minimum.split('.').map(Number)
  return parts.some((part, index) => part > floor[index] && parts.slice(0, index).every((earlier, earlierIndex) => earlier === floor[earlierIndex])) ||
    parts.every((part, index) => part === floor[index])
}

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
  const incompatible = schemaError(record.schemaVersion)
  if (incompatible) return { error: incompatible }
  const authored = record.sourceType === 'authored' || Boolean(record.sourceClassification) || typeof record.id === 'string'
  const details = isPlainObject(record.character) ? record.character : {}
  const identity = isPlainObject(details.identity) ? details.identity : {}
  const career = isPlainObject(details.career) ? details.career : {}

  const attributes = readScores(record.final.attributes, ATTRIBUTE_IDS, 'attributes', { player: !authored })
  if (attributes.error) return { error: attributes.error }
  const disciplines = readScores(record.final.disciplines, DISCIPLINE_IDS, 'disciplines', { player: !authored })
  if (disciplines.error) return { error: disciplines.error }
  if (!details.species?.id) return { error: 'The file has no species reference.' }
  if (schemaAtLeast(record.schemaVersion, '0.9.0') && !idName(record.final.faction ?? details.faction)) return { error: 'The file has no faction reference.' }
  if (schemaAtLeast(record.schemaVersion, '0.8.0') && !idName(record.final.department ?? career.department)) return { error: 'The file has no department reference.' }

  const portraitId = identity.portrait?.id ?? null
  const name = typeof identity.name === 'string' && identity.name.trim() ? identity.name.trim() : 'Unnamed Character'
  const strings = (list) => (Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [])
  const items = (list) => (Array.isArray(list) ? list.filter((item) => isPlainObject(item)) : [])
  // Exports before schema 0.9.0 carry none; they all come from the creator, whose characters share one faction.
  const faction = idName(record.final.faction ?? details.faction) ?? getCreatorFaction()
  const department = idName(record.final.department ?? career.department)
  const uniform = faction.id === getCreatorFaction().id ? getUniformColour(department?.id) : null

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
        image: identity.portrait?.image ?? getPortraitById(portraitId)?.image ?? null,
        // Shirt colour (rules/uniform.js); only Starfleet uniforms follow the department, other factions keep their art.
        uniform,
        // The colour the portrait picture is recoloured to: none for a character's own painted art (NPC portraits),
        // which is drawn already dressed. Map sprites still wear `uniform`.
        imageUniform: identity.portrait?.image ? null : uniform,
        // Drawn behind a layered head-and-shoulders portrait in panels; map figures leave it out.
        backdrop: getCharacterBackdrop(identity, department?.id).image,
        // The full-body figure on the maps (characterSprites.json), or null for the portrait token.
        spriteSet: getSpriteSet(portraitId)?.id ?? null,
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
      // The book stat block an authored character was based on ({ book, page, statBlock, npcCategory, personalThreat,
      // protection }), or null. Read for a placed NPC's default NPC rules (authoredCharacters.js npcRulesFor) and its
      // Personal Threat pool (rules/personalCondition.js); nothing else.
      sourceClassification: isPlainObject(record.sourceClassification) ? { ...record.sourceClassification } : null,
      source: { schemaVersion: record.schemaVersion ?? null, sourceType: record.sourceType ?? 'export' },
    },
  }
}
