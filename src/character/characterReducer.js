import { createEmptyCharacter } from './characterModel.js'
import {
  createEmptyMemory,
  switchCareerEvent,
  switchCareerLength,
  switchEarlyOutlook,
  switchEducationCategory,
  switchEducationOption,
  switchEnvironmentCard,
  switchSpecies,
} from './choiceMemory.js'
import { AUTO_STEP_IDS, autoChooseStep, fillMissingTalents } from './autoChoice.js'
import {
  setMixedParent,
  setNewSpeciesAbility,
  setNewSpeciesDescription,
  setNewSpeciesName,
  setPrimaryParent,
  toggleAttributeChoice,
} from '../rules/species.js'
import {
  reconcileEnvironment,
  selectAttributeBonus,
  selectDisciplineBonus,
  selectMatrixValue,
  selectOtherSpecies,
  setCustomValue,
} from '../rules/environment.js'
import {
  reconcileEarlyOutlook,
  selectDiscipline,
  selectFocusExample,
  selectPath,
  setCustomFocus,
} from '../rules/earlyOutlook.js'
import * as educationRules from '../rules/education.js'
import * as careerRules from '../rules/career.js'
import * as historyRules from '../rules/careerHistory.js'
import * as finishingRules from '../rules/finishingTouches.js'
import * as appearanceRules from '../rules/appearance.js'
import * as talentRules from '../rules/talents.js'
import { reconcileEquipment } from '../rules/equipment.js'
import { applyDefaultSelections } from '../rules/defaults.js'
import { isCharacterValid } from '../rules/characterValidation.js'
import { isFocusHeldElsewhere, isMatrixValueHeldElsewhere, isValueTextHeldElsewhere } from '../rules/characterSheet.js'

// Creator state: the canonical character plus the per-card choice memory (UI-only, never exported).
export function createInitialState() {
  return { character: reconcileEquipment(applyDefaultSelections(createEmptyCharacter())), memory: createEmptyMemory() }
}

// Focus and value picks that would duplicate one from another screen are ignored; removing a focus is always allowed.
function isBlockedDuplicatePick(character, action) {
  switch (action.type) {
    case 'selectEnvironmentMatrixValue':
      return isMatrixValueHeldElsewhere(character, action.valueId, 'environment')
    case 'selectEducationMatrixValue':
      return isValueTextHeldElsewhere(character, educationRules.getValueChoiceById(character.education.option?.id, action.valueId)?.text, 'education')
    case 'selectCareerMatrixValue':
      return isMatrixValueHeldElsewhere(character, action.valueId, 'career')
    case 'selectFinalMatrixValue':
      return isMatrixValueHeldElsewhere(character, action.valueId, 'finishingTouches')
    case 'selectEarlyOutlookFocus':
      return isFocusHeldElsewhere(character, action.name, 'earlyOutlook')
    case 'toggleEducationFocus':
      return !character.education.focuses.some((focus) => focus.name === action.name) && isFocusHeldElsewhere(character, action.name, 'education')
    case 'addEducationCustomFocus':
      return isFocusHeldElsewhere(character, action.name, 'education')
    case 'selectCareerEventFocus':
      return isFocusHeldElsewhere(character, action.name, 'careerHistory', action.slotIndex)
    default:
      return false
  }
}

