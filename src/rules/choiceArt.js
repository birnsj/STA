import summaryCopy from '../data/adaptation/stepSummaries.json'

// Card art for a choice ('species' | 'environment' | 'earlyOutlook' | 'education' | 'educationCategory'): a path into public/
// built from the pattern in stepSummaries.json. Missing files fall back to the placeholder portrait.
export function getChoiceArt(kind, id) {
  const pattern = summaryCopy.images[kind]
  return pattern && id ? pattern.replace('{id}', id) : null
}

export const withChoiceArt = (kind, entries) => entries.map((entry) => ({ ...entry, image: getChoiceArt(kind, entry.id) }))

// Species card / detail art is gender-neutral. Gender only filters portraits later (Finishing Touches).
// genderId is ignored; kept so existing call sites need not change.
export const getSpeciesArt = (speciesId, _genderId = null) => getChoiceArt('species', speciesId)

// Screen 01 Species Details when no species is selected (custom empty art instead of the hatched placeholder).
export function getEmptySpeciesArt() {
  return summaryCopy.images.emptySpecies || null
}

// Character Summary portrait when none is chosen yet (right-hand column on every creator screen).
export function getEmptyPortraitArt() {
  return summaryCopy.images.emptyPortrait || null
}
