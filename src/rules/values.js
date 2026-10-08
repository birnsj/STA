// Value choices offered on lifepath screens: the book's Sample Values (Core p.96) plus the example values the
// book gives for a particular choice (species sidebars Core pp.100-113, Experience Core pp.127-128).
import valuesMatrix from '../data/source/valuesMatrix.json'
import speciesValues from '../data/source/speciesValues.json'
import careerLengths from '../data/source/careerLengths.json'

const exampleValues = [
  ...Object.values(speciesValues.species).flatMap((entry) => entry.values),
  ...careerLengths.lengths.flatMap((length) => length.valueExamples),
]
const valuesById = new Map([...valuesMatrix.values, ...exampleValues].map((value) => [value.id, value]))

export const getSampleValues = () => valuesMatrix.values
export const getValueById = (id) => valuesById.get(id) ?? null

// Example values from the species sidebars, in the order given, skipping species the book has no sidebar for.
export function getSpeciesValueExamples(speciesIds) {
  const seen = new Set()
  return speciesIds
    .flatMap((id) => speciesValues.species[id]?.values ?? [])
    .filter((value) => !seen.has(value.id) && seen.add(value.id))
}

export const getSpeciesValuePage = (speciesId) => speciesValues.species[speciesId]?.page ?? null

// Saved characters may hold ids from older value lists; keep the text but treat it as the player's own wording.
export function reconcileValue(value) {
  if (!value?.matrixId || getValueById(value.matrixId)) return value
  return { ...value, matrixId: null }
}
