import startingPoints from '../data/source/startingPoints.json'
import disciplineSource from '../data/source/disciplines.json'
import attributeSource from '../data/source/attributes.json'

// Every lifepath score change with the step (and career event slot) that made it, in lifepath order.
// Totals are built from these, so the Step Complete summaries can trace each point to its source.
const contribution = (stepId, bonus, slotIndex = null) => (bonus ? { stepId, slotIndex, id: bonus.id, name: bonus.name, value: bonus.value } : null)

export function getAttributeContributions(character) {
  return [
    ...(character.species?.attributeBonuses ?? []).map((bonus) => contribution('species', bonus)),
    contribution('environment', character.environment.attributeBonus),
    ...character.earlyOutlook.attributeBonuses.map((bonus) => contribution('earlyOutlook', bonus)),
    ...character.education.attributeBonuses.map((bonus) => contribution('education', bonus)),
    ...character.careerHistory.events.map((slot, index) => contribution('careerHistory', slot?.attributeBonus, index)),
  ].filter(Boolean)
}

export function getDisciplineContributions(character) {
  return [
    contribution('environment', character.environment.disciplineBonus),
    contribution('earlyOutlook', character.earlyOutlook.disciplineBonus),
    ...character.education.disciplineBonuses.map((bonus) => contribution('education', bonus)),
    ...character.careerHistory.events.map((slot, index) => contribution('careerHistory', slot?.disciplineBonus, index)),
  ].filter(Boolean)
}

export function sumContributions(entries, start, contributions) {
  const totals = Object.fromEntries(entries.map((entry) => [entry.id, start]))
  for (const { id, value } of contributions) totals[id] += value
  return totals
}

// Attribute scores accumulated from the starting points and every lifepath step so far.
export function getAttributeTotals(character) {
  return sumContributions(attributeSource.attributes, startingPoints.attributeStart, getAttributeContributions(character))
}

// Discipline scores accumulated through Step Six (Career Events), before Finishing Touches.
export function getDisciplineTotals(character) {
  return sumContributions(disciplineSource.disciplines, startingPoints.disciplineStart, getDisciplineContributions(character))
}

// Discipline scores accumulated from the starting points and every lifepath step before Education.
export function getDisciplineTotalsBeforeEducation(character) {
  const earlier = getDisciplineContributions(character).filter((entry) => entry.stepId === 'environment' || entry.stepId === 'earlyOutlook')
  return sumContributions(disciplineSource.disciplines, startingPoints.disciplineStart, earlier)
}
