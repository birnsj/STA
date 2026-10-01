import eventSource from '../data/source/careerEvents.json'
import attributeSource from '../data/source/attributes.json'
import disciplineSource from '../data/source/disciplines.json'
import historyAdaptation from '../data/adaptation/careerHistory.json'
import { areAllMet } from './requirements.js'
import { isBookFocus } from './focuses.js'

const EVENT_COUNT = eventSource.eventCount
const BONUS_AMOUNT = 1
const eventsById = new Map(eventSource.events.map((event) => [event.id, event]))
const attributesById = new Map(attributeSource.attributes.map((attribute) => [attribute.id, attribute]))
const disciplinesById = new Map(disciplineSource.disciplines.map((discipline) => [discipline.id, discipline]))

const toRef = (entry) => ({ id: entry.id, name: entry.name })
const toBonus = (entry) => (entry ? { ...toRef(entry), value: BONUS_AMOUNT } : null)

// events[i] is null until chosen, then
// { event, attributeBonus: { id, name, value }, disciplineBonus: { id, name, value }, focus: { name, custom } }.
export function createEmptyCareerHistory() {
  return { events: Array(EVENT_COUNT).fill(null) }
}

export const getEventCount = () => EVENT_COUNT
export const getNoviceNote = () => eventSource.noviceNote
export const isNoviceCareer = (character) => character.career.length?.id === 'novice'
export const getCareerEventById = (eventId) => eventsById.get(eventId) ?? null
export const getCareerEvents = () =>
  eventSource.events.map((event) => ({ ...event, image: historyAdaptation.eventArtPattern.replace('{id}', event.id) }))
export const getAttributes = () => attributeSource.attributes
export const getDisciplines = () => disciplineSource.disciplines

// null id in the book data means "any one".
export const isAttributeChoice = (event) => event.attribute.id === null
export const isDisciplineChoice = (event) => event.discipline.id === null

// ---------- Focus options ----------

export const isCustomFocusAllowed = () => historyAdaptation.allowCustomFocus

function isFocusAllowed(event, focus) {
  if (!focus?.name) return false
  return focus.custom ? isCustomFocusAllowed() : isBookFocus(focus.name, event.focus.examples)
}

// ---------- Slots ----------

// Rebuilds a slot from its event: fixed bonuses come from the book; player picks survive only if still valid.
function buildSlot(event, previous) {
  const keepPick = (bonus, byId) => (bonus && byId.has(bonus.id) ? toBonus(byId.get(bonus.id)) : null)
  return {
    event: toRef(event),
    attributeBonus: isAttributeChoice(event) ? keepPick(previous?.attributeBonus, attributesById) : toBonus(attributesById.get(event.attribute.id)),
    disciplineBonus: isDisciplineChoice(event) ? keepPick(previous?.disciplineBonus, disciplinesById) : toBonus(disciplinesById.get(event.discipline.id)),
    focus: isFocusAllowed(event, previous?.focus) ? previous.focus : null,
  }
}

const withSlot = (history, index, slot) => ({ ...history, events: history.events.map((entry, i) => (i === index ? slot : entry)) })

export function isEventTakenElsewhere(history, index, eventId) {
  if (historyAdaptation.allowDuplicateEvents) return false
  return history.events.some((slot, i) => i !== index && slot?.event.id === eventId)
}

// `remembered` is the picks last made for this event (choiceMemory.js), if any.
export function selectEvent(history, index, eventId, remembered = null) {
  const event = getCareerEventById(eventId)
  if (!event || index < 0 || index >= EVENT_COUNT || isEventTakenElsewhere(history, index, eventId)) return history
  return withSlot(history, index, buildSlot(event, remembered))
}

function updateSlot(history, index, update) {
  const slot = history.events[index]
  const event = getCareerEventById(slot?.event.id)
  if (!event) return history
  const next = update(slot, event)
  return next === slot ? history : withSlot(history, index, next)
}

export const selectAttribute = (history, index, attributeId) =>
  updateSlot(history, index, (slot, event) =>
    isAttributeChoice(event) && attributesById.has(attributeId) ? { ...slot, attributeBonus: toBonus(attributesById.get(attributeId)) } : slot,
  )

export const selectDiscipline = (history, index, disciplineId) =>
  updateSlot(history, index, (slot, event) =>
    isDisciplineChoice(event) && disciplinesById.has(disciplineId) ? { ...slot, disciplineBonus: toBonus(disciplinesById.get(disciplineId)) } : slot,
  )

const setFocus = (history, index, focus) =>
  updateSlot(history, index, (slot, event) => (isFocusAllowed(event, focus) ? { ...slot, focus } : slot))

export const selectFocus = (history, index, name) => setFocus(history, index, { name, custom: false })
// Keeps the typed text as-is (like the other free-text fields); requirements and Review check it.
export const setCustomFocus = (history, index, name) => setFocus(history, index, { name, custom: true })

// Drops anything the rules no longer allow (unknown events, duplicates, invalid picks) so no stale bonus survives.
export function reconcileCareerHistory(character) {
  const history = character.careerHistory
  const events = history.events.map((slot, index) => {
    const event = getCareerEventById(slot?.event.id)
    if (!event || isEventTakenElsewhere({ events: history.events.slice(0, index) }, index, event.id)) return null
    return buildSlot(event, slot)
  })
  const unchanged = JSON.stringify(events) === JSON.stringify(history.events)
  return unchanged ? character : { ...character, careerHistory: { ...history, events } }
}

// ---------- Contributions ----------

export const getEventAttributeBonuses = (history) => history.events.map((slot) => slot?.attributeBonus).filter(Boolean)
export const getEventDisciplineBonuses = (history) => history.events.map((slot) => slot?.disciplineBonus).filter(Boolean)
export const getEventFocuses = (history) => history.events.map((slot) => slot?.focus).filter(Boolean)

// ---------- Requirements ----------

export const slotKeys = (index) => {
  const prefix = `event${index + 1}`
  return { event: prefix, attribute: `${prefix}Attribute`, discipline: `${prefix}Discipline`, focus: `${prefix}Focus` }
}

// In on-screen order: each event, then its attribute, discipline, and focus, before the next event.
export function getCareerHistoryRequirements(character) {
  const requirements = {}
  character.careerHistory.events.forEach((slot, index) => {
    const keys = slotKeys(index)
    requirements[keys.event] = Boolean(slot?.event)
    requirements[keys.attribute] = Boolean(slot?.attributeBonus)
    requirements[keys.discipline] = Boolean(slot?.disciplineBonus)
    requirements[keys.focus] = Boolean(slot?.focus?.name.trim())
  })
  return requirements
}

export function isSlotComplete(requirements, index) {
  const keys = slotKeys(index)
  return [keys.event, keys.attribute, keys.discipline, keys.focus].every((key) => requirements[key])
}

export const isCareerHistoryStepComplete = (character) => areAllMet(getCareerHistoryRequirements(character))
