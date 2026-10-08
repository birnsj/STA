// Completes every unfinished choice on a screen without touching choices already made, picking valid options at
// random (not a book rule). Used by the Auto button and the dev Autofill; see character/autoChoice.js.
import { getAttributeTotals } from './characterTotals.js'
import {
  getBaseSpecies,
  getChoosableAttributeIds,
  getRequiredAttributeChoices,
  getSpeciesById,
  isMixedHeritage,
  isNewSpecies,
  isPrimaryParentChosen,
  setMixedParent,
  setNewSpeciesName,
  setPrimaryParent,
  toggleAttributeChoice,
} from './species.js'
import * as environmentRules from './environment.js'
import * as outlookRules from './earlyOutlook.js'
import * as educationRules from './education.js'
import * as careerRules from './career.js'
import { getRoles } from './roles.js'
import * as historyRules from './careerHistory.js'
import * as finishingRules from './finishingTouches.js'
import * as appearanceRules from './appearance.js'
import * as talentRules from './talents.js'
import { getAllMatrixFocuses } from './focuses.js'
import { nameGroupForGender, randomName } from './names.js'
import { pickStageValue } from './stageValues.js'
import { seededRandom } from './seededRandom.js'

const generatedName = (random) => (character) => randomName(nameGroupForGender(character.identity.gender?.id), '', random)

// order(list) returns the options in the order to try them; name(character) generates a name for the character's gender.
export function createRandomChooser(seed) {
  const random = seededRandom(seed)
  const shuffle = (list) => {
    const copy = [...list]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }
  return { order: (list) => shuffle(list), name: generatedName(random), random }
}

// Review rejects duplicate focuses, so autofill skips names the character already holds.
const heldFocusNames = (character) => finishingRules.getCharacterFocuses(character).map((focus) => focus.name.trim().toLowerCase())
const firstUnheld = (names, character) => names.find((name) => !heldFocusNames(character).includes(name.toLowerCase()))

export function fillSpecies(character, chooser) {
  let species = character.species
  const definition = getSpeciesById(species.id)
  if (isMixedHeritage(definition)) {
    species.parents.forEach((parent, index) => {
      if (!parent) {
        const free = chooser.order(getBaseSpecies()).find((entry) => !species.parents.some((p) => p?.id === entry.id))
        species = setMixedParent(species, index, free.id)
      }
    })
    if (!isPrimaryParentChosen(species)) species = setPrimaryParent(species, chooser.order(species.parents)[0].id)
  }
  if (isNewSpecies(definition) && !species.customName.trim()) species = setNewSpeciesName(species, definition.name)
  const missing = getRequiredAttributeChoices(definition) - species.attributeBonuses.length
  if (missing > 0) {
    const chosen = species.attributeBonuses.map((bonus) => bonus.id)
    const candidates = chooser.order(getChoosableAttributeIds(species)).filter((id) => !chosen.includes(id))
    candidates.slice(0, missing).forEach((id) => (species = toggleAttributeChoice(species, id)))
  }
  const gender = chooser.order(appearanceRules.getGenders())[0]
  const identity = character.identity.gender ? character.identity : appearanceRules.setGender(character.identity, gender.id)
  return { ...character, species, identity }
}

export function fillEnvironment(character, chooser) {
  let next = character
  const update = (environment) => (next = environmentRules.reconcileEnvironment({ ...next, environment }))
  if (environmentRules.requiresOtherSpecies(next.environment) && !next.environment.otherSpecies) {
    update(environmentRules.selectOtherSpecies(next.environment, chooser.order(environmentRules.getOtherSpeciesOptions(next))[0].id))
  }
  if (!next.environment.attributeBonus) {
    const ids = environmentRules.getAttributeOptions(next).map((option) => option.id)
    const [best] = chooser.order(ids)
    if (best) update(environmentRules.selectAttributeBonus(next, best))
  }
  if (!next.environment.disciplineBonus) {
    const ids = environmentRules.getDisciplineOptions(next).map((option) => option.id)
    const [best] = chooser.order(ids)
    if (best) update(environmentRules.selectDisciplineBonus(next, best))
  }
  if (!next.environment.value?.text.trim()) {
    const text = pickStageValue(next, 'environment', chooser.order)
    update(
      text
        ? environmentRules.setCustomValue(next.environment, text)
        : environmentRules.selectMatrixValue(next.environment, chooser.order(environmentRules.getValueMatrix())[0].id),
    )
  }
  return next
}

