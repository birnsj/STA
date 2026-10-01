import creationSteps from '../data/adaptation/creationSteps.json'
import valuesMatrix from '../data/source/valuesMatrix.json'
import { getTraitDescription } from './species.js'

const stepTitles = Object.fromEntries(creationSteps.steps.map((step) => [step.id, step.title]))

// Values and focuses with the creation step that granted each, for the Review sheet and duplicate checks.
export function getValueEntries(character) {
  return [
    ['environment', character.environment.value],
    ['education', character.education.value],
    ['career', character.career.value],
    ['finishingTouches', character.finishingTouches.value],
  ]
    .filter(([, value]) => value?.text.trim())
    .map(([stepId, value]) => ({ stepId, text: value.text.trim() }))
}

// Prototype: a value the character already has from another screen can't be picked again, since the finished
// character needs four different values. Keys are lower-case texts.
export function getValuesHeldElsewhere(character, stepId) {
  return new Map(
    getValueEntries(character)
      .filter((entry) => entry.stepId !== stepId)
      .map((entry) => [entry.text.toLowerCase(), stepTitles[entry.stepId]]),
  )
}

export function isMatrixValueHeldElsewhere(character, valueId, stepId) {
  const entry = valuesMatrix.values.find((value) => value.id === valueId)
  return Boolean(entry) && getValuesHeldElsewhere(character, stepId).has(entry.text.trim().toLowerCase())
}

export function getFocusEntries(character) {
  const outlook = [{ stepId: 'earlyOutlook', slotIndex: null, focus: character.earlyOutlook.focus }]
  const education = character.education.focuses.map((focus) => ({ stepId: 'education', slotIndex: null, focus }))
  const events = character.careerHistory.events.map((slot, slotIndex) => ({ stepId: 'careerHistory', slotIndex, focus: slot?.focus }))
  return [...outlook, ...education, ...events]
    .filter(({ focus }) => focus?.name.trim())
    .map(({ stepId, slotIndex, focus }) => ({ stepId, slotIndex, name: focus.name.trim() }))
}

// Prototype: a focus the character already has from another screen (or the other career event) can't be picked
// again, since the finished character needs six different focuses. Keys are lower-case names.
export function getFocusesHeldElsewhere(character, stepId, slotIndex = null) {
  const held = new Map()
  for (const entry of getFocusEntries(character)) {
    if (entry.stepId === stepId && entry.slotIndex === slotIndex) continue
    const where = entry.stepId === 'careerHistory' ? `Event ${entry.slotIndex + 1}` : stepTitles[entry.stepId]
    held.set(entry.name.toLowerCase(), where)
  }
  return held
}

export const isFocusHeldElsewhere = (character, name, stepId, slotIndex = null) =>
  getFocusesHeldElsewhere(character, stepId, slotIndex).has(name.trim().toLowerCase())

// Book: only Step One (Species) grants traits.
export function getTraitEntries(character) {
  const { species } = character
  if (!species) return []
  return species.traits.map((trait) => ({ id: trait.id, name: trait.name, description: getTraitDescription(species) }))
}
