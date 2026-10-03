import finishingSource from '../data/source/finishingTouches.json'
import startingPoints from '../data/source/startingPoints.json'
import attributeSource from '../data/source/attributes.json'
import disciplineSource from '../data/source/disciplines.json'
import valuesMatrix from '../data/source/valuesMatrix.json'
import finishingAdaptation from '../data/adaptation/finishingTouches.json'
import { getAttributeTotals, getDisciplineTotals } from './characterTotals.js'
import { getPortraitById, isPortraitAvailable } from './appearance.js'
import { areAllMet } from './requirements.js'

const limits = startingPoints.finishedCharacterLimits
const complete = finishingSource.completeCharacter

// Attributes and disciplines follow the same Step Seven procedure with different lists and limits.
const KINDS = {
  attributes: {
    entries: attributeSource.attributes,
    max: limits.attributeMax,
    increaseCount: finishingSource.attributes.increaseCount,
    total: complete.attributeTotal,
    lifepathTotals: getAttributeTotals,
  },
  disciplines: {
    entries: disciplineSource.disciplines,
    max: limits.disciplineMax,
    increaseCount: finishingSource.disciplines.increaseCount,
    total: complete.disciplineTotal,
    lifepathTotals: getDisciplineTotals,
  },
}

const createEmptyScoreStep = () => ({ increases: [], keepAtMax: null, redistribution: [] })

// increases: the two +1s; keepAtMax: which tied score keeps the maximum; redistribution: one id per reduced point.
export function createEmptyFinishingTouches() {
  return { value: null, attributes: createEmptyScoreStep(), disciplines: createEmptyScoreStep() }
}

// Prototype identity/presentation data (not book mechanics). gender is { id, name } (chosen on Screen 1);
// portrait is { id, name } of a preset from the species + gender set. Pronouns are separate free text (required).
export function createEmptyIdentity() {
  return { name: '', pronouns: '', gender: null, portrait: null }
}

export const getCategories = () => finishingAdaptation.categories
export const getBookText = () => finishingSource
export function getKindInfo(kind) {
  const { entries, max, increaseCount, total } = KINDS[kind]
  return { entries, max, increaseCount, total }
}
export const getValueMatrix = () => valuesMatrix.values
export const isCustomValueAllowed = () => finishingAdaptation.allowCustomValue
export { getPortraitById }

// ---------- Final value ----------

export function selectMatrixValue(finishing, valueId) {
  const entry = getValueMatrix().find((value) => value.id === valueId)
  if (!entry) return finishing
  return { ...finishing, value: { text: entry.text, matrixId: entry.id } }
}

export function setCustomValue(finishing, text) {
  if (!isCustomValueAllowed()) return finishing
  return { ...finishing, value: { text, matrixId: null } }
}

// ---------- Score increases and limits ----------

function getRawScores(character, kind) {
  const scores = KINDS[kind].lifepathTotals(character)
  for (const id of character.finishingTouches[kind].increases) scores[id] += 1
  return scores
}

