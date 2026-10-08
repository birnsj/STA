import educationSource from '../data/source/education.json'
import disciplineSource from '../data/source/disciplines.json'
import educationAdaptation from '../data/adaptation/education.json'
import { areAllMet } from './requirements.js'
import { withChoiceArt } from './choiceArt.js'
import { isBookFocus } from './focuses.js'
import { getAttributes } from './species.js'
import { getDisciplineTotalsBeforeEducation } from './characterTotals.js'
import { isTalentSlotMet } from './talents.js'
import { getSampleValues } from './values.js'

const categoriesById = new Map(educationSource.categories.map((category) => [category.id, category]))
const optionsById = new Map(educationSource.options.map((option) => [option.id, option]))
const disciplines = disciplineSource.disciplines
const disciplinesById = new Map(disciplines.map((discipline) => [discipline.id, discipline]))
const { total: ATTRIBUTE_POINTS, maxPerAttribute: MAX_PER_ATTRIBUTE } = educationSource.attributePoints
const FOCUS_COUNT = educationSource.focusCount
const MAJOR_AMOUNT = 2
const MINOR_AMOUNT = 1

const toRef = (entry) => ({ id: entry.id, name: entry.name })

export function createEmptyEducation() {
  return {
    category: null,
    option: null,
    attributeBonuses: [],
    // The player's discipline picks; disciplineBonuses is the resulting set of changes.
    disciplinePicks: { major: null, minors: [], swapFrom: null, swapTo: null },
    disciplineBonuses: [],
    // [{ name, custom }]: custom is true when the player wrote their own focus.
    focuses: [],
    // { text, matrixId }: matrixId is a sample value id, a Core example id (getValueExamples), or null when written.
    value: null,
    // { id, name }: set automatically when the option names one trait, picked when it names two.
    trait: null,
  }
}

export const getCategories = () => withChoiceArt('educationCategory', educationAdaptation.categoryOrder.map((id) => categoriesById.get(id)))
export const getCategoryById = (id) => categoriesById.get(id) ?? null
export const getOptions = (categoryId) => educationSource.options.filter((option) => option.category === categoryId)
export const getOptionById = (id) => optionsById.get(id) ?? null
export const getFocusCount = () => FOCUS_COUNT
export const getValueMatrix = () => getSampleValues()
export const getTraitOptions = (optionId) => getOptionById(optionId)?.trait.options ?? []
export const isCustomFocusAllowed = () => educationAdaptation.allowCustomFocus
export const isCustomValueAllowed = () => educationAdaptation.allowCustomValue
export const getAttributePointsTotal = () => ATTRIBUTE_POINTS

// ---------- Attributes ----------

const attributePointsSpent = (bonuses) => bonuses.reduce((sum, bonus) => sum + bonus.value, 0)
const attributeValue = (education, attributeId) => education.attributeBonuses.find((bonus) => bonus.id === attributeId)?.value ?? 0

export const getAttributePointsSpent = (education) => attributePointsSpent(education.attributeBonuses)

export function getRequiredAttributes(optionId) {
  const required = getOptionById(optionId)?.attributes.required
  return required ? getAttributes().filter((attribute) => required.includes(attribute.id)) : []
}

export const canIncreaseAttribute = (education, attributeId) =>
  getAttributePointsSpent(education) < ATTRIBUTE_POINTS && attributeValue(education, attributeId) < MAX_PER_ATTRIBUTE

export const canDecreaseAttribute = (education, attributeId) => attributeValue(education, attributeId) > 0

function setAttributeValue(education, attributeId, value) {
  const attribute = getAttributes().find((entry) => entry.id === attributeId)
  const others = education.attributeBonuses.filter((bonus) => bonus.id !== attributeId)
  const next = value > 0 ? [...others, { ...toRef(attribute), value }] : others
  // Keep the canonical attribute order so the saved list is stable.
  const order = getAttributes().map((entry) => entry.id)
  return { ...education, attributeBonuses: next.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)) }
}

export function increaseAttribute(education, attributeId) {
  if (!canIncreaseAttribute(education, attributeId)) return education
  return setAttributeValue(education, attributeId, attributeValue(education, attributeId) + 1)
}

export function decreaseAttribute(education, attributeId) {
  if (!canDecreaseAttribute(education, attributeId)) return education
  return setAttributeValue(education, attributeId, attributeValue(education, attributeId) - 1)
}

function isAttributeAllocationComplete(education) {
  if (getAttributePointsSpent(education) !== ATTRIBUTE_POINTS) return false
  const required = getOptionById(education.option?.id)?.attributes.required
  return !required || education.attributeBonuses.some((bonus) => required.includes(bonus.id))
}

