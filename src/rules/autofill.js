// Development helper: completes every unfinished choice on the built screens without touching choices already made.
// Heuristic (not a book rule): reinforce the character's current strengths — highest attribute/discipline totals
// win, ties go to canonical order — and take the first book example/value where a pick is free-form.
import { getAttributeTotals, getDisciplineTotalsBeforeEducation } from './characterTotals.js'
import { selectFirstCards } from './defaults.js'
import {
  getBaseSpecies,
  getChoosableAttributeIds,
  getRequiredAttributeChoices,
  getSpeciesById,
  isMixedHeritage,
  isNewSpecies,
  setMixedParent,
  setNewSpeciesName,
  toggleAttributeChoice,
} from './species.js'
import * as environmentRules from './environment.js'
import * as outlookRules from './earlyOutlook.js'
import * as educationRules from './education.js'
import * as careerRules from './career.js'
import * as historyRules from './careerHistory.js'
import * as finishingRules from './finishingTouches.js'
import * as appearanceRules from './appearance.js'
import { getAllMatrixFocuses } from './focuses.js'

// Highest score first; Array.prototype.sort is stable, so ties keep canonical order.
const byStrongest = (ids, totals) => [...ids].sort((a, b) => totals[b] - totals[a])

// Review rejects duplicate focuses, so autofill skips names the character already holds.
const heldFocusNames = (character) => finishingRules.getCharacterFocuses(character).map((focus) => focus.name.trim().toLowerCase())
const firstUnheld = (names, character) => names.find((name) => !heldFocusNames(character).includes(name.toLowerCase()))

function fillSpecies(character) {
  let species = character.species
  const definition = getSpeciesById(species.id)
  if (isMixedHeritage(definition)) {
    species.parents.forEach((parent, index) => {
      if (!parent) species = setMixedParent(species, index, getBaseSpecies().find((entry) => !species.parents.some((p) => p?.id === entry.id)).id)
    })
  }
  if (isNewSpecies(definition) && !species.customName.trim()) species = setNewSpeciesName(species, definition.name)
  const missing = getRequiredAttributeChoices(definition) - species.attributeBonuses.length
  if (missing > 0) {
    const chosen = species.attributeBonuses.map((bonus) => bonus.id)
    const candidates = byStrongest(getChoosableAttributeIds(species), getAttributeTotals(character)).filter((id) => !chosen.includes(id))
    candidates.slice(0, missing).forEach((id) => (species = toggleAttributeChoice(species, id)))
  }
  const identity = character.identity.gender ? character.identity : appearanceRules.setGender(character.identity, appearanceRules.getGenders()[0].id)
  return { ...character, species, identity }
}

function fillEnvironment(character) {
  let next = character
  const update = (environment) => (next = environmentRules.reconcileEnvironment({ ...next, environment }))
  if (environmentRules.requiresOtherSpecies(next.environment) && !next.environment.otherSpecies) {
    update(environmentRules.selectOtherSpecies(next.environment, environmentRules.getOtherSpeciesOptions(next)[0].id))
  }
  if (!next.environment.attributeBonus) {
    const ids = environmentRules.getAttributeOptions(next).map((option) => option.id)
    const [best] = byStrongest(ids, getAttributeTotals(next))
    if (best) update(environmentRules.selectAttributeBonus(next, best))
  }
  if (!next.environment.disciplineBonus) {
    const ids = environmentRules.getDisciplineOptions(next).map((option) => option.id)
    const [best] = byStrongest(ids, getDisciplineTotalsBeforeEducation(next))
    if (best) update(environmentRules.selectDisciplineBonus(next, best))
  }
  if (!next.environment.value?.text.trim()) {
    update(environmentRules.selectMatrixValue(next.environment, environmentRules.getValueMatrix()[0].id))
  }
  return next
}