// Book p.129: nothing above max and only one score at max. Every score at or above max except one keeper
// drops to max - 1, so the points to hand out don't depend on which score keeps the maximum.
export function getLimitAnalysis(character, kind) {
  const { entries, max } = KINDS[kind]
  const step = character.finishingTouches[kind]
  const raw = getRawScores(character, kind)
  const atOrOverMax = entries.map((entry) => entry.id).filter((id) => raw[id] >= max)
  const needsKeeperChoice = atOrOverMax.length > 1
  const keeper = atOrOverMax.length === 1 ? atOrOverMax[0] : atOrOverMax.includes(step.keepAtMax) ? step.keepAtMax : null
  const excess = atOrOverMax.length ? atOrOverMax.reduce((sum, id) => sum + raw[id] - (max - 1), 0) - 1 : 0

  const capped = { ...raw }
  for (const id of atOrOverMax) capped[id] = id === keeper ? max : max - 1
  const received = Object.fromEntries(entries.map((entry) => [entry.id, 0]))
  for (const id of step.redistribution) received[id] += 1

  // Reduced scores can't take points back, and no recipient may reach the maximum (the keeper holds it).
  const canReceive = (id) => !atOrOverMax.includes(id) && capped[id] + received[id] + 1 <= max - 1
  const resolved = (!needsKeeperChoice || keeper !== null) && step.redistribution.length === excess
  const final = resolved ? Object.fromEntries(entries.map((entry) => [entry.id, capped[entry.id] + received[entry.id]])) : null
  const finalTotal = final ? Object.values(final).reduce((sum, score) => sum + score, 0) : null

  return {
    raw,
    atOrOverMax,
    needsKeeperChoice,
    keeper,
    excess,
    assigned: step.redistribution.length,
    received,
    canReceive: (id) => step.redistribution.length < excess && canReceive(id),
    needsAdjustment: needsKeeperChoice || excess > 0,
    final,
    finalTotal,
    totalMatches: finalTotal === KINDS[kind].total,
  }
}

// Drops keeper and redistribution picks that the current scores no longer allow.
function normalizeScoreStep(character, kind) {
  const step = character.finishingTouches[kind]
  const increases = step.increases.filter((id, index) => KINDS[kind].entries.some((entry) => entry.id === id) && step.increases.indexOf(id) === index)
  let next = { ...step, increases: increases.slice(0, KINDS[kind].increaseCount), redistribution: [] }
  const probe = (candidate) => ({ ...character, finishingTouches: { ...character.finishingTouches, [kind]: candidate } })
  const { atOrOverMax, needsKeeperChoice } = getLimitAnalysis(probe(next), kind)
  if (!needsKeeperChoice || !atOrOverMax.includes(step.keepAtMax)) next = { ...next, keepAtMax: null }
  for (const id of step.redistribution) {
    if (getLimitAnalysis(probe(next), kind).canReceive(id)) next = { ...next, redistribution: [...next.redistribution, id] }
  }
  return next
}

function updateScoreStep(character, kind, changes) {
  const updated = { ...character, finishingTouches: { ...character.finishingTouches, [kind]: { ...character.finishingTouches[kind], ...changes } } }
  return { ...updated.finishingTouches, [kind]: normalizeScoreStep(updated, kind) }
}

// Prototype: when both increases are chosen, a new one replaces the oldest instead of being blocked.
export function toggleIncrease(character, kind, id) {
  const { increases } = character.finishingTouches[kind]
  if (increases.includes(id)) return updateScoreStep(character, kind, { increases: increases.filter((entry) => entry !== id) })
  const count = KINDS[kind].increaseCount
  const kept = increases.length >= count ? increases.slice(increases.length - count + 1) : increases
  return updateScoreStep(character, kind, { increases: [...kept, id] })
}

export const setKeepAtMax = (character, kind, id) => updateScoreStep(character, kind, { keepAtMax: id })

export function addRedistributionPoint(character, kind, id) {
  if (!getLimitAnalysis(character, kind).canReceive(id)) return character.finishingTouches
  return updateScoreStep(character, kind, { redistribution: [...character.finishingTouches[kind].redistribution, id] })
}

export function removeRedistributionPoint(character, kind, id) {
  const { redistribution } = character.finishingTouches[kind]
  const index = redistribution.lastIndexOf(id)
  if (index < 0) return character.finishingTouches
  return updateScoreStep(character, kind, { redistribution: redistribution.filter((_, i) => i !== index) })
}

// Earlier screens change the lifepath scores, which can change what the limits require; re-check the picks.
export function reconcileFinishingTouches(character) {
  const finishing = {
    ...character.finishingTouches,
    attributes: normalizeScoreStep(character, 'attributes'),
    disciplines: normalizeScoreStep(character, 'disciplines'),
  }
  const unchanged = JSON.stringify(finishing) === JSON.stringify(character.finishingTouches)
  return unchanged ? character : { ...character, finishingTouches: finishing }
}