// ---------- Disciplines ----------

function getMajorOptionIds(option) {
  const { major } = option.disciplines
  return major === 'any' ? disciplines.map((discipline) => discipline.id) : major
}

// Officer Training: whichever of Command/Security is not raised by 2 is raised by 1 automatically.
function getAutoDisciplineId(option, majorId) {
  if (!option.disciplines.pairedMajor || !majorId) return null
  return option.disciplines.major.find((id) => id !== majorId) ?? null
}

function getMinorOptionIds(option, majorId) {
  const { options } = option.disciplines.minor
  const autoId = getAutoDisciplineId(option, majorId)
  const pool = options === 'others' ? disciplines.map((discipline) => discipline.id) : options
  return pool.filter((id) => id !== majorId && id !== autoId)
}

function getDisciplineCap(option) {
  return getCategoryById(option.category).disciplineMaxAtStage
}

function fitsCap(character, option, disciplineId, amount) {
  const cap = getDisciplineCap(option)
  return cap === null || getDisciplineTotalsBeforeEducation(character)[disciplineId] + amount <= cap
}

const allowsSwap = (option) => Boolean(option.disciplines.swap)

function computeDisciplineBonuses(option, picks) {
  const changes = []
  if (picks.major) changes.push({ id: picks.major, value: MAJOR_AMOUNT })
  const autoId = getAutoDisciplineId(option, picks.major)
  if (autoId) changes.push({ id: autoId, value: MINOR_AMOUNT })
  for (const id of picks.minors) changes.push({ id, value: MINOR_AMOUNT })
  if (picks.swapFrom && picks.swapTo) {
    changes.push({ id: picks.swapFrom, value: -1 }, { id: picks.swapTo, value: 1 })
  }
  return changes.map((change) => ({ ...toRef(disciplinesById.get(change.id)), value: change.value }))
}

const increasedIds = (option, picks) => [picks.major, getAutoDisciplineId(option, picks.major), ...picks.minors].filter(Boolean)

function canSwapFrom(character, option, picks, disciplineId) {
  const minimum = educationAdaptation.disciplineSwap.minimumSourceTotal
  return (
    allowsSwap(option) &&
    !increasedIds(option, picks).includes(disciplineId) &&
    getDisciplineTotalsBeforeEducation(character)[disciplineId] >= minimum
  )
}

function canSwapTo(option, picks, disciplineId) {
  return allowsSwap(option) && !increasedIds(option, picks).includes(disciplineId) && disciplineId !== picks.swapFrom
}

// Drops any discipline pick that the option, the stage cap, or earlier steps no longer allow.
function normalizeDisciplinePicks(character, option, picks) {
  const major = getMajorOptionIds(option).includes(picks.major) && fitsCap(character, option, picks.major, MAJOR_AMOUNT) ? picks.major : null
  const minorIds = getMinorOptionIds(option, major)
  const minors = [...new Set(picks.minors)]
    .filter((id) => minorIds.includes(id) && fitsCap(character, option, id, MINOR_AMOUNT))
    .slice(0, option.disciplines.minor.count)
  const kept = { major, minors, swapFrom: null, swapTo: null }
  if (picks.swapFrom && canSwapFrom(character, option, kept, picks.swapFrom)) kept.swapFrom = picks.swapFrom
  if (picks.swapTo && canSwapTo(option, kept, picks.swapTo)) kept.swapTo = picks.swapTo
  return kept
}

// One row per discipline for the UI: current score, what this step adds, and which buttons are usable.
export function getDisciplineRows(character) {
  const { education } = character
  const option = getOptionById(education.option?.id)
  if (!option) return []
  const picks = education.disciplinePicks
  const before = getDisciplineTotalsBeforeEducation(character)
  const majorIds = getMajorOptionIds(option)
  const autoId = getAutoDisciplineId(option, picks.major)
  const minorIds = getMinorOptionIds(option, picks.major)
  const change = Object.fromEntries(education.disciplineBonuses.map((bonus) => [bonus.id, bonus.value]))

  return disciplines.map((discipline) => {
    const { id } = discipline
    const isMinor = picks.minors.includes(id)
    return {
      ...toRef(discipline),
      before: before[id],
      after: before[id] + (change[id] ?? 0),
      isMajorOption: majorIds.includes(id),
      isMajor: picks.major === id,
      canMajor: majorIds.includes(id) && fitsCap(character, option, id, MAJOR_AMOUNT),
      isAuto: autoId === id,
      isMinorOption: minorIds.includes(id) || isMinor,
      isMinor,
      canMinor: isMinor || (minorIds.includes(id) && fitsCap(character, option, id, MINOR_AMOUNT)),
    }
  })
}

