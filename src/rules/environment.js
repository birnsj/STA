import { withChoiceArt } from './choiceArt.js'
import environmentSource from '../data/source/environments.json'
import disciplineSource from '../data/source/disciplines.json'
import valuesMatrix from '../data/source/valuesMatrix.json'
import environmentAdaptation from '../data/adaptation/environment.json'
import { areAllMet } from './requirements.js'
import { getAttributes, getBaseSpecies, getOwnSpeciesIds, getPossibleBonusAttributeIds, getSpeciesById } from './species.js'

const settingsById = new Map(environmentSource.settings.map((entry) => [entry.id, entry]))
const conditionsById = new Map(environmentSource.conditions.map((entry) => [entry.id, entry]))
const disciplines = disciplineSource.disciplines
const BONUS_AMOUNT = 1

const toRef = (entry) => ({ id: entry.id, name: entry.name })

export function createEmptyEnvironment() {
  return {
    setting: null,
    condition: null,
    // Only used by the "Another Species' World" setting.
    otherSpecies: null,
    value: null,
    attributeBonus: null,
    disciplineBonus: null,
  }
}

export const getSettings = () => withChoiceArt('environment', environmentSource.settings)
export const getConditions = () => withChoiceArt('environment', environmentSource.conditions)
export const getSettingById = (id) => settingsById.get(id) ?? null
export const getConditionById = (id) => conditionsById.get(id) ?? null
export const getDisciplines = () => disciplines
export const getValueMatrix = () => valuesMatrix.values
export const isCustomValueAllowed = () => environmentAdaptation.allowCustomValue

// Book p.103: one setting OR condition; whichever is chosen supplies the bonus options.
function getBonusEntry(environment) {
  if (environment.setting) return getSettingById(environment.setting.id)
  return environment.condition ? getConditionById(environment.condition.id) : null
}

export const getChosenEntry = (environment) => environment.setting ?? environment.condition ?? null

export function requiresOtherSpecies(environment) {
  return getBonusEntry(environment)?.attributeOptions.type === 'otherSpeciesBonus'
}

export function getOtherSpeciesOptions(character) {
  const ownIds = getOwnSpeciesIds(character.species)
  return getBaseSpecies().filter((species) => !ownIds.includes(species.id))
}

export function getAttributeOptionRule(environment) {
  return getBonusEntry(environment)?.attributeOptions ?? null
}

export function getAttributeOptions(character) {
  const { environment } = character
  const rule = getAttributeOptionRule(environment)
  if (!rule) return []

  let allowedIds = []
  if (rule.type === 'list') {
    allowedIds = rule.attributes
  } else if (rule.type === 'speciesBonus') {
    allowedIds = character.species?.attributeBonuses.map((bonus) => bonus.id) ?? []
  } else if (rule.type === 'otherSpeciesBonus') {
    const otherSpecies = environment.otherSpecies && getSpeciesById(environment.otherSpecies.id)
    allowedIds = otherSpecies ? getPossibleBonusAttributeIds(otherSpecies) : []
  }
  return getAttributes().filter((attribute) => allowedIds.includes(attribute.id))
}

export function getDisciplineOptions(character) {
  const rule = getBonusEntry(character.environment)?.disciplineOptions
  if (!rule) return []
  if (rule.type === 'any') return disciplines
  return disciplines.filter((discipline) => rule.disciplines.includes(discipline.id))
}

export function selectSetting(environment, settingId) {
  const setting = getSettingById(settingId)
  if (!setting) throw new Error(`Unknown environment setting: ${settingId}`)
  return { ...environment, setting: toRef(setting), condition: null }
}

export function selectCondition(environment, conditionId) {
  const condition = getConditionById(conditionId)
  if (!condition) throw new Error(`Unknown environment condition: ${conditionId}`)
  return { ...environment, setting: null, condition: toRef(condition) }
}

export function selectOtherSpecies(environment, speciesId) {
  const species = speciesId ? getSpeciesById(speciesId) : null
  return { ...environment, otherSpecies: species ? toRef(species) : null }
}

export function selectMatrixValue(environment, valueId) {
  const entry = getValueMatrix().find((value) => value.id === valueId)
  if (!entry) throw new Error(`Unknown value: ${valueId}`)
  return { ...environment, value: { text: entry.text, matrixId: entry.id } }
}

export function setCustomValue(environment, text) {
  if (!isCustomValueAllowed()) return environment
  return { ...environment, value: { text, matrixId: null } }
}

export function selectAttributeBonus(character, attributeId) {
  const attribute = getAttributeOptions(character).find((option) => option.id === attributeId)
  if (!attribute) return character.environment
  return { ...character.environment, attributeBonus: { ...toRef(attribute), value: BONUS_AMOUNT } }
}

export function selectDisciplineBonus(character, disciplineId) {
  const discipline = getDisciplineOptions(character).find((option) => option.id === disciplineId)
  if (!discipline) return character.environment
  return { ...character.environment, disciplineBonus: { ...toRef(discipline), value: BONUS_AMOUNT } }
}

// Earlier choices (species, setting, other species) can invalidate later ones; drop anything no longer allowed.
export function reconcileEnvironment(character) {
  let environment = character.environment
  const keepOtherSpecies =
    requiresOtherSpecies(environment) && !getOwnSpeciesIds(character.species).includes(environment.otherSpecies?.id)
  if (environment.otherSpecies && !keepOtherSpecies) {
    environment = { ...environment, otherSpecies: null }
  }
  const next = { ...character, environment }
  const attributeId = environment.attributeBonus?.id
  if (attributeId && !getAttributeOptions(next).some((option) => option.id === attributeId)) {
    environment = { ...environment, attributeBonus: null }
  }
  const disciplineId = environment.disciplineBonus?.id
  if (disciplineId && !getDisciplineOptions(next).some((option) => option.id === disciplineId)) {
    environment = { ...environment, disciplineBonus: null }
  }
  return environment === character.environment ? character : { ...character, environment }
}

export function getEnvironmentRequirements(character) {
  const { environment } = character
  return {
    background: Boolean(getChosenEntry(environment)),
    value: Boolean(environment.value?.text.trim()),
    attributeBonus: Boolean(environment.attributeBonus) && (!requiresOtherSpecies(environment) || Boolean(environment.otherSpecies)),
    disciplineBonus: Boolean(environment.disciplineBonus),
  }
}

export const isEnvironmentStepComplete = (character) => areAllMet(getEnvironmentRequirements(character))