export function fillEarlyOutlook(character, chooser) {
  let earlyOutlook = character.earlyOutlook
  const outlookId = earlyOutlook.outlook.id
  if (!earlyOutlook.path) earlyOutlook = outlookRules.selectPath(earlyOutlook, chooser.order(outlookRules.getPathOptions(outlookId))[0].id)
  if (!earlyOutlook.disciplineBonus) {
    const ids = outlookRules.getDisciplineOptions(outlookId).map((option) => option.id)
    const [best] = chooser.order(ids)
    earlyOutlook = outlookRules.selectDiscipline(earlyOutlook, best)
  }
  if (!earlyOutlook.focus?.name.trim()) {
    const name = firstUnheld(chooser.order(outlookRules.getFocusExamples(outlookId)), character)
    earlyOutlook = outlookRules.selectFocusExample(earlyOutlook, name ?? outlookRules.getFocusExamples(outlookId)[0])
  }
  return fillTalent({ ...character, earlyOutlook }, 'earlyOutlook', chooser)
}

// Picks a random talent the slot allows (the career slot's fixed talent is placed by reconciling), then its choice.
export function fillTalent(character, stepId, chooser) {
  let next = talentRules.reconcileTalents(character)
  if (!next.talents[stepId]) {
    const [pick] = chooser.order(talentRules.getTalentOptions(next, stepId).filter((option) => option.state === 'available'))
    if (pick) next = { ...next, talents: talentRules.selectTalent(next, stepId, pick.talent.id) }
  }
  const slot = next.talents[stepId]
  if (slot && talentRules.getTalentById(slot.id).choice && !slot.choice) {
    const [choice] = chooser.order(talentRules.getChoiceOptions(next, stepId, slot.id).filter((option) => !option.disabled))
    if (choice) next = { ...next, talents: talentRules.selectTalentChoice(next, stepId, choice.id) }
  }
  return next
}

function fillEducationAttributes(character, chooser) {
  let education = character.education
  const required = educationRules.getRequiredAttributes(education.option.id).map((attribute) => attribute.id)
  const totals = getAttributeTotals(character)
  const hasRequired = () => !required.length || education.attributeBonuses.some((bonus) => required.includes(bonus.id))
  const ranked = chooser.order(Object.keys(totals))
  // Earlier picks can use every point without meeting a new option's required attribute; free the weakest point.
  if (!hasRequired() && educationRules.getAttributePointsSpent(education) >= educationRules.getAttributePointsTotal()) {
    const weakest = [...education.attributeBonuses].sort((a, b) => totals[a.id] - totals[b.id])[0]
    education = educationRules.decreaseAttribute(education, weakest.id)
  }
  const requiredOrder = chooser.order(required)
  while (educationRules.getAttributePointsSpent(education) < educationRules.getAttributePointsTotal()) {
    const pool = hasRequired() ? ranked : requiredOrder
    const target = pool.find((id) => educationRules.canIncreaseAttribute(education, id))
    if (!target) break
    education = educationRules.increaseAttribute(education, target)
  }
  return { ...character, education }
}

