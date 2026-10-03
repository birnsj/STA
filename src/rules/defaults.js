import defaults from '../data/adaptation/defaults.json'
import { createSpeciesSelection, getAvailableSpecies } from './species.js'

// Optionally pre-selects the first species card (see defaults.json); every later screen starts with nothing selected.
export function applyDefaultSelections(character) {
  if (!defaults.preselectFirstSpecies || character.species) return character
  return { ...character, species: createSpeciesSelection(getAvailableSpecies()[0].id) }
}