// Rows for the +1 picker: lifepath score, whether it gets a +1, and the result (final once limits are resolved).
export function getIncreaseRows(character, kind) {
  const analysis = getLimitAnalysis(character, kind)
  const lifepath = KINDS[kind].lifepathTotals(character)
  const { increases } = character.finishingTouches[kind]
  return KINDS[kind].entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    score: lifepath[entry.id],
    increased: increases.includes(entry.id),
    result: analysis.final ? analysis.final[entry.id] : null,
  }))
}

export function getLimitAdjustment(character, kind) {
  const analysis = getLimitAnalysis(character, kind)
  const entries = KINDS[kind].entries
  return {
    needed: analysis.needsAdjustment,
    keeperOptions: analysis.needsKeeperChoice
      ? entries.filter((entry) => analysis.atOrOverMax.includes(entry.id)).map((entry) => ({ ...entry, score: analysis.raw[entry.id] }))
      : [],
    keeperId: analysis.keeper,
    excess: analysis.excess,
    assigned: analysis.assigned,
    rows: entries
      .filter((entry) => !analysis.atOrOverMax.includes(entry.id))
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        score: analysis.raw[entry.id],
        received: analysis.received[entry.id],
        canAdd: analysis.canReceive(entry.id),
      })),
    finalTotal: analysis.finalTotal,
    requiredTotal: KINDS[kind].total,
  }
}

// Final scores once this part of Step Seven is complete (both increases, limits resolved, book total met), otherwise null.
export function getFinalScores(character, kind) {
  const increasesDone = character.finishingTouches[kind].increases.length === KINDS[kind].increaseCount
  return increasesDone && isScoreStepComplete(character, kind) ? getLimitAnalysis(character, kind).final : null
}

// ---------- Values and focuses ----------

export function getCharacterValues(character) {
  return [character.environment.value, character.education.value, character.career.value, character.finishingTouches.value].filter(
    (value) => value?.text.trim(),
  )
}

export function getCharacterFocuses(character) {
  const eventFocuses = character.careerHistory.events.map((slot) => slot?.focus)
  return [character.earlyOutlook.focus, ...character.education.focuses, ...eventFocuses].filter((focus) => focus?.name.trim())
}

export const getRequiredValueCount = () => complete.valueCount
export const getRequiredFocusCount = () => complete.focusCount

// ---------- Identity ----------

export const setName = (identity, name) => ({ ...identity, name })
export const setPronouns = (identity, pronouns) => ({ ...identity, pronouns })
export const getPronounPresets = () => finishingAdaptation.pronounPresets
// Designer decision: Auto/Autofill give Male and Female characters these pronouns; other genders have no default.
export const getDefaultPronouns = (genderId) => finishingAdaptation.defaultPronounsByGender[genderId] ?? null
// Book p.92 / p.132: a finished character has pronouns. Free text; only Auto/Autofill fill them from gender.
export const hasPronouns = (identity) => Boolean(identity.pronouns?.trim())

// ---------- Requirements ----------

function isScoreStepComplete(character, kind) {
  const analysis = getLimitAnalysis(character, kind)
  return analysis.final !== null && analysis.totalMatches
}

// In category order. Background Notes is optional, so it has no requirement.
export function getFinishingRequirements(character) {
  return {
    finalValue: Boolean(character.finishingTouches.value?.text.trim()) && getCharacterValues(character).length === complete.valueCount,
    attributes: getFinalScores(character, 'attributes') !== null,
    disciplines: getFinalScores(character, 'disciplines') !== null,
    portrait: isPortraitAvailable(character, character.identity.portrait?.id),
    // Last, so naming the character is the final choice on the screen (sections unlock in this order).
    identity: Boolean(character.identity.name.trim()) && hasPronouns(character.identity),
  }
}

export const isFinishingStepComplete = (character) =>
  areAllMet(getFinishingRequirements(character)) && getCharacterFocuses(character).length === complete.focusCount
