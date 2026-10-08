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
  return Boolean(species) && species.attributeBonus.type !== 'fixed'
}

// Attributes this species can grant a bonus to; choice-based species (Human) can grant any.
export function getPossibleBonusAttributeIds(species) {
  return species.attributeBonus.type === 'fixed' ? species.attributeBonus.attributes : attributes.map((attribute) => attribute.id)
}

export function getRequiredAttributeChoices(species) {
  return hasAttributeChoice(species) ? species.attributeBonus.count : 0
}

// Core p.99: a mixed-heritage character takes the attribute bonuses of the primary species (null until it is chosen).
export function getBonusSpecies(selection) {
  if (!selection) return null
  if (!selection.parents) return getSpeciesById(selection.id)
  const primaryId = abilitySpeciesId(selection)
  return primaryId ? getSpeciesById(primaryId) : null
}

// Keeps the given order: for chosen bonuses that is pick order, which decides which pick a full list swaps out.
function toAttributeBonuses(attributeIds, amount) {
  return attributeIds
    .map((id) => attributes.find((attribute) => attribute.id === id))
    .filter(Boolean)
    .map((attribute) => ({ id: attribute.id, name: attribute.name, value: amount }))
}

// CL p.74 (Core p.87): "a character has at least a single trait – their species".
// Core p.99: mixed heritage gains the species traits of both parents (one trait per chosen parent);
// a new species uses the player's name for it.
export function deriveTraits(selection) {
  const species = getSpeciesById(selection.id)
  if (isMixedHeritage(species)) return selection.parents.filter(Boolean).map(toRef)
  if (isNewSpecies(species)) return selection.customName.trim() ? [{ id: species.id, name: selection.customName.trim() }] : []
  return [toRef(species)]
}

// traitId picks one parent's trait for mixed heritage; without it, both descriptions are joined.
export function getTraitDescription(selection, traitId = null) {
  const species = getSpeciesById(selection.id)
  if (isNewSpecies(species)) return selection.description
  if (isMixedHeritage(species)) {
    const parents = selection.parents.filter((parent) => parent && (!traitId || parent.id === traitId))
    return parents.map((parent) => getSpeciesById(parent.id).description).join(' ')
  }
  return species?.description ?? ''
}

// Book (Core p.99): mixed heritage has the ability of the primary species. Prototype: the player picks which parent.
function abilitySpeciesId(selection) {
  if (!selection.parents) return selection.id
  const primaryId = selection.primarySpeciesId ?? null
  return selection.parents.some((parent) => parent?.id === primaryId) ? primaryId : null
}

// Core p.114: a new species' player creates its Species Ability. Prototype: a written name and description, no effects.
export const CUSTOM_ABILITY_ID = 'custom'

function customAbility(selection) {
  const { name, description } = selection.speciesAbility ?? {}
  return { id: CUSTOM_ABILITY_ID, name: typeof name === 'string' ? name : '', description: typeof description === 'string' ? description : '' }
}

// STA 2E Species Ability (see speciesAbilities.json). Looked up by species id rather than read from the saved
// selection, so characters saved before abilities existed still get theirs. A new species' ability is the player's
// own, complete once named and described. Null when there is none (yet).
export function getSpeciesAbility(selection) {
  if (!selection) return null
  if (isNewSpecies(getSpeciesById(selection.id))) {
    const { id, name, description } = customAbility(selection)
    if (!name.trim() || !description.trim()) return null
    return { id, name: name.trim(), description: description.trim(), effects: [], source: null }
  }
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
  if (isNewSpecies(getSpeciesById(selection.id))) return { ...selection, speciesAbility: customAbility(selection) }
  const ability = getSpeciesAbility(selection)
  return { ...selection, speciesAbility: ability ? toRef(ability) : null }
}

