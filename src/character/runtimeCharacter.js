// RuntimeCharacter: the one in-game character model, built from a character export record (the JSON Export
// downloads and the saved files hold). Players and NPCs both come through here so every game system (combat now;
// dialogue, investigation, etc. later) reads the same fields. Read-only game data, never written back to the export.
import attributeData from '../data/source/attributes.json'
import disciplineData from '../data/source/disciplines.json'
import { getPortraitById } from '../rules/appearance.js'
import { getSpeciesDisplayName } from '../rules/species.js'

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

  return {
    character: {
      id: id ?? name,
      name,
      pronouns: typeof identity.pronouns === 'string' ? identity.pronouns : '',
      species: details.species ? { id: details.species.id ?? null, name: getSpeciesDisplayName(details.species) ?? '' } : null,
      portrait: {
        id: portraitId,
        name: identity.portrait?.name ?? name,
        image: getPortraitById(portraitId)?.image ?? identity.portrait?.image ?? null,
      },
      rank: idName(career.rank),
      department: idName(career.department),
      assignment: idName(career.assignment),
      attributes: attributes.values,
      disciplines: disciplines.values,
      focuses: strings(record.final.focuses),
      values: strings(record.final.values),
      traits: items(record.final.traits).map((trait) => ({ id: trait.id ?? null, name: trait.name ?? '' })),
      equipment: items(record.final.equipment).map((item) => ({ itemId: item.itemId, name: item.name ?? item.itemId })),
      source: { schemaVersion: record.schemaVersion ?? null, sourceType: record.sourceType ?? 'export' },
    },
  }
}