export function getDisciplineRules(optionId) {
  const option = getOptionById(optionId)
  if (!option) return null
  return {
    minorCount: option.disciplines.minor.count,
    cap: getDisciplineCap(option),
    mustInclude: option.disciplines.mustInclude ? disciplinesById.get(option.disciplines.mustInclude) : null,
    allowsSwap: allowsSwap(option),
    text: option.disciplines.text,
  }
}

// One-line digest of an option's fixed mechanics, derived from its book data, for list rows.
export function getOptionSummary(optionId) {
  const option = getOptionById(optionId)
  if (!option) return ''
  const { major, pairedMajor, mustInclude } = option.disciplines
  const names = (ids) => ids.map((id) => disciplinesById.get(id).name)
  const parts = []
  if (major === 'any') parts.push('+2 any department')
  else if (pairedMajor) parts.push(`${names(major).join(' & ')} +2/+1`)
  else parts.push(`+2 ${names(major).join(' or ')}`)
  if (mustInclude) parts.push(`must include ${disciplinesById.get(mustInclude).name}`)
  const required = getRequiredAttributes(optionId)
  if (required.length) parts.push(`needs ${required.map((attribute) => attribute.name).join(' or ')}`)
  if (getDisciplineCap(option)) parts.push(`max ${getDisciplineCap(option)}`)
  if (allowsSwap(option) && !categoryAllowsSwap(option.category)) parts.push('optional swap')
  return parts.join(' · ')
}

export const categoryAllowsSwap = (categoryId) => getOptions(categoryId).every(allowsSwap)

export function getSwapOptions(character) {
  const option = getOptionById(character.education.option?.id)
  if (!option || !allowsSwap(option)) return { from: [], to: [] }
  const picks = character.education.disciplinePicks
  return {
    from: disciplines.filter((discipline) => canSwapFrom(character, option, picks, discipline.id)),
    to: disciplines.filter((discipline) => canSwapTo(option, picks, discipline.id)),
  }
}

// ---------- Focuses and value ----------

export const getFocusExamples = (optionId) => getOptionById(optionId)?.focus.examples ?? []

function normalizeFocuses(option, focuses) {
  const examples = option.focus.examples
  return focuses
    .filter((focus) => (focus.custom ? isCustomFocusAllowed() : isBookFocus(focus.name, examples)))
    .slice(0, FOCUS_COUNT)
}

// For a book focus: an example or a Focus Matrix entry.
export function toggleFocusExample(education, name) {
  const exists = education.focuses.some((focus) => !focus.custom && focus.name === name)
  if (exists) return { ...education, focuses: education.focuses.filter((focus) => focus.custom || focus.name !== name) }
  if (!isBookFocus(name, getFocusExamples(education.option?.id))) return education
  if (education.focuses.some((focus) => focus.name.toLowerCase() === name.toLowerCase())) return education
  return { ...education, focuses: [...withRoomForOne(education.focuses), { name, custom: false }] }
}

// Prototype: when all focuses are chosen, a new one replaces the oldest instead of being blocked.
const withRoomForOne = (focuses) => (focuses.length >= FOCUS_COUNT ? focuses.slice(focuses.length - FOCUS_COUNT + 1) : focuses)

export function addCustomFocus(education, name) {
  const trimmed = name.trim()
  if (!isCustomFocusAllowed() || !trimmed) return education
  if (education.focuses.some((focus) => focus.name.toLowerCase() === trimmed.toLowerCase())) return education
  return { ...education, focuses: [...withRoomForOne(education.focuses), { name: trimmed, custom: true }] }
}

export function removeFocus(education, name) {
  return { ...education, focuses: education.focuses.filter((focus) => focus.name !== name) }
}

// Core's example values for the option, listed ahead of the sample values.
export const getValueExamples = (optionId) =>
  (getOptionById(optionId)?.valueExamples ?? []).map((text, index) => ({ id: `${optionId}-value-${index + 1}`, text }))

export const getValueChoiceById = (optionId, valueId) =>
  [...getValueExamples(optionId), ...getValueMatrix()].find((value) => value.id === valueId) ?? null

export function selectMatrixValue(education, valueId) {
  const entry = getValueChoiceById(education.option?.id, valueId)
  if (!entry) return education
  return { ...education, value: { text: entry.text, matrixId: entry.id } }
}

export function setCustomValue(education, text) {
  if (!isCustomValueAllowed()) return education
  return { ...education, value: { text, matrixId: null } }
}