function fillEducationDisciplines(character, chooser) {
  let next = character
  const apply = (education) => (next = { ...next, education })
  const rules = educationRules.getDisciplineRules(next.education.option.id)
  const strongest = (rows) => chooser.order(rows)[0]

  if (!next.education.disciplinePicks.major) {
    const best = strongest(educationRules.getDisciplineRows(next).filter((row) => row.canMajor))
    if (best) apply(educationRules.toggleMajorDiscipline(next, best.id))
  }
  const mustId = rules.mustInclude?.id
  const picks = () => next.education.disciplinePicks
  if (mustId && picks().major !== mustId && !picks().minors.includes(mustId)) {
    const row = educationRules.getDisciplineRows(next).find((entry) => entry.id === mustId)
    if (row?.canMinor) apply(educationRules.toggleMinorDiscipline(next, mustId))
  }
  while (picks().minors.length < rules.minorCount) {
    const best = strongest(educationRules.getDisciplineRows(next).filter((row) => row.canMinor && !row.isMinor && !row.isMajor))
    if (!best) break
    apply(educationRules.toggleMinorDiscipline(next, best.id))
  }
  return next
}

function fillEducationFocusesAndValue(character, chooser) {
  let education = character.education
  const count = educationRules.getFocusCount()
  const examples = [...chooser.order(educationRules.getFocusExamples(education.option.id)), ...chooser.order(getAllMatrixFocuses())]
  for (const example of examples) {
    if (education.focuses.length >= count) break
    if (firstUnheld([example], { ...character, education })) education = educationRules.toggleFocusExample(education, example)
  }
  if (!education.value?.text.trim()) {
    const text = pickStageValue({ ...character, education }, 'education', chooser.order)
    if (text) education = educationRules.setCustomValue(education, text)
    else {
      const environmentValueId = character.environment.value?.matrixId
      const entry = chooser.order(educationRules.getValueMatrix()).find((value) => value.id !== environmentValueId)
      education = educationRules.selectMatrixValue(education, entry.id)
    }
  }
  return { ...character, education }
}

export function fillEducation(character, chooser) {
  let next = educationRules.reconcileEducation(character)
  next = fillEducationAttributes(next, chooser)
  next = fillEducationDisciplines(next, chooser)
  return fillTalent(fillEducationFocusesAndValue(next, chooser), 'education', chooser)
}

export function fillCareer(character, chooser) {
  let career = character.career
  if (!career.value?.text.trim()) {
    const text = pickStageValue(character, 'career', chooser.order)
    if (text) career = careerRules.setCustomValue(career, text)
    else {
      const usedIds = [character.environment.value?.matrixId, character.education.value?.matrixId]
      const entry = chooser.order(careerRules.getValueMatrix()).find((value) => !usedIds.includes(value.id))
      career = careerRules.selectMatrixValue(career, entry.id)
    }
  }
  let next = { ...character, career }
  if (!career.assignment) {
    const allowed = chooser.order(careerRules.getAssignments()).find((entry) => careerRules.isAssignmentAllowed(next, entry.id))
    next = { ...next, career: careerRules.selectAssignment(next, allowed.id) }
  }
  if (careerRules.isDepartmentChoice(next.career) && !next.career.department) {
    next = { ...next, career: careerRules.selectDepartment(next.career, chooser.order(careerRules.getDepartments())[0].id) }
  }
  if (careerRules.isRoleChoice(next.career) && !next.career.role) {
    next = { ...next, career: careerRules.selectRole(next.career, chooser.order(getRoles())[0].id) }
  }
  if (!next.career.rank) {
    const rank = chooser.order(careerRules.getRankOptions(next)).find((option) => careerRules.isRankAllowed(next, option.id))
    next = { ...next, career: careerRules.selectRank(next, rank.id) }
  }
  return fillTalent(next, 'career', chooser)
}

