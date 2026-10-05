import talentSource from '../data/source/talents.json'
import attributeSource from '../data/source/attributes.json'
import disciplineSource from '../data/source/disciplines.json'
import assignmentSource from '../data/source/assignments.json'
import careerLengthSource from '../data/source/careerLengths.json'
import speciesSource from '../data/source/species.json'
import creationSteps from '../data/adaptation/creationSteps.json'
import { getAttributeTotals, getDisciplineTotals } from './characterTotals.js'
import { getFocusEntries } from './characterSheet.js'
import { getFinalScores } from './finishingTouches.js'
import { getOwnSpeciesIds } from './species.js'

// Book p.131: one talent each from Upbringing (Early Outlook), Education, Experience (Career) and Finishing Touches.
// Prototype: talents live in their own section keyed by the granting step, separate from the Species Ability.
export const TALENT_STEPS = ['earlyOutlook', 'education', 'career', 'finishingTouches']

const talents = talentSource.talents
const talentsById = new Map(talents.map((talent) => [talent.id, talent]))
const nameOf = (list) => new Map(list.map((entry) => [entry.id, entry.name]))
const attributeNames = nameOf(attributeSource.attributes)
const departmentNames = nameOf(disciplineSource.disciplines)
const assignmentNames = nameOf(assignmentSource.assignments)
const careerLengthNames = nameOf(careerLengthSource.lengths)
const speciesNames = nameOf(speciesSource.species)
const stepTitles = Object.fromEntries(creationSteps.steps.map((step) => [step.id, step.title]))

export const CATEGORY_LABELS = {
  general: 'General',
  species: 'Species',
  command: 'Command',
  conn: 'Conn',
  engineering: 'Engineering',
  security: 'Security',
  science: 'Science',
  medicine: 'Medicine',
  career: 'Career Length',
}

export function createEmptyTalents() {
  return Object.fromEntries(TALENT_STEPS.map((stepId) => [stepId, null]))
}

export const getTalents = () => talents
export const getTalentById = (id) => talentsById.get(id) ?? null
export const getTalentStepTitle = (stepId) => stepTitles[stepId]

// Book p.127–128: Novice receives Untapped Potential and Veteran receives Veteran; Experienced chooses freely.
export function getFixedCareerTalentId(character) {
  return talentSource.careerLengthTalents[character.career.length?.id] ?? null
}

// ---------- Requirement checks ----------

// Talent requirements are read against the final scores once Finishing Touches has fixed them, and against the
// lifepath totals so far until then.
function getScores(character) {
  return {
    attributes: getFinalScores(character, 'attributes') ?? getAttributeTotals(character),
    departments: getFinalScores(character, 'disciplines') ?? getDisciplineTotals(character),
  }
}

// Everything a requirement can look at, with the talents held in the other slots (never the slot being checked).
function buildContext(character, stepId) {
  const otherSlots = TALENT_STEPS.filter((id) => id !== stepId)
    .map((id) => ({ stepId: id, slot: character.talents?.[id] }))
    .filter(({ slot }) => slot && talentsById.has(slot.id))
  return {
    ...getScores(character),
    speciesIds: getOwnSpeciesIds(character.species),
    careerLengthId: character.career.length?.id ?? null,
    assignmentId: character.career.assignment?.id ?? null,
    focusNames: [...new Set(getFocusEntries(character).map((entry) => entry.name))],
    otherSlots,
  }
}

function isRequirementMet(requirement, context) {
  switch (requirement.type) {
    case 'attribute':
      return context.attributes[requirement.id] >= requirement.min
    case 'department':
      return context.departments[requirement.id] >= requirement.min
    case 'anyOf':
      return requirement.options.some((option) => isRequirementMet(option, context))
    case 'species':
      return requirement.ids.some((id) => context.speciesIds.includes(id))
    case 'talent':
      return context.otherSlots.some(({ slot }) => slot.id === requirement.id)
    case 'careerLength':
      return context.careerLengthId === requirement.id
    case 'assignment':
      return requirement.ids.includes(context.assignmentId)
    case 'notAssignment':
      return Boolean(context.assignmentId) && !requirement.ids.includes(context.assignmentId)
    case 'focusMatch':
      return context.focusNames.some((name) => name.toLowerCase().includes(requirement.contains))
    // Prototype: the player character is always a main character.
    case 'mainCharacter':
      return true
    default:
      return false
  }
}

