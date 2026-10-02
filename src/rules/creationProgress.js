import { createEmptyCharacter } from '../character/characterModel.js'
import { isSpeciesStepComplete } from './species.js'
import { isEnvironmentStepComplete } from './environment.js'
import { isEarlyOutlookStepComplete } from './earlyOutlook.js'
import { isEducationStepComplete } from './education.js'
import { isCareerStepComplete } from './career.js'
import { isCareerHistoryStepComplete } from './careerHistory.js'
import { isFinishingStepComplete } from './finishingTouches.js'

const STEP_COMPLETION = {
  species: isSpeciesStepComplete,
  environment: isEnvironmentStepComplete,
  earlyOutlook: isEarlyOutlookStepComplete,
  education: isEducationStepComplete,
  career: isCareerStepComplete,
  careerHistory: isCareerHistoryStepComplete,
  finishingTouches: isFinishingStepComplete,
  review: (character) => Boolean(character.confirmedAt),
}

export function isStepComplete(stepId, character) {
  return STEP_COMPLETION[stepId]?.(character) ?? false
}

export function getCompletedStepIds(steps, character) {
  return steps.filter((step) => isStepComplete(step.id, character)).map((step) => step.id)
}

// Prototype: leaving the creator discards the working character, so any choice not yet in a confirmed save is at risk.
// Equipment is ignored because it is issued automatically, even to a blank character.
export function hasUnsavedProgress(character) {
  if (character.confirmedAt) return false
  const blank = { ...createEmptyCharacter(), equipment: character.equipment }
  return JSON.stringify(character) !== JSON.stringify(blank)
}