export function fillCareerHistory(character, chooser) {
  let history = character.careerHistory
  history.events.forEach((slot, index) => {
    if (!slot) {
      const free = chooser.order(historyRules.getCareerEvents()).find((event) => !historyRules.isEventTakenElsewhere(history, index, event.id))
      history = historyRules.selectEvent(history, index, free.id)
    }
    const { attributeBonus, disciplineBonus, focus, event } = history.events[index]
    if (!attributeBonus) {
      const ids = historyRules.getAttributes().map((a) => a.id)
      const [best] = chooser.order(ids)
      history = historyRules.selectAttribute(history, index, best)
    }
    if (!disciplineBonus) {
      const ids = historyRules.getDisciplines().map((d) => d.id)
      const [best] = chooser.order(ids)
      history = historyRules.selectDiscipline(history, index, best)
    }
    if (!focus) {
      const definition = historyRules.getCareerEventById(event.id)
      const options = [...chooser.order(definition.focus.examples), ...chooser.order(getAllMatrixFocuses())]
      const name = firstUnheld(options, { ...character, careerHistory: history })
      history = historyRules.selectFocus(history, index, name)
    }
  })
  return { ...character, careerHistory: history }
}

// Uses the same limit rules as the screen: picks increases that stay under the limits, then resolves any leftover excess.
function fillFinishingScores(character, kind, chooser) {
  let next = character
  const apply = (finishingTouches) => (next = { ...next, finishingTouches })
  const { entries, increaseCount } = finishingRules.getKindInfo(kind)
  const ids = entries.map((entry) => entry.id)
  while (next.finishingTouches[kind].increases.length < increaseCount) {
    const { raw, ceiling } = finishingRules.getLimitAnalysis(next, kind)
    const chosen = next.finishingTouches[kind].increases
    const pool = chooser.order(ids).filter((id) => !chosen.includes(id))
    const target = pool.find((id) => raw[id] + 1 <= ceiling) ?? pool[0]
    apply(finishingRules.toggleIncrease(next, kind, target))
  }
  let analysis = finishingRules.getLimitAnalysis(next, kind)
  if (analysis.needsKeeperChoice && !analysis.keeper) apply(finishingRules.setKeepAtMax(next, kind, chooser.order(analysis.overLimit)[0]))
  analysis = finishingRules.getLimitAnalysis(next, kind)
  while (analysis.assigned < analysis.excess) {
    const target = chooser.order(ids).find((id) => analysis.canReceive(id))
    if (!target) break
    apply(finishingRules.addRedistributionPoint(next, kind, target))
    analysis = finishingRules.getLimitAnalysis(next, kind)
  }
  return next
}

export function fillFinishingTouches(character, chooser) {
  let next = character
  if (!next.finishingTouches.value?.text.trim()) {
    const text = pickStageValue(next, 'finishingTouches', chooser.order)
    if (text) next = { ...next, finishingTouches: finishingRules.setCustomValue(next.finishingTouches, text) }
    else {
      const usedIds = finishingRules.getCharacterValues(next).map((value) => value.matrixId)
      const entry = chooser.order(finishingRules.getValueMatrix()).find((value) => !usedIds.includes(value.id))
      next = { ...next, finishingTouches: finishingRules.selectMatrixValue(next.finishingTouches, entry.id) }
    }
  }
  next = fillFinishingScores(next, 'attributes', chooser)
  next = fillFinishingScores(next, 'disciplines', chooser)
  next = fillTalent(next, 'finishingTouches', chooser)
  if (!next.identity.name.trim()) next = { ...next, identity: finishingRules.setName(next.identity, chooser.name(next)) }
  // Blank pronouns (required) get the gender's default, or a random preset for a gender without one.
  if (!finishingRules.hasPronouns(next.identity)) {
    const pronouns = finishingRules.getDefaultPronouns(next.identity.gender?.id) ?? chooser.order(finishingRules.getPronounPresets())[0]
    next = { ...next, identity: finishingRules.setPronouns(next.identity, pronouns) }
  }
  const [portrait] = chooser.order(appearanceRules.getAvailablePortraits(next))
  if (!next.identity.portrait && portrait) next = { ...next, identity: appearanceRules.selectPortrait(next, portrait.id) }
  return next
}
