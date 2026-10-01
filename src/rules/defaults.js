import defaults from '../data/adaptation/defaults.json'
import { createSpeciesSelection, getAvailableSpecies } from './species.js'
import { getSettings, selectSetting } from './environment.js'
import { getApproaches, getOutlooks, selectOutlook } from './earlyOutlook.js'
import { getCategories, getOptions as getEducationOptions, selectEducationOption } from './education.js'
import { getCareerLengths, selectLength } from './career.js'

// Optionally pre-selects the first species card (see defaults.json); every later screen starts with nothing selected.
export function applyDefaultSelections(character) {
  if (!defaults.preselectFirstSpecies || character.species) return character
  return { ...character, species: createSpeciesSelection(getAvailableSpecies()[0].id) }
}

// Selects the first card on any screen where none is chosen yet (used by the dev autofill).
export function selectFirstCards(character) {
  let next = character
  if (!next.species) next = { ...next, species: createSpeciesSelection(getAvailableSpecies()[0].id) }
  if (!next.environment.setting && !next.environment.condition) {
    next = { ...next, environment: selectSetting(next.environment, getSettings()[0].id) }
  }
  if (!next.earlyOutlook.outlook) {
    next = { ...next, earlyOutlook: selectOutlook(next, getOutlooks(getApproaches()[0].id)[0].id) }
  }
  if (!next.education.option) {
    next = { ...next, education: selectEducationOption(next, getEducationOptions(getCategories()[0].id)[0].id) }
  }
  if (!next.career.length) {
    next = { ...next, career: selectLength(next.career, getCareerLengths()[0].id) }
  }
  return next
}
