// Build / validate authored pool entries for Character Library Save (characters.json shape).
import { serializeCharacter } from '../export/serializeCharacter.js'
import { isCharacterValid } from '../rules/characterValidation.js'
import { getFinalScores } from '../rules/finishingTouches.js'
import { allocateAuthoredCharacterId } from './authoredCharacters.js'
import { ATTRIBUTE_IDS as ATTR_KEYS, DISCIPLINE_IDS as DISC_KEYS } from './runtimeCharacter.js'

function hasScoreBlock(block, keys) {
  if (!block || typeof block !== 'object') return false
  return keys.every((key) => typeof block[key] === 'number')
}

function fullyValid(character) {
  try {
    return isCharacterValid(character)
  } catch {
    // Partial authored sheets (no lifepath sections) can throw inside step checks.
    return false
  }
}

/** New characters must pass full creator validation. */
export function canSaveNewAuthoredCharacter(character) {
  return fullyValid(character)
}

/**
 * Edit of an existing pool entry: full validation, or soft completeness
 * (name, species, attrs/disciplines from compute or previous final, equipment array).
 */
export function canSaveAuthoredEdit(character, previousFinal = null) {
  if (fullyValid(character)) return true
  const name = character?.identity?.name?.trim()
  if (!name || !character?.species?.id) return false
  if (!Array.isArray(character.equipment)) return false
  let attrs = previousFinal?.attributes
  let discs = previousFinal?.disciplines
  try {
    attrs = getFinalScores(character, 'attributes') || attrs
    discs = getFinalScores(character, 'disciplines') || discs
  } catch {
    /* keep previousFinal */
  }
  return hasScoreBlock(attrs, ATTR_KEYS) && hasScoreBlock(discs, DISC_KEYS)
}

export function authoredSaveIssues(character, { isNew = false, previousFinal = null } = {}) {
  if (isNew) {
    return fullyValid(character) ? [] : ['Finish the character (all creation screens) before saving a new pool entry.']
  }
  if (canSaveAuthoredEdit(character, previousFinal)) return []
  const issues = []
  if (!character?.identity?.name?.trim()) issues.push('Name is required.')
  if (!character?.species?.id) issues.push('Species is required.')
  if (!Array.isArray(character?.equipment)) issues.push('Equipment list is required.')
  let attrs = previousFinal?.attributes
  let discs = previousFinal?.disciplines
  try {
    attrs = getFinalScores(character, 'attributes') || attrs
    discs = getFinalScores(character, 'disciplines') || discs
  } catch {
    /* keep previousFinal */
  }
  if (!hasScoreBlock(attrs, ATTR_KEYS)) issues.push('Final attributes are required.')
  if (!hasScoreBlock(discs, DISC_KEYS)) issues.push('Final disciplines are required.')
  return issues.length ? issues : ['Character is not complete enough to save.']
}

/**
 * Pool entry for characters.json. Soft edits keep previous final scores when the
 * creator cannot yet recompute them (partial Klingon / engineer sheets).
 */
export function buildAuthoredPoolEntry({
  id,
  character,
  previousEntry = null,
  playtestParty = false,
  sourceClassification = null,
}) {
  const previousFinal = previousEntry?.final || null
  const soft = !fullyValid(character) && previousFinal
  let serialized
  try {
    serialized = serializeCharacter(character)
  } catch {
    // Partial sheets: store the draft character sections and keep previous final scores.
    serialized = {
      character: JSON.parse(JSON.stringify(character)),
      final: previousFinal,
    }
  }
  const final = soft
    ? {
        ...previousFinal,
        faction: serialized.final?.faction ?? previousFinal.faction,
        attributes: serialized.final?.attributes ?? previousFinal.attributes,
        disciplines: serialized.final?.disciplines ?? previousFinal.disciplines,
        values: serialized.final?.values?.length ? serialized.final.values : previousFinal.values,
        focuses: serialized.final?.focuses ?? previousFinal.focuses,
        traits: serialized.final?.traits?.length ? serialized.final.traits : previousFinal.traits,
        talents: serialized.final?.talents?.length ? serialized.final.talents : previousFinal.talents,
        speciesAbility: serialized.final?.speciesAbility ?? previousFinal.speciesAbility,
        equipment: serialized.final?.equipment ?? previousFinal.equipment,
        rank: serialized.final?.rank ?? previousFinal.rank,
        department: serialized.final?.department ?? previousFinal.department,
        assignment: serialized.final?.assignment ?? previousFinal.assignment,
        role: serialized.final?.role ?? previousFinal.role,
      }
    : serialized.final

  const entry = {
    id,
    character: serialized.character,
    final,
  }
  const playtest = playtestParty || Boolean(previousEntry?.playtestParty)
  if (playtest) entry.playtestParty = true
  const classification = sourceClassification ?? previousEntry?.sourceClassification
  if (classification) entry.sourceClassification = classification
  return entry
}

export function newAuthoredCharacterId(name) {
  return allocateAuthoredCharacterId(name)
}

export function duplicateAuthoredEntry(entry) {
  const name = entry?.character?.identity?.name || entry?.id || 'Character'
  const copyName = `${name} Copy`
  const id = allocateAuthoredCharacterId(copyName)
  const character = structuredClone(entry.character)
  if (character.identity) character.identity = { ...character.identity, name: copyName }
  return {
    id,
    playtestParty: false,
    sourceClassification: entry.sourceClassification ? structuredClone(entry.sourceClassification) : undefined,
    character,
    final: structuredClone(entry.final),
  }
}
