import { getSpeciesArt } from './choiceArt.js'
import speciesSource from '../data/source/species.json'
import attributeSource from '../data/source/attributes.json'
import speciesAbilitySource from '../data/source/speciesAbilities.json'
import prototypeSpecies from '../data/adaptation/prototypeSpecies.json'
import { areAllMet } from './requirements.js'

const speciesById = new Map(speciesSource.species.map((species) => [species.id, species]))
const abilityBySpeciesId = new Map(speciesAbilitySource.abilities.map((ability) => [ability.speciesId, ability]))
const attributes = attributeSource.attributes
const toRef = (entry) => ({ id: entry.id, name: entry.name })

export function getAttributes() {
  return attributes
}

// Every card in the species carousel, including Mixed Heritage and New Species.
export function getAvailableSpecies(genderId = null) {
  return prototypeSpecies.speciesIds.map((id) => ({ ...speciesById.get(id), image: getSpeciesArt(id, genderId) }))
}

// Only real species (for mixed-heritage parents and "Another Species' World").
export function getBaseSpecies() {
  return getAvailableSpecies().filter((species) => !species.variant)
}

export function getSpeciesById(speciesId) {
  return speciesById.get(speciesId) ?? null
}

export const isMixedHeritage = (species) => species?.variant === 'mixedHeritage'
export const isNewSpecies = (species) => species?.variant === 'newSpecies'

export function hasAttributeChoice(species) {
  return species.attributeBonus.type !== 'fixed'
}

// Attributes this species can grant a bonus to; choice-based species (Human) can grant any.
export function getPossibleBonusAttributeIds(species) {
  return species.attributeBonus.type === 'fixed' ? species.attributeBonus.attributes : attributes.map((attribute) => attribute.id)
}

export function getRequiredAttributeChoices(species) {
  return hasAttributeChoice(species) ? species.attributeBonus.count : 0
}

// Keeps the given order: for chosen bonuses that is pick order, which decides which pick a full list swaps out.
function toAttributeBonuses(attributeIds, amount) {
  return attributeIds
    .map((id) => attributes.find((attribute) => attribute.id === id))
    .filter(Boolean)
    .map((attribute) => ({ id: attribute.id, name: attribute.name, value: amount }))
}

// Book p.74: "a character has at least a single trait – their species".
// Prototype: mixed heritage is one combined trait ("Human/Vulcan"), only once both parents are chosen;
// a new species uses the player's name for it.
export function deriveTraits(selection) {
  const species = getSpeciesById(selection.id)
  if (isMixedHeritage(species)) {
    if (!selection.parents.every(Boolean)) return []
    return [{ id: species.id, name: selection.parents.map((parent) => parent.name).join('/') }]
  }
  if (isNewSpecies(species)) return selection.customName.trim() ? [{ id: species.id, name: selection.customName.trim() }] : []
  return [toRef(species)]
}

export function getTraitDescription(selection) {
  const species = getSpeciesById(selection.id)
  if (isNewSpecies(species)) return selection.description
  if (isMixedHeritage(species)) {
    return selection.parents.filter(Boolean).map((parent) => getSpeciesById(parent.id).description).join(' ')
  }
  return species?.description ?? ''
}

// Book (Core p.99): mixed heritage has the ability of the primary species. Prototype: the player picks which parent.
function abilitySpeciesId(selection) {
  if (!selection.parents) return selection.id
  const primaryId = selection.primarySpeciesId ?? null
  return selection.parents.some((parent) => parent?.id === primaryId) ? primaryId : null
}

// STA 2E Species Ability (see speciesAbilities.json). Looked up by species id rather than read from the saved
// selection, so characters saved before abilities existed still get theirs. Null when the species has none.
export function getSpeciesAbility(selection) {
  if (!selection) return null
  const ability = abilityBySpeciesId.get(abilitySpeciesId(selection))
  if (!ability) return null
  const { id, name, description, effects, source } = ability
  return { id, name, description, effects, source }
}

// Why there is no ability ({ label, note }: primary species not chosen yet, or a new species), or null.
export function getSpeciesAbilityGap(selection) {
  if (!selection || getSpeciesAbility(selection)) return null
  return speciesAbilitySource.withoutAbility[selection.id] ?? null
}

// Sets the stored ability reference from the species id, so saves from before abilities existed (or edited files)
// always carry the ability of the species they actually are.
export function withSpeciesAbility(selection) {
  if (!selection) return selection
  const ability = getSpeciesAbility(selection)
  return { ...selection, speciesAbility: ability ? toRef(ability) : null }
}

export function hasCurrentSpeciesAbility(selection) {
  return (selection?.speciesAbility?.id ?? null) === (getSpeciesAbility(selection)?.id ?? null)
}

// Display text for summary rows: the ability name, a pending note, or null before a species is chosen.
export function getSpeciesAbilityLabel(selection) {
  return getSpeciesAbility(selection)?.name ?? getSpeciesAbilityGap(selection)?.label ?? null
}

// Hover text for compact rows: "Name: description" (or why it is undefined).
export function getSpeciesAbilityTitle(selection) {
  const ability = getSpeciesAbility(selection)
  if (ability) return `${ability.name}: ${ability.description}`
  return getSpeciesAbilityGap(selection)?.note ?? null
}

