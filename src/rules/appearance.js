// Prototype presentation rules (not book mechanics): gender and portraits. Neither affects any score or trait.
import genderData from '../data/adaptation/genders.json'
import portraitData from '../data/adaptation/portraits.json'
import { getSpeciesById, isMixedHeritage, isNewSpecies } from './species.js'

export const getGenders = () => genderData.genders
export const getGenderById = (genderId) => genderData.genders.find((gender) => gender.id === genderId) ?? null

export function setGender(identity, genderId) {
  const gender = getGenderById(genderId)
  return gender ? { ...identity, gender: { id: gender.id, name: gender.name } } : identity
}

export const getPortraitById = (portraitId) => portraitData.portraits.find((portrait) => portrait.id === portraitId) ?? null

// Species + Gender -> portrait set. Mixed Heritage and New Species see every species' portraits for the gender.
// Empty until both species and gender are chosen.
export function getAvailablePortraits(character) {
  const gender = character.identity.gender
  const species = character.species ? getSpeciesById(character.species.id) : null
  if (!gender || !species) return []
  const anySpecies = isMixedHeritage(species) || isNewSpecies(species)
  return portraitData.portraits.filter((portrait) => portrait.gender === gender.id && (anySpecies || portrait.species === species.id))
}

export const isPortraitAvailable = (character, portraitId) => getAvailablePortraits(character).some((portrait) => portrait.id === portraitId)

export function selectPortrait(character, portraitId) {
  const portrait = getPortraitById(portraitId)
  if (!portrait || !isPortraitAvailable(character, portraitId)) return character.identity
  return { ...character.identity, portrait: { id: portrait.id, name: portrait.name } }
}

// A chosen portrait that no longer fits the species/gender is replaced from the new set, keeping the same
// variant number where possible (Vulcan Female 3 -> Human Female 3). With no valid set it is cleared.
export function reconcilePortrait(character) {
  const current = character.identity.portrait
  if (!current || isPortraitAvailable(character, current.id)) return character
  const available = getAvailablePortraits(character)
  const variant = getPortraitById(current.id)?.variant
  const replacement = available.find((portrait) => portrait.variant === variant) ?? available[0] ?? null
  const portrait = replacement ? { id: replacement.id, name: replacement.name } : null
  return { ...character, identity: { ...character.identity, portrait } }
}