export function describeRequirement(requirement) {
  switch (requirement.type) {
    case 'attribute':
      return `${attributeNames.get(requirement.id)} ${requirement.min}+`
    case 'department':
      return `${departmentNames.get(requirement.id)} ${requirement.min}+`
    case 'anyOf':
      return requirement.options.map(describeRequirement).join(' or ')
    case 'species':
      return requirement.ids.map((id) => speciesNames.get(id)).join(' or ')
    case 'talent':
      return `${talentsById.get(requirement.id)?.name} talent`
    case 'careerLength':
      return `${careerLengthNames.get(requirement.id)} career`
    case 'assignment':
      return requirement.ids.map((id) => assignmentNames.get(id)).join(' or ')
    case 'notAssignment':
      return `An assignment other than ${requirement.ids.map((id) => assignmentNames.get(id)).join(' or ')}`
    case 'focusMatch':
      return requirement.label
    case 'mainCharacter':
      return 'Main character'
    default:
      return 'Unknown requirement'
  }
}

export function getRequirementSummary(talent) {
  return talent.requirements.length ? talent.requirements.map(describeRequirement).join(', ') : 'None'
}

// ---------- Choices (department, attribute, focus, attack type) ----------

const choiceLabels = { department: 'Department', attribute: 'Attribute', focus: 'Focus', attackType: 'Attack type' }
export const getChoiceLabel = (talent) => (talent.choice ? choiceLabels[talent.choice.kind] : null)

function baseChoiceOptions(talent, context) {
  switch (talent.choice?.kind) {
    case 'department':
      return disciplineSource.disciplines.map(({ id, name }) => ({ id, name }))
    case 'attribute':
      return attributeSource.attributes.map(({ id, name }) => ({ id, name }))
    case 'focus':
      return context.focusNames.map((name) => ({ id: name, name }))
    case 'attackType':
      return talent.choice.options
    default:
      return []
  }
}

// Book p.149: Bold and Cautious may be taken once per department, never both for the same department.
function choiceBlock(talent, choiceId, context) {
  for (const { stepId, slot } of context.otherSlots) {
    if (slot.choice?.id !== choiceId) continue
    if (slot.id === talent.id) return `Already chosen on ${stepTitles[stepId]}`
    const excluded = talent.excludes?.find((rule) => rule.sameChoice && rule.talentId === slot.id)
    if (excluded) return `You have ${talentsById.get(slot.id).name} for this on ${stepTitles[stepId]}`
  }
  return null
}

function choiceOptionsFor(talent, context) {
  return baseChoiceOptions(talent, context).map((option) => {
    const block = choiceBlock(talent, option.id, context)
    return { ...option, disabled: Boolean(block), reason: block }
  })
}

export function getChoiceOptions(character, stepId, talentId) {
  const talent = getTalentById(talentId)
  return talent?.choice ? choiceOptionsFor(talent, buildContext(character, stepId)) : []
}

// ---------- Eligibility ----------

// Why a talent can't go in this slot, or [] when it can. The slot's own current talent is never counted against it.
function getBlocks(talent, stepId, context, fixedCareerTalentId) {
  if (talent.category === 'career' && stepId !== 'career') return ['Only granted by your career length']
  if (stepId === 'career' && fixedCareerTalentId && talent.id !== fixedCareerTalentId) {
    return [`Your career length grants ${talentsById.get(fixedCareerTalentId).name}`]
  }
  const unmet = talent.requirements.filter((requirement) => !isRequirementMet(requirement, context))
  if (unmet.length) return unmet.map((requirement) => `Requires ${describeRequirement(requirement)}`)

  const sameTalent = context.otherSlots.find(({ slot }) => slot.id === talent.id)
  if (sameTalent && talent.repeatable !== 'perChoice') return [`Already chosen on ${stepTitles[sameTalent.stepId]}`]
  const conflict = context.otherSlots.find(({ slot }) => talent.excludes?.some((rule) => !rule.sameChoice && rule.talentId === slot.id))
  if (conflict) return [`Can’t be combined with ${talentsById.get(conflict.slot.id).name}`]
  if (talent.choice && !choiceOptionsFor(talent, context).some((option) => !option.disabled)) {
    return [talent.choice.kind === 'focus' ? 'Requires a focus to choose' : `No ${choiceLabels[talent.choice.kind].toLowerCase()} left to choose`]
  }
  return []
}

