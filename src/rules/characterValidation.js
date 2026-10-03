import creationSteps from '../data/adaptation/creationSteps.json'
import startingPoints from '../data/source/startingPoints.json'
import { isStepComplete } from './creationProgress.js'
import { getAssignmentBlock, isRankAllowed } from './career.js'
import { getEventCount } from './careerHistory.js'
import { getFocusEntries, getTraitEntries, getValueEntries } from './characterSheet.js'
import {
  getFinalScores,
  getKindInfo,
  getRequiredFocusCount,
  getRequiredValueCount,
  hasPronouns,
} from './finishingTouches.js'

const limits = startingPoints.finishedCharacterLimits
const stepTitles = Object.fromEntries(creationSteps.steps.map((step) => [step.id, step.title]))
const LIFEPATH_STEPS = ['species', 'environment', 'earlyOutlook', 'education', 'career', 'careerHistory', 'finishingTouches']

const KIND_LABELS = {
  attributes: { plural: 'Attributes', singular: 'attribute', atMaxLimit: limits.attributesAtMax },
  disciplines: { plural: 'Disciplines', singular: 'discipline', atMaxLimit: limits.disciplinesAtMax },
}

const issue = (stepId, message) => ({ stepId, stepTitle: stepTitles[stepId], message })

function findDuplicates(texts) {
  const seen = new Map()
  const duplicates = new Set()
  for (const text of texts) {
    const key = text.trim().toLowerCase()
    if (seen.has(key)) duplicates.add(seen.get(key))
    else seen.set(key, text.trim())
  }
  return [...duplicates]
}

function validateStepsComplete(character) {
  return LIFEPATH_STEPS.filter((stepId) => !isStepComplete(stepId, character)).map((stepId) =>
    issue(stepId, `${stepTitles[stepId]} is not complete.`),
  )
}

// Book p.92 / p.129: attributes max 12 (only one at 12), total 56; disciplines max 5 (only one at 5), total 16.
function validateScores(character, kind) {
  const { entries, max, total } = getKindInfo(kind)
  const { plural, singular, atMaxLimit } = KIND_LABELS[kind]
  const final = getFinalScores(character, kind)
  if (!final) return [issue('finishingTouches', `${plural} are not finalized: choose both increases and resolve any scores over the limit.`)]

  const issues = []
  const sum = entries.reduce((acc, entry) => acc + final[entry.id], 0)
  if (sum !== total) issues.push(issue('finishingTouches', `${plural} total ${sum}; the book requires ${total}.`))
  const over = entries.filter((entry) => final[entry.id] > max)
  if (over.length) issues.push(issue('finishingTouches', `${over.map((entry) => entry.name).join(', ')} above the maximum of ${max}.`))
  const atMax = entries.filter((entry) => final[entry.id] === max)
  if (atMax.length > atMaxLimit) {
    issues.push(issue('finishingTouches', `Only one ${singular} may be at ${max}; ${atMax.map((entry) => entry.name).join(', ')} all are.`))
  }
  return issues
}

// Each duplicate points at the latest screen holding a copy; the message names every screen involved.
function duplicateIssues(entries, label) {
  return findDuplicates(entries.map((entry) => entry.text)).map((duplicate) => {
    const holders = [...new Set(entries.filter((entry) => entry.text.toLowerCase() === duplicate.toLowerCase()).map((entry) => entry.stepId))]
    const names = holders.map((stepId) => stepTitles[stepId]).join(' and ')
    return issue(holders[holders.length - 1], `${label} "${duplicate}" is chosen more than once (${names}). Change one of them.`)
  })
}

function validateValues(character) {
  const required = getRequiredValueCount()
  const values = getValueEntries(character)
  const countIssue = values.length === required ? [] : [issue('finishingTouches', `${values.length} of ${required} Values chosen.`)]
  return [...countIssue, ...duplicateIssues(values, 'Value')]
}

function validateFocuses(character) {
  const required = getRequiredFocusCount()
  const focuses = getFocusEntries(character).map((focus) => ({ stepId: focus.stepId, text: focus.name }))
  const countIssue = focuses.length === required ? [] : [issue('finishingTouches', `${focuses.length} of ${required} Focuses chosen.`)]
  return [...countIssue, ...duplicateIssues(focuses, 'Focus')]
}

// The core choice of each lifepath step, named explicitly so a character loaded from a file can't skip one even if
// a step's completeness check changes.
function validateLifepathChoices(character) {
  const { environment, earlyOutlook, education, career } = character
  const issues = []
  if (!getTraitEntries(character).length) issues.push(issue('species', 'No species trait.'))
  if (!environment.setting && !environment.condition) issues.push(issue('environment', 'No environment chosen.'))
  if (!earlyOutlook.outlook) issues.push(issue('earlyOutlook', 'No early outlook chosen.'))
  if (!education.option) issues.push(issue('education', 'No education chosen.'))
  if (!career.length) issues.push(issue('career', 'No career length chosen.'))
  return issues
}

// Book p.92: choose Name, Pronouns, Department, Rank, Assignment and Posting.
// Prototype: posting waits for ship creation, so it isn't checked here. Every assignment has a department (chosen
// by the player for Communications Officer) and every character a rank (No Rank for civilians), so both are required.
function validateService(character) {
  const { career, careerHistory, identity } = character
  const issues = []
  if (!identity.name.trim()) issues.push(issue('finishingTouches', 'The character has no name.'))
  if (!hasPronouns(identity)) issues.push(issue('finishingTouches', 'The character has no pronouns.'))
  if (!career.assignment) issues.push(issue('career', 'No assignment chosen.'))
  else if (getAssignmentBlock(character, career.assignment.id)) {
    issues.push(issue('career', `${career.assignment.name}: ${getAssignmentBlock(character, career.assignment.id)}.`))
  }
  if (!career.department) issues.push(issue('career', 'No department chosen.'))
  if (!career.rank) issues.push(issue('career', 'No rank chosen.'))
  else if (career.assignment && !isRankAllowed(character, career.rank.id)) {
    issues.push(issue('career', `${career.rank.name} is not allowed for this character as ${career.assignment.name}.`))
  }
  const events = careerHistory.events.filter((slot) => slot?.event).length
  if (events !== getEventCount()) issues.push(issue('careerHistory', `${events} of ${getEventCount()} Career Events chosen.`))
  return issues
}

// Every reason the character can't be confirmed, each tied to the screen that fixes it. Empty means valid.
export function validateCharacter(character) {
  if (!character.species) return [issue('species', 'No species chosen.')]
  return [
    ...validateStepsComplete(character),
    ...validateLifepathChoices(character),
    ...validateScores(character, 'attributes'),
    ...validateScores(character, 'disciplines'),
    ...validateValues(character),
    ...validateFocuses(character),
    ...validateService(character),
  ]
}

export const isCharacterValid = (character) => validateCharacter(character).length === 0
