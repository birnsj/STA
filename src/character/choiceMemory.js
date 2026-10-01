import { createEmptyCharacter } from './characterModel.js'
import { createSpeciesSelection } from '../rules/species.js'
import { getChosenEntry, selectCondition, selectSetting } from '../rules/environment.js'
import { createEmptyEarlyOutlook, selectOutlook } from '../rules/earlyOutlook.js'
import { createEmptyEducation, getOptionById, getOptions, selectEducationOption } from '../rules/education.js'
import { selectLength } from '../rules/career.js'
import { selectEvent as selectCareerEvent } from '../rules/careerHistory.js'

// Prototype: every card remembers the picks made under it. Switching cards stores the old card's picks and
// restores the new card's (or starts it empty). This is creator-session state and is never exported.
const createEmptyCards = () => ({ environment: {}, earlyOutlook: {}, education: {}, educationCategory: {}, careerLength: {}, careerEvent: {} })

// bySpecies holds a whole character (and its card memory) per species, so returning to a species restores every screen.
export const createEmptyMemory = () => ({ cards: createEmptyCards(), bySpecies: {} })

const withCards = (memory, changes) => ({ ...memory, cards: { ...memory.cards, ...changes } })

export function switchSpecies(state, speciesId) {
  const { character, memory } = state
  const currentId = character.species?.id
  if (currentId === speciesId) return state
  const bySpecies = currentId ? { ...memory.bySpecies, [currentId]: { character, cards: memory.cards } } : memory.bySpecies
  const saved = bySpecies[speciesId]
  // Name, portrait, and notes belong to the player's character, not to a species, so they carry across.
  const kept = { identity: character.identity, backgroundNotes: character.backgroundNotes }
  if (saved) return { character: { ...saved.character, ...kept }, memory: { cards: saved.cards, bySpecies } }
  return {
    character: { ...createEmptyCharacter(), species: createSpeciesSelection(speciesId), ...kept },
    memory: { cards: createEmptyCards(), bySpecies },
  }
}

// The value is a screen-level choice (shown before any card is picked), so it is not per card.
// Setting and condition ids never collide, so one map holds both kinds of card.
const environmentCardPicks = ({ otherSpecies, attributeBonus, disciplineBonus }) => ({ otherSpecies, attributeBonus, disciplineBonus })
const EMPTY_ENVIRONMENT_PICKS = { otherSpecies: null, attributeBonus: null, disciplineBonus: null }

export function switchEnvironmentCard(state, kind, entryId) {
  const { character, memory } = state
  const current = character.environment
  const currentId = getChosenEntry(current)?.id
  if (currentId === entryId) return state
  const saved = currentId ? { ...memory.cards.environment, [currentId]: environmentCardPicks(current) } : memory.cards.environment
  const selected = kind === 'condition' ? selectCondition(current, entryId) : selectSetting(current, entryId)
  const environment = { ...selected, ...EMPTY_ENVIRONMENT_PICKS, ...saved[entryId] }
  return { character: { ...character, environment }, memory: withCards(memory, { environment: saved }) }
}

export function switchEarlyOutlook(state, outlookId) {
  const { character, memory } = state
  const current = character.earlyOutlook
  if (current.outlook?.id === outlookId) return state
  const fresh = selectOutlook({ ...character, earlyOutlook: createEmptyEarlyOutlook() }, outlookId)
  if (fresh.outlook?.id !== outlookId) return state
  const saved = current.outlook ? { ...memory.cards.earlyOutlook, [current.outlook.id]: current } : memory.cards.earlyOutlook
  return {
    character: { ...character, earlyOutlook: saved[outlookId] ?? fresh },
    memory: withCards(memory, { earlyOutlook: saved }),
  }
}

export function switchEducationOption(state, optionId) {
  const { character, memory } = state
  const current = character.education
  const option = getOptionById(optionId)
  if (!option || current.option?.id === optionId) return state
  const saved = current.option ? { ...memory.cards.education, [current.option.id]: current } : memory.cards.education
  const education = saved[optionId] ?? selectEducationOption({ ...character, education: createEmptyEducation() }, optionId)
  return {
    character: { ...character, education },
    memory: withCards(memory, {
      education: saved,
      educationCategory: { ...memory.cards.educationCategory, [option.category]: optionId },
    }),
  }
}

// Only the value belongs to a length card; assignment and rank are screen-level choices that length doesn't limit.
export function switchCareerLength(state, lengthId) {
  const { character, memory } = state
  const current = character.career
  const currentId = current.length?.id
  if (currentId === lengthId) return state
  const next = selectLength(current, lengthId)
  if (next === current) return state
  const saved = currentId ? { ...memory.cards.careerLength, [currentId]: current.value } : memory.cards.careerLength
  return {
    character: { ...character, career: { ...next, value: saved[lengthId] ?? null } },
    memory: withCards(memory, { careerLength: saved }),
  }
}

// Picks are remembered per event (events are unique across slots), so re-choosing an event restores them.
export function switchCareerEvent(state, slotIndex, eventId) {
  const { character, memory } = state
  const history = character.careerHistory
  const current = history.events[slotIndex]
  if (current?.event.id === eventId) return state
  const saved = current ? { ...memory.cards.careerEvent, [current.event.id]: current } : memory.cards.careerEvent
  const next = selectCareerEvent(history, slotIndex, eventId, saved[eventId])
  if (next === history) return state
  return { character: { ...character, careerHistory: next }, memory: withCards(memory, { careerEvent: saved }) }
}

// A category card returns to the option last chosen in it, or its first option.
export function switchEducationCategory(state, categoryId) {
  if (getOptionById(state.character.education.option?.id)?.category === categoryId) return state
  const optionId = state.memory.cards.educationCategory[categoryId] ?? getOptions(categoryId)[0]?.id
  return optionId ? switchEducationOption(state, optionId) : state
}
