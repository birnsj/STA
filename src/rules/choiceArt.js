import summaryCopy from '../data/adaptation/stepSummaries.json'

// Card art for a choice ('species' | 'environment' | 'earlyOutlook' | 'education' | 'educationCategory'): a path into public/
// built from the pattern in stepSummaries.json. Missing files fall back to the placeholder portrait.
export function getChoiceArt(kind, id) {
  const pattern = summaryCopy.images[kind]
  return pattern && id ? pattern.replace('{id}', id) : null
}

export const withChoiceArt = (kind, entries) => entries.map((entry) => ({ ...entry, image: getChoiceArt(kind, entry.id) }))

// Species art follows the chosen gender (presentation only); with no gender chosen the default art is used.
export const getSpeciesArt = (speciesId, genderId) => getChoiceArt(genderId === 'female' ? 'speciesFemale' : 'species', speciesId)
