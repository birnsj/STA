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