function fillEarlyOutlook(character) {
  let earlyOutlook = character.earlyOutlook
  const outlookId = earlyOutlook.outlook.id
  if (!earlyOutlook.path) earlyOutlook = outlookRules.selectPath(earlyOutlook, outlookRules.getPathOptions(outlookId)[0].id)
  if (!earlyOutlook.disciplineBonus) {
    const ids = outlookRules.getDisciplineOptions(outlookId).map((option) => option.id)
    const [best] = byStrongest(ids, getDisciplineTotalsBeforeEducation({ ...character, earlyOutlook }))
    earlyOutlook = outlookRules.selectDiscipline(earlyOutlook, best)
  }
  if (!earlyOutlook.focus?.name.trim()) earlyOutlook = outlookRules.selectFocusExample(earlyOutlook, outlookRules.getFocusExamples(outlookId)[0])
  return { ...character, earlyOutlook }
}

function fillEducationAttributes(character) {
  let education = character.education
  const required = educationRules.getRequiredAttributes(education.option.id).map((attribute) => attribute.id)
  const totals = getAttributeTotals(character)
  const hasRequired = () => !required.length || education.attributeBonuses.some((bonus) => required.includes(bonus.id))
  const ranked = byStrongest(Object.keys(totals), totals)
  // Earlier picks can use every point without meeting a new option's required attribute; free the weakest point.
  if (!hasRequired() && educationRules.getAttributePointsSpent(education) >= educationRules.getAttributePointsTotal()) {
    const weakest = [...education.attributeBonuses].sort((a, b) => totals[a.id] - totals[b.id])[0]
    education = educationRules.decreaseAttribute(education, weakest.id)
  }
  while (educationRules.getAttributePointsSpent(education) < educationRules.getAttributePointsTotal()) {
    const pool = hasRequired() ? ranked : byStrongest(required, totals)
    const target = pool.find((id) => educationRules.canIncreaseAttribute(education, id))
    if (!target) break
    education = educationRules.increaseAttribute(education, target)
  }
  return { ...character, education }
}

