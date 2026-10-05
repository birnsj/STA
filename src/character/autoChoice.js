// Prototype (not a book rule): the player's per-screen Auto button. It replaces every choice on one screen with a
// random valid one. The card is picked the same way a player's click picks it (choiceMemory.js), so a new species
// still resets the later screens exactly as clicking it would; the screen's other picks are then cleared and refilled.
import { switchCareerLength, switchEarlyOutlook, switchEducationOption, switchEnvironmentCard, switchSpecies } from './choiceMemory.js'
import {
  createRandomChooser,
  fillCareer,
  fillCareerHistory,
  fillEarlyOutlook,
  fillEducation,
  fillEnvironment,
  fillFinishingTouches,
  fillSpecies,
  fillTalent,
} from '../rules/autofill.js'
import { TALENT_STEPS } from '../rules/talents.js'
import { createSpeciesSelection, getAvailableSpecies } from '../rules/species.js'
import { createEmptyEnvironment, getConditions, getSettings } from '../rules/environment.js'
import { createEmptyEarlyOutlook, getApproaches, getOutlooks, isApproachAvailable, selectOutlook } from '../rules/earlyOutlook.js'
import { createEmptyEducation, getCategories, getOptions, selectEducationOption } from '../rules/education.js'
import { createEmptyCareer, getCareerLengths } from '../rules/career.js'
import { createEmptyCareerHistory } from '../rules/careerHistory.js'
import { createEmptyFinishingTouches } from '../rules/finishingTouches.js'

const withCharacter = (state, character) => ({ ...state, character })
// A screen's talent is one of its choices, so Auto re-picks it too.
const withoutTalent = (character, stepId) => ({ ...character, talents: { ...character.talents, [stepId]: null } })

function autoSpecies(state, chooser) {
  const [species] = chooser.order(getAvailableSpecies())
  const switched = switchSpecies(state, species.id)
  const { character } = switched
  const identity = { ...character.identity, gender: null }
  return withCharacter(switched, fillSpecies({ ...character, species: createSpeciesSelection(species.id), identity }, chooser))
}

function autoEnvironment(state, chooser) {
  const cards = [...getSettings().map((entry) => ({ kind: 'setting', id: entry.id })), ...getConditions().map((entry) => ({ kind: 'condition', id: entry.id }))]
  const [card] = chooser.order(cards)
  const switched = switchEnvironmentCard(state, card.kind, card.id)
  const { setting, condition } = switched.character.environment
  const environment = { ...createEmptyEnvironment(), setting, condition }
  return withCharacter(switched, fillEnvironment({ ...switched.character, environment }, chooser))
}

function autoEarlyOutlook(state, chooser) {
  const outlooks = getApproaches()
    .filter((approach) => isApproachAvailable(state.character, approach.id))
    .flatMap((approach) => getOutlooks(approach.id))
  const [outlook] = chooser.order(outlooks)
  const switched = switchEarlyOutlook(state, outlook.id)
  const earlyOutlook = selectOutlook({ ...switched.character, earlyOutlook: createEmptyEarlyOutlook() }, outlook.id)
  return withCharacter(switched, fillEarlyOutlook({ ...withoutTalent(switched.character, 'earlyOutlook'), earlyOutlook }, chooser))
}

// Category first, then an option in it, as on screen; picking among all options would favour the largest category.
function autoEducation(state, chooser) {
  const [category] = chooser.order(getCategories())
  const [option] = chooser.order(getOptions(category.id))
  const switched = switchEducationOption(state, option.id)
  const education = selectEducationOption({ ...switched.character, education: createEmptyEducation() }, option.id)
  return withCharacter(switched, fillEducation({ ...withoutTalent(switched.character, 'education'), education }, chooser))
}

function autoCareer(state, chooser) {
  const [length] = chooser.order(getCareerLengths())
  const switched = switchCareerLength(state, length.id)
  const career = { ...createEmptyCareer(), length: switched.character.career.length }
  return withCharacter(switched, fillCareer({ ...withoutTalent(switched.character, 'career'), career }, chooser))
}

function autoCareerHistory(state, chooser) {
  return withCharacter(state, fillCareerHistory({ ...state.character, careerHistory: createEmptyCareerHistory() }, chooser))
}

// Pronouns and Background Notes are the player's own free text, so Auto keeps them; blank pronouns (required) are filled.
function autoFinishingTouches(state, chooser) {
  const { character } = state
  const identity = { ...character.identity, name: '', portrait: null }
  return withCharacter(
    state,
    fillFinishingTouches({ ...withoutTalent(character, 'finishingTouches'), finishingTouches: createEmptyFinishingTouches(), identity }, chooser),
  )
}

// Dev Autofill's last pass: final scores can come in below the lifepath totals an earlier talent was picked
// against, which clears that talent; refill any empty slot so Autofill always ends with four legal talents.
export function fillMissingTalents(state, seed) {
  const chooser = createRandomChooser(seed)
  const character = TALENT_STEPS.reduce((next, stepId) => fillTalent(next, stepId, chooser), state.character)
  return withCharacter(state, character)
}

const AUTO_BY_STEP = {
  species: autoSpecies,
  environment: autoEnvironment,
  earlyOutlook: autoEarlyOutlook,
  education: autoEducation,
  career: autoCareer,
  careerHistory: autoCareerHistory,
  finishingTouches: autoFinishingTouches,
}

export const hasAutoChoice = (stepId) => Boolean(AUTO_BY_STEP[stepId])

// In screen order, since each screen's options depend on the earlier ones.
export const AUTO_STEP_IDS = Object.keys(AUTO_BY_STEP)

// seed is drawn by the caller (Math.random()) so this stays a pure function of its inputs.
export function autoChooseStep(state, stepId, seed) {
  const auto = AUTO_BY_STEP[stepId]
  return auto ? auto(state, createRandomChooser(seed)) : state
}