function applyAction(character, action) {
  if (isBlockedDuplicatePick(character, action)) return character
  switch (action.type) {
    case 'toggleSpeciesAttribute':
      if (!character.species) return character
      return { ...character, species: toggleAttributeChoice(character.species, action.attributeId) }
    case 'setSpeciesParent':
      if (!character.species) return character
      return { ...character, species: setMixedParent(character.species, action.index, action.speciesId) }
    case 'setSpeciesPrimary':
      if (!character.species) return character
      return { ...character, species: setPrimaryParent(character.species, action.speciesId) }
    case 'setNewSpeciesName':
      if (!character.species) return character
      return { ...character, species: setNewSpeciesName(character.species, action.name) }
    case 'setNewSpeciesDescription':
      if (!character.species) return character
      return { ...character, species: setNewSpeciesDescription(character.species, action.description) }
    case 'setNewSpeciesAbility':
      if (!character.species) return character
      return { ...character, species: setNewSpeciesAbility(character.species, action.changes) }
    case 'selectEnvironmentOtherSpecies':
      return { ...character, environment: selectOtherSpecies(character.environment, action.speciesId) }
    case 'selectEnvironmentMatrixValue':
      return { ...character, environment: selectMatrixValue(character.environment, action.valueId) }
    case 'setEnvironmentCustomValue':
      return { ...character, environment: setCustomValue(character.environment, action.text) }
    case 'selectEnvironmentAttribute':
      return { ...character, environment: selectAttributeBonus(character, action.attributeId) }
    case 'selectEnvironmentDiscipline':
      return { ...character, environment: selectDisciplineBonus(character, action.disciplineId) }
    case 'selectEarlyOutlookPath':
      return { ...character, earlyOutlook: selectPath(character.earlyOutlook, action.pathId) }
    case 'selectEarlyOutlookDiscipline':
      return { ...character, earlyOutlook: selectDiscipline(character.earlyOutlook, action.disciplineId) }
    case 'selectEarlyOutlookFocus':
      return { ...character, earlyOutlook: selectFocusExample(character.earlyOutlook, action.name) }
    case 'setEarlyOutlookCustomFocus':
      return { ...character, earlyOutlook: setCustomFocus(character.earlyOutlook, action.name) }
    case 'increaseEducationAttribute':
      return { ...character, education: educationRules.increaseAttribute(character.education, action.attributeId) }
    case 'decreaseEducationAttribute':
      return { ...character, education: educationRules.decreaseAttribute(character.education, action.attributeId) }
    case 'toggleEducationMajorDiscipline':
      return { ...character, education: educationRules.toggleMajorDiscipline(character, action.disciplineId) }
    case 'toggleEducationMinorDiscipline':
      return { ...character, education: educationRules.toggleMinorDiscipline(character, action.disciplineId) }
    case 'setEducationSwapFrom':
      return { ...character, education: educationRules.setSwapFrom(character, action.disciplineId) }
    case 'setEducationSwapTo':
      return { ...character, education: educationRules.setSwapTo(character, action.disciplineId) }
    case 'toggleEducationFocus':
      return { ...character, education: educationRules.toggleFocusExample(character.education, action.name) }
    case 'addEducationCustomFocus':
      return { ...character, education: educationRules.addCustomFocus(character.education, action.name) }
    case 'removeEducationFocus':
      return { ...character, education: educationRules.removeFocus(character.education, action.name) }
    case 'selectEducationMatrixValue':
      return { ...character, education: educationRules.selectMatrixValue(character.education, action.valueId) }
    case 'setEducationCustomValue':
      return { ...character, education: educationRules.setCustomValue(character.education, action.text) }
    case 'selectEducationTrait':
      return { ...character, education: educationRules.selectTrait(character.education, action.traitId) }
    case 'selectCareerMatrixValue':
      return { ...character, career: careerRules.selectMatrixValue(character.career, action.valueId) }
    case 'setCareerCustomValue':
      return { ...character, career: careerRules.setCustomValue(character.career, action.text) }
    case 'selectCareerAssignment':
      return { ...character, career: careerRules.selectAssignment(character, action.assignmentId) }
    case 'selectCareerDepartment':
      return { ...character, career: careerRules.selectDepartment(character.career, action.departmentId) }
    case 'selectCareerRole':
      return { ...character, career: careerRules.selectRole(character.career, action.roleId) }
    case 'selectCareerRank':
      return { ...character, career: careerRules.selectRank(character, action.rankId) }
    case 'selectCareerEventAttribute':
      return { ...character, careerHistory: historyRules.selectAttribute(character.careerHistory, action.slotIndex, action.attributeId) }
    case 'selectCareerEventDiscipline':
      return { ...character, careerHistory: historyRules.selectDiscipline(character.careerHistory, action.slotIndex, action.disciplineId) }
    case 'selectCareerEventFocus':
      return { ...character, careerHistory: historyRules.selectFocus(character.careerHistory, action.slotIndex, action.name) }
    case 'setCareerEventCustomFocus':
      return { ...character, careerHistory: historyRules.setCustomFocus(character.careerHistory, action.slotIndex, action.name) }
    case 'selectFinalMatrixValue':
      return { ...character, finishingTouches: finishingRules.selectMatrixValue(character.finishingTouches, action.valueId) }
    case 'setFinalCustomValue':
      return { ...character, finishingTouches: finishingRules.setCustomValue(character.finishingTouches, action.text) }
    case 'toggleFinalIncrease':
      return { ...character, finishingTouches: finishingRules.toggleIncrease(character, action.kind, action.id) }
    case 'setFinalKeepAtMax':
      return { ...character, finishingTouches: finishingRules.setKeepAtMax(character, action.kind, action.id) }
    case 'addFinalRedistributionPoint':
      return { ...character, finishingTouches: finishingRules.addRedistributionPoint(character, action.kind, action.id) }
    case 'removeFinalRedistributionPoint':
      return { ...character, finishingTouches: finishingRules.removeRedistributionPoint(character, action.kind, action.id) }
    case 'setCharacterName':
      return { ...character, identity: finishingRules.setName(character.identity, action.name) }
    case 'setCharacterPronouns':
      return { ...character, identity: finishingRules.setPronouns(character.identity, action.pronouns) }
    case 'setCharacterAge':
      return { ...character, identity: finishingRules.setAge(character.identity, action.age) }
    case 'setCharacterPastime':
      return { ...character, identity: finishingRules.setPastime(character.identity, action.pastime) }
    case 'selectGender':
      return { ...character, identity: appearanceRules.setGender(character.identity, action.genderId) }
    case 'selectPortrait':
      return { ...character, identity: appearanceRules.selectPortrait(character, action.portraitId) }
    case 'selectBackdrop':
      return { ...character, identity: appearanceRules.selectBackdrop(character.identity, action.backdropId, character.career.department?.id) }
    case 'setBackgroundNotes':
      return { ...character, backgroundNotes: action.text }
    case 'selectTalent':
      return { ...character, talents: talentRules.selectTalent(character, action.stepId, action.talentId) }
    case 'selectTalentChoice':
      return { ...character, talents: talentRules.selectTalentChoice(character, action.stepId, action.choiceId) }
    default:
      throw new Error(`Unknown character action: ${action.type}`)
  }
}

