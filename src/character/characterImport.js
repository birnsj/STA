import { withSpeciesAbility } from '../rules/species.js'
import { createEmptyCharacter } from './characterModel.js'

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// The creator's default sections, with the entry's own on top (one level deep, as persistence.js upgrades saves).
// empty: optional base from the caller (defaults to createEmptyCharacter()).
export function withCreatorShape(authored, empty = createEmptyCharacter()) {
  const character = empty
  Object.entries(authored ?? {}).forEach(([key, value]) => {
    character[key] = isPlainObject(character[key]) && isPlainObject(value) ? { ...character[key], ...value } : value
  })
  return { ...character, species: withSpeciesAbility(character.species) }
}