// Book: requirements must be met when a talent is selected, and each talent is taken once unless it says otherwise.
// state: 'selected' (held here and legal), 'invalid' (held here but no longer legal), 'available', 'taken'
// (held in another slot), or 'unavailable' (requirements unmet or otherwise blocked).
export function getTalentOptions(character, stepId) {
  const context = buildContext(character, stepId)
  const fixed = getFixedCareerTalentId(character)
  const heldId = character.talents?.[stepId]?.id
  return talents.map((talent) => {
    const reasons = getBlocks(talent, stepId, context, fixed)
    const held = heldId === talent.id
    const takenElsewhere = reasons.some((reason) => reason.startsWith('Already chosen'))
    const state = held ? (reasons.length ? 'invalid' : 'selected') : reasons.length ? (takenElsewhere ? 'taken' : 'unavailable') : 'available'
    // Repeatable talents stay on offer, so the player is told which copies they already hold.
    const heldElsewhere = context.otherSlots
      .filter(({ slot }) => slot.id === talent.id)
      .map(({ stepId: otherStepId, slot }) => ({ stepTitle: stepTitles[otherStepId], choiceName: slot.choice?.name ?? null }))
    return { talent, state, reasons, heldElsewhere, requirementSummary: getRequirementSummary(talent) }
  })
}

const isLegalIn = (character, stepId, talentId) => {
  const talent = getTalentById(talentId)
  return Boolean(talent) && getBlocks(talent, stepId, buildContext(character, stepId), getFixedCareerTalentId(character)).length === 0
}

function isChoiceLegal(character, stepId, slot) {
  const talent = getTalentById(slot.id)
  if (!talent.choice) return true
  const option = getChoiceOptions(character, stepId, slot.id).find((entry) => entry.id === slot.choice?.id)
  return Boolean(option) && !option.disabled
}

// A slot is complete when it holds a legal talent and, for talents that need one, a legal choice.
export function isTalentSlotMet(character, stepId) {
  const slot = character.talents?.[stepId]
  return Boolean(slot) && isLegalIn(character, stepId, slot.id) && isChoiceLegal(character, stepId, slot)
}

// ---------- Selection ----------

const toSlot = (talent, choice = null) => ({ id: talent.id, name: talent.name, choice })

export function selectTalent(character, stepId, talentId) {
  const talent = getTalentById(talentId)
  const current = character.talents[stepId]
  if (!talent || current?.id === talentId || !isLegalIn(character, stepId, talentId)) return character.talents
  return { ...character.talents, [stepId]: toSlot(talent) }
}

export function selectTalentChoice(character, stepId, choiceId) {
  const slot = character.talents[stepId]
  if (!slot) return character.talents
  const option = getChoiceOptions(character, stepId, slot.id).find((entry) => entry.id === choiceId && !entry.disabled)
  if (!option) return character.talents
  return { ...character.talents, [stepId]: { ...slot, choice: { id: option.id, name: option.name } } }
}

// ---------- Reconcile ----------

// Earlier choices can make a held talent illegal (lower scores, a new species, a removed focus...). Designer decision:
// an illegal talent is cleared, which marks that step's Talent as missing again; an illegal choice clears just the
// choice. The career slot always holds the talent its career length grants. Slots are settled in step order, and
// repeated until stable because clearing one talent can invalidate another (Theory into Practice).
export function reconcileTalents(character) {
  let next = character.talents ? character : { ...character, talents: createEmptyTalents() }
  const fixedId = getFixedCareerTalentId(next)
  const careerSlot = next.talents.career
  if (fixedId && careerSlot?.id !== fixedId) next = withSlot(next, 'career', toSlot(getTalentById(fixedId)))
  if (!next.career.length && careerSlot) next = withSlot(next, 'career', null)

  for (let pass = 0; pass < TALENT_STEPS.length; pass++) {
    let changed = false
    for (const stepId of TALENT_STEPS) {
      const slot = next.talents[stepId]
      if (!slot) continue
      if (!isLegalIn(next, stepId, slot.id)) {
        next = withSlot(next, stepId, null)
        changed = true
      } else if (slot.choice && !isChoiceLegal(next, stepId, slot)) {
        next = withSlot(next, stepId, { ...slot, choice: null })
        changed = true
      }
    }
    if (!changed) break
  }
  return next.talents === character.talents ? character : next
}

const withSlot = (character, stepId, slot) => ({ ...character, talents: { ...character.talents, [stepId]: slot } })

// ---------- Display and export ----------

export const getTalentLabel = (slot) => (slot ? (slot.choice ? `${slot.name} (${slot.choice.name})` : slot.name) : null)

// Held talents in step order, with their full definitions, for the summary, Review and export.
export function getTalentEntries(character) {
  return TALENT_STEPS.map((stepId) => ({ stepId, slot: character.talents?.[stepId] }))
    .filter(({ slot }) => slot && talentsById.has(slot.id))
    .map(({ stepId, slot }) => ({ stepId, stepTitle: stepTitles[stepId], slot, talent: talentsById.get(slot.id), label: getTalentLabel(slot) }))
}

export const getRequiredTalentCount = () => TALENT_STEPS.length