// ---------- Trait ----------

function normalizeTrait(option, trait) {
  const { options } = option.trait
  if (options.length === 1) return toRef(options[0])
  const kept = options.find((entry) => entry.id === trait?.id)
  return kept ? toRef(kept) : null
}

export function selectTrait(education, traitId) {
  const entry = getTraitOptions(education.option?.id).find((trait) => trait.id === traitId)
  return entry ? { ...education, trait: toRef(entry) } : education
}

// ---------- Selection and revalidation ----------

// Saved characters may hold ids from older value lists; keep the text but treat it as the player's own wording.
function normalizeValue(option, value) {
  if (!value?.matrixId || getValueChoiceById(option.id, value.matrixId)) return value
  return { ...value, matrixId: null }
}

function buildEducation(character, option, previous) {
  const disciplinePicks = normalizeDisciplinePicks(character, option, previous.disciplinePicks)
  return {
    ...previous,
    category: toRef(getCategoryById(option.category)),
    option: toRef(option),
    disciplinePicks,
    disciplineBonuses: computeDisciplineBonuses(option, disciplinePicks),
    focuses: normalizeFocuses(option, previous.focuses),
    value: normalizeValue(option, previous.value),
    trait: normalizeTrait(option, previous.trait),
  }
}

export function selectEducationOption(character, optionId) {
  const option = getOptionById(optionId)
  if (!option) return character.education
  return buildEducation(character, option, character.education)
}

function updateDisciplinePicks(character, changes) {
  const option = getOptionById(character.education.option?.id)
  if (!option) return character.education
  const previous = { ...character.education, disciplinePicks: { ...character.education.disciplinePicks, ...changes } }
  return buildEducation(character, option, previous)
}

export function toggleMajorDiscipline(character, disciplineId) {
  const { major, minors } = character.education.disciplinePicks
  if (major === disciplineId) return updateDisciplinePicks(character, { major: null })
  return updateDisciplinePicks(character, { major: disciplineId, minors: minors.filter((id) => id !== disciplineId) })
}

// Prototype: when all minors are chosen, a new one replaces the oldest instead of being blocked.
export function toggleMinorDiscipline(character, disciplineId) {
  const { minors } = character.education.disciplinePicks
  const count = getOptionById(character.education.option?.id)?.disciplines.minor.count ?? 0
  if (minors.includes(disciplineId)) return updateDisciplinePicks(character, { minors: minors.filter((id) => id !== disciplineId) })
  const kept = minors.length >= count ? minors.slice(minors.length - count + 1) : minors
  return updateDisciplinePicks(character, { minors: [...kept, disciplineId] })
}

export const setSwapFrom = (character, disciplineId) => updateDisciplinePicks(character, { swapFrom: disciplineId || null })
export const setSwapTo = (character, disciplineId) => updateDisciplinePicks(character, { swapTo: disciplineId || null })

// Earlier steps can change prior discipline scores (stage cap, swap minimum); re-check the picks.
// A saved option that no longer exists (e.g. a retired Captain's Log option) clears the step.
export function reconcileEducation(character) {
  const option = getOptionById(character.education.option?.id)
  if (!option) return character.education.option || character.education.category ? { ...character, education: createEmptyEducation() } : character
  const rebuilt = buildEducation(character, option, character.education)
  const unchanged = JSON.stringify(rebuilt) === JSON.stringify(character.education)
  return unchanged ? character : { ...character, education: rebuilt }
}

function isDisciplineAllocationComplete(option, picks) {
  const mustInclude = option.disciplines.mustInclude
  return Boolean(
    picks.major &&
      picks.minors.length === option.disciplines.minor.count &&
      (!mustInclude || increasedIds(option, picks).includes(mustInclude)) &&
      Boolean(picks.swapFrom) === Boolean(picks.swapTo),
  )
}

export function getEducationRequirements(character) {
  const { education } = character
  const option = getOptionById(education.option?.id)
  return {
    option: Boolean(option),
    trait: Boolean(option) && getTraitOptions(option.id).some((trait) => trait.id === education.trait?.id),
    attributes: Boolean(option) && isAttributeAllocationComplete(education),
    disciplines: Boolean(option) && isDisciplineAllocationComplete(option, education.disciplinePicks),
    focuses: education.focuses.length === FOCUS_COUNT && education.focuses.every((focus) => focus.name.trim()),
    value: Boolean(education.value?.text.trim()),
    talent: isTalentSlotMet(character, 'education'),
  }
}

export const isEducationStepComplete = (character) => areAllMet(getEducationRequirements(character))