// A new species' unfinished ability is caught by the Species step requirements, not here.
export function hasCurrentSpeciesAbility(selection) {
  const expectedId = isNewSpecies(getSpeciesById(selection?.id)) ? CUSTOM_ABILITY_ID : (getSpeciesAbility(selection)?.id ?? null)
  return (selection?.speciesAbility?.id ?? null) === expectedId
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

// Whether the player picks this selection's bonuses (mixed heritage: only once a choice-based primary is chosen).
export const hasSelectionAttributeChoice = (selection) => hasAttributeChoice(getBonusSpecies(selection))

// Attributes the player may currently pick from (mixed heritage: as for the primary species).
export function getChoosableAttributeIds(selection) {
  const species = getBonusSpecies(selection)
  if (!hasAttributeChoice(species)) return []
  return getPossibleBonusAttributeIds(species)
}

export function canToggleAttributeChoice(selection, attributeId) {
  if (!hasSelectionAttributeChoice(selection)) return false
  const isChosen = selection.attributeBonuses.some((bonus) => bonus.id === attributeId)
  if (isChosen) return true
  return getChoosableAttributeIds(selection).includes(attributeId)
}

// Prototype: when all choices are made, a new pick replaces the oldest one instead of being blocked.
export function toggleAttributeChoice(selection, attributeId) {
  if (!canToggleAttributeChoice(selection, attributeId)) return selection
  const species = getBonusSpecies(selection)
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

// Mixed-heritage bonuses follow the primary parent: its fixed bonuses, or the player's still-valid picks when it
// lets the player choose (Human); none until the primary is chosen.
function settleMixedBonuses(selection) {
  const species = getBonusSpecies(selection)
  if (!species) return { ...selection, attributeBonuses: [] }
  const { attributeBonus } = species
  if (!hasAttributeChoice(species)) return { ...selection, attributeBonuses: toAttributeBonuses(attributeBonus.attributes, attributeBonus.amount) }
  const possible = getPossibleBonusAttributeIds(species)
  const keptIds = selection.attributeBonuses.map((bonus) => bonus.id).filter((id) => possible.includes(id)).slice(-attributeBonus.count)
  return { ...selection, attributeBonuses: toAttributeBonuses(keptIds, attributeBonus.amount) }
}

export function setMixedParent(selection, index, speciesId) {
  if (!selection.parents) return selection
  const parent = speciesId ? getSpeciesById(speciesId) : null
  const parents = selection.parents.map((existing, i) => (i === index ? (parent ? toRef(parent) : null) : existing))
  const keepsPrimary = parents.some((entry) => entry?.id === selection.primarySpeciesId)
  const next = settleMixedBonuses({ ...selection, parents, primarySpeciesId: keepsPrimary ? selection.primarySpeciesId : null })
  return withSpeciesAbility({ ...next, traits: deriveTraits(next) })
}

// A new primary starts its bonuses afresh, so one parent's fixed bonuses never become picks for the other.
export function setPrimaryParent(selection, speciesId) {
  if (!selection.parents?.some((parent) => parent?.id === speciesId)) return selection
  if (selection.primarySpeciesId === speciesId) return selection
  return withSpeciesAbility(settleMixedBonuses({ ...selection, primarySpeciesId: speciesId, attributeBonuses: [] }))
}

// Brings a saved selection up to the current rules (mixed-heritage bonuses and traits, the stored ability).
export function reconcileSpeciesSelection(selection) {
  const species = getSpeciesById(selection?.id)
  if (!species) return selection
  const settled = isMixedHeritage(species) && Array.isArray(selection.parents) ? settleMixedBonuses(selection) : selection
  return withSpeciesAbility({ ...settled, traits: deriveTraits(settled) })
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

// Placeholder text the Auto button writes for an unwritten new-species ability (not book text).
export const getNewSpeciesAutoAbility = () => speciesAbilitySource.withoutAbility.newSpecies.autoFill

// changes: { name?, description? } for a new species' own Species Ability.
export function setNewSpeciesAbility(selection, changes) {
  if (!isNewSpecies(getSpeciesById(selection.id))) return selection
  const ability = customAbility(selection)
  for (const key of ['name', 'description']) if (typeof changes?.[key] === 'string') ability[key] = changes[key]
  return { ...selection, speciesAbility: ability }
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
  // Core p.114: a new species needs its own Species Ability as well as a name.
  const nameGiven = !isNewSpecies(species) || (Boolean(selection.customName.trim()) && Boolean(getSpeciesAbility(selection)))
  const bonusSpecies = getBonusSpecies(selection)
  return {
    species: true,
    gender,
    traits: parentsChosen && nameGiven,
    attributes: Boolean(bonusSpecies) && (!hasAttributeChoice(bonusSpecies) || selection.attributeBonuses.length === bonusSpecies.attributeBonus.count),
  }
}

export const isSpeciesStepComplete = (character) => areAllMet(getSpeciesRequirements(character))