// Card selections swap in that card's remembered picks; see choiceMemory.js.
function switchCard(state, action) {
  switch (action.type) {
    case 'selectSpecies':
      return switchSpecies(state, action.speciesId)
    case 'selectEnvironmentSetting':
      return switchEnvironmentCard(state, action.settingId)
    case 'selectEarlyOutlook':
      return switchEarlyOutlook(state, action.outlookId)
    case 'selectEducation':
      return switchEducationOption(state, action.optionId)
    case 'selectEducationCategory':
      return switchEducationCategory(state, action.categoryId)
    case 'selectCareerLength':
      return switchCareerLength(state, action.lengthId)
    case 'selectCareerEvent':
      return switchCareerEvent(state, action.slotIndex, action.eventId)
    default:
      return null
  }
}

// Any edit invalidates a previous confirmation, so a confirmed character is always the one that was validated.
// previous: the character before this edit (null when there is none), for the finishing-touches limit defaults.
function finalize(character, previous = null) {
  const reconciled = appearanceRules.reconcilePortrait(
    finishingRules.reconcileFinishingTouches(
      historyRules.reconcileCareerHistory(
        careerRules.reconcileCareer(educationRules.reconcileEducation(reconcileEarlyOutlook(reconcileEnvironment(character)))),
      ),
      previous,
    ),
  )
  // Talents are checked last, against the species, scores, focuses and career the other steps have just settled.
  // Equipment follows the career, so it is derived after defaults have filled any career choices.
  return { ...reconcileEquipment(talentRules.reconcileTalents(applyDefaultSelections(reconciled))), confirmedAt: null }
}

// Restores a saved character; reconciling repairs anything the current rules no longer allow.
export function createRestoredState(savedCharacter) {
  if (!savedCharacter) return createInitialState()
  const { confirmedAt } = savedCharacter
  const character = finalize(savedCharacter)
  return {
    character: confirmedAt && isCharacterValid(character) ? { ...character, confirmedAt } : character,
    memory: createEmptyMemory(),
  }
}

// A saved character the current rules can't read leaves the current character untouched.
function loadCharacter(state, savedCharacter) {
  try {
    return savedCharacter ? createRestoredState(savedCharacter) : state
  } catch {
    return state
  }
}

// confirmedAt can be supplied so the caller can save the exact same confirmed character it dispatched.
function confirm(state, confirmedAt = new Date().toISOString()) {
  if (!isCharacterValid(state.character)) return state
  return { ...state, character: { ...state.character, confirmedAt } }
}

export function creatorReducer(state, action) {
  if (action.type === 'resetCharacter') return createInitialState()
  if (action.type === 'loadCharacter') return loadCharacter(state, action.character)
  if (action.type === 'confirmCharacter') return confirm(state, action.confirmedAt)
  if (action.type === 'autoChooseStep') {
    const auto = autoChooseStep(state, action.stepId, action.seed)
    return auto === state ? state : { ...auto, character: finalize(auto.character, state.character) }
  }
  // Dev Autofill: a whole new random character, as if Auto were pressed on every screen in turn.
  // Each screen gets its own seed derived from the one drawn at the button press.
  if (action.type === 'autofill') {
    const filled = AUTO_STEP_IDS.reduce(
      (next, stepId, index) => creatorReducer(next, { type: 'autoChooseStep', stepId, seed: (action.seed + index * 0.6180339887) % 1 }),
      createInitialState(),
    )
    const withTalents = fillMissingTalents(filled, (action.seed + AUTO_STEP_IDS.length * 0.6180339887) % 1)
    return { ...withTalents, character: finalize(withTalents.character) }
  }
  const switched = switchCard(state, action)
  if (switched) return switched === state ? state : { ...switched, character: finalize(switched.character, state.character) }
  const character = applyAction(state.character, action)
  return character === state.character ? state : { ...state, character: finalize(character, state.character) }
}