function fillEducationDisciplines(character) {
  let next = character
  const apply = (education) => (next = { ...next, education })
  const rules = educationRules.getDisciplineRules(next.education.option.id)
  const strongest = (rows) => rows.sort((a, b) => b.before - a.before)[0]

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

function fillEducationFocusesAndValue(character) {
  let education = character.education
  const count = educationRules.getFocusCount()
  for (const example of [...educationRules.getFocusExamples(education.option.id), ...getAllMatrixFocuses()]) {
    if (education.focuses.length >= count) break
    if (firstUnheld([example], { ...character, education })) education = educationRules.toggleFocusExample(education, example)
  }
  if (!education.value?.text.trim()) {
    const environmentValueId = character.environment.value?.matrixId
    const entry = educationRules.getValueMatrix().find((value) => value.id !== environmentValueId)
    education = educationRules.selectMatrixValue(education, entry.id)
  }
  return { ...character, education }
}

function fillCareer(character) {
  let career = character.career
  if (!career.value?.text.trim()) {
    const usedIds = [character.environment.value?.matrixId, character.education.value?.matrixId]
    const entry = careerRules.getValueMatrix().find((value) => !usedIds.includes(value.id))
    career = careerRules.selectMatrixValue(career, entry.id)
  }
  let next = { ...character, career }
  if (!career.assignment) {
    const allowed = careerRules.getAssignments().find((entry) => careerRules.isAssignmentAllowed(next, entry.id))
    next = { ...next, career: careerRules.selectAssignment(next, allowed.id) }
  }
  if (!next.career.department) next = { ...next, career: careerRules.selectDepartment(next.career, careerRules.getDepartments()[0].id) }
  if (!next.career.rank) {
    const lowest = careerRules.getRankOptions(next).find((rank) => careerRules.isRankAllowed(next, rank.id))
    next = { ...next, career: careerRules.selectRank(next, lowest.id) }
  }
  return next
}

function fillCareerHistory(character) {
  let history = character.careerHistory
  history.events.forEach((slot, index) => {
    if (!slot) {
      const free = historyRules.getCareerEvents().find((event) => !historyRules.isEventTakenElsewhere(history, index, event.id))
      history = historyRules.selectEvent(history, index, free.id)
    }
    const { attributeBonus, disciplineBonus, focus, event } = history.events[index]
    if (!attributeBonus) {
      const [best] = byStrongest(historyRules.getAttributes().map((a) => a.id), getAttributeTotals({ ...character, careerHistory: history }))
      history = historyRules.selectAttribute(history, index, best)
    }
    if (!disciplineBonus) {
      const [best] = byStrongest(historyRules.getDisciplines().map((d) => d.id), getDisciplineTotalsBeforeEducation(character))
      history = historyRules.selectDiscipline(history, index, best)
    }
    if (!focus) {
      const definition = historyRules.getCareerEventById(event.id)
      const options = [...definition.focus.examples, ...getAllMatrixFocuses()]
      const name = firstUnheld(options, { ...character, careerHistory: history })
      history = historyRules.selectFocus(history, index, name)
    }
  })
  return { ...character, careerHistory: history }
}

// Uses the same limit rules as the screen: picks increases that stay under the limits, then resolves any leftover excess.
function fillFinishingScores(character, kind) {
  let next = character
  const apply = (finishingTouches) => (next = { ...next, finishingTouches })
  const { entries, max, increaseCount } = finishingRules.getKindInfo(kind)
  const ids = entries.map((entry) => entry.id)
  while (next.finishingTouches[kind].increases.length < increaseCount) {
    const { raw } = finishingRules.getLimitAnalysis(next, kind)
    const chosen = next.finishingTouches[kind].increases
    const pool = byStrongest(ids, raw).filter((id) => !chosen.includes(id))
    const target = pool.find((id) => raw[id] + 1 < max) ?? pool[0]
    apply(finishingRules.toggleIncrease(next, kind, target))
  }
  let analysis = finishingRules.getLimitAnalysis(next, kind)
  if (analysis.needsKeeperChoice && !analysis.keeper) apply(finishingRules.setKeepAtMax(next, kind, analysis.atOrOverMax[0]))
  analysis = finishingRules.getLimitAnalysis(next, kind)
  while (analysis.assigned < analysis.excess) {
    const target = byStrongest(ids, analysis.raw).find((id) => analysis.canReceive(id))
    if (!target) break
    apply(finishingRules.addRedistributionPoint(next, kind, target))
    analysis = finishingRules.getLimitAnalysis(next, kind)
  }
  return next
}

function fillFinishingTouches(character) {
  let next = character
  if (!next.finishingTouches.value?.text.trim()) {
    const usedIds = finishingRules.getCharacterValues(next).map((value) => value.matrixId)
    const entry = finishingRules.getValueMatrix().find((value) => !usedIds.includes(value.id))
    next = { ...next, finishingTouches: finishingRules.selectMatrixValue(next.finishingTouches, entry.id) }
  }
  next = fillFinishingScores(next, 'attributes')
  next = fillFinishingScores(next, 'disciplines')
  if (!next.identity.name.trim()) next = { ...next, identity: finishingRules.setName(next.identity, 'Test Officer') }
  const [firstPortrait] = appearanceRules.getAvailablePortraits(next)
  if (!next.identity.portrait && firstPortrait) next = { ...next, identity: appearanceRules.selectPortrait(next, firstPortrait.id) }
  return next
}

export function autofillCharacter(character) {
  let next = fillSpecies(selectFirstCards(character))
  next = fillEnvironment(next)
  next = fillEarlyOutlook(next)
  next = educationRules.reconcileEducation(next)
  next = fillEducationAttributes(next)
  next = fillEducationDisciplines(next)
  next = fillEducationFocusesAndValue(next)
  next = fillCareer(next)
  next = fillCareerHistory(next)
  next = fillFinishingTouches(next)
  return next
}