// Builds the character's species entry. Choice-based entries start with no bonuses until the player picks them.
export function createSpeciesSelection(speciesId) {
  const species = getSpeciesById(speciesId)
  if (!species) {
    throw new Error(`Unknown species: ${speciesId}`)
  }
  const { attributeBonus } = species
  const bonusIds = attributeBonus.type === 'fixed' ? attributeBonus.attributes : []
  const selection = {
    id: species.id,
    name: species.name,
    attributeBonuses: toAttributeBonuses(bonusIds, attributeBonus.amount),
  }
  if (isMixedHeritage(species)) Object.assign(selection, { parents: [null, null], primarySpeciesId: null })
  if (isNewSpecies(species)) Object.assign(selection, { customName: '', description: '' })
  return withSpeciesAbility({ ...selection, traits: deriveTraits(selection) })
}

// Attributes the player may currently pick from (mixed heritage: the union of both parents' bonuses).
export function getChoosableAttributeIds(selection) {
  const species = getSpeciesById(selection.id)
  if (!species || !hasAttributeChoice(species)) return []
  if (!isMixedHeritage(species)) return attributes.map((attribute) => attribute.id)
  const ids = new Set()
  for (const parent of selection.parents.filter(Boolean)) {
    getPossibleBonusAttributeIds(getSpeciesById(parent.id)).forEach((id) => ids.add(id))
  }
  return [...ids]
}

export function canToggleAttributeChoice(selection, attributeId) {
  const species = getSpeciesById(selection.id)
  if (!species || !hasAttributeChoice(species)) return false
  const isChosen = selection.attributeBonuses.some((bonus) => bonus.id === attributeId)
  if (isChosen) return true
  return getChoosableAttributeIds(selection).includes(attributeId)
}

// Prototype: when all choices are made, a new pick replaces the oldest one instead of being blocked.
export function toggleAttributeChoice(selection, attributeId) {
  if (!canToggleAttributeChoice(selection, attributeId)) return selection
  const species = getSpeciesById(selection.id)
  const chosenIds = selection.attributeBonuses.map((bonus) => bonus.id)
  const isFull = chosenIds.length >= species.attributeBonus.count
  const nextIds = chosenIds.includes(attributeId)
    ? chosenIds.filter((id) => id !== attributeId)
    : [...(isFull ? chosenIds.slice(1) : chosenIds), attributeId]
  return { ...selection, attributeBonuses: toAttributeBonuses(nextIds, species.attributeBonus.amount) }
}

// Book p.91: parents are from different species, so the other parent's species is not offered.
export function getParentOptions(selection, index) {
  const otherParentId = selection.parents?.[1 - index]?.id
  return getBaseSpecies().filter((species) => species.id !== otherParentId)
}

export function setMixedParent(selection, index, speciesId) {
  if (!selection.parents) return selection
  const parent = speciesId ? getSpeciesById(speciesId) : null
  const parents = selection.parents.map((existing, i) => (i === index ? (parent ? toRef(parent) : null) : existing))
  const keepsPrimary = parents.some((entry) => entry?.id === selection.primarySpeciesId)
  const next = { ...selection, parents, primarySpeciesId: keepsPrimary ? selection.primarySpeciesId : null }
  const choosable = getChoosableAttributeIds(next)
  next.attributeBonuses = selection.attributeBonuses.filter((bonus) => choosable.includes(bonus.id))
  return withSpeciesAbility({ ...next, traits: deriveTraits(next) })
}

export function setPrimaryParent(selection, speciesId) {
  if (!selection.parents?.some((parent) => parent?.id === speciesId)) return selection
  return withSpeciesAbility({ ...selection, primarySpeciesId: speciesId })
}

export const isPrimaryParentChosen = (selection) => !selection.parents || abilitySpeciesId(selection) !== null

export function setNewSpeciesName(selection, customName) {
  if (!('customName' in selection)) return selection
  const next = { ...selection, customName }
  return { ...next, traits: deriveTraits(next) }
}

export function setNewSpeciesDescription(selection, description) {
  if (!('description' in selection)) return selection
  return { ...selection, description }
}

// The species ids this character belongs to (both parents for mixed heritage).
export function getOwnSpeciesIds(selection) {
  if (!selection) return []
  if (selection.parents) return selection.parents.filter(Boolean).map((parent) => parent.id)
  return [selection.id]
}

export function getSpeciesDisplayName(selection) {
  if (!selection) return null
  if (selection.parents) {
    const names = selection.parents.filter(Boolean).map((parent) => parent.name)
    return names.length ? `${names.join(' / ')} (Mixed)` : selection.name
  }
  if ('customName' in selection) return selection.customName.trim() || selection.name
  return selection.name
}

export function getAttributeBonus(selection, attributeId) {
  return selection?.attributeBonuses.find((bonus) => bonus.id === attributeId)?.value ?? 0
}

// Prototype: Screen 1 also asks for gender (presentation only, see rules/appearance.js); it sits between the species
// details and the traits on screen, so it is required in that order.
export function getSpeciesRequirements(character) {
  const selection = character.species
  const species = selection ? getSpeciesById(selection.id) : null
  const gender = Boolean(character.identity.gender)
  if (!species) return { species: false, gender, traits: false, attributes: false }
  const parentsChosen = !isMixedHeritage(species) || (selection.parents.every(Boolean) && isPrimaryParentChosen(selection))
  const nameGiven = !isNewSpecies(species) || Boolean(selection.customName.trim())
  return {
    species: true,
    gender,
    traits: parentsChosen && nameGiven,
    attributes: !hasAttributeChoice(species) || selection.attributeBonuses.length === species.attributeBonus.count,
  }
}

export const isSpeciesStepComplete = (character) => areAllMet(getSpeciesRequirements(character))
