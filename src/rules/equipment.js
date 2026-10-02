// Videogame adaptation, not book mechanics: Captain's Log does not use equipment (Book p.137). Item definitions,
// stats (prototype tuning), and the starting loadout all live in data; this file only reads them.
import itemData from '../data/adaptation/items.json'
import loadoutData from '../data/adaptation/startingEquipment.json'

const items = itemData.items.map((item) => ({ ...itemData.itemDefaults, ...item }))
const itemsById = new Map(items.map((item) => [item.id, item]))

export const getItems = () => items
export const getItemById = (itemId) => itemsById.get(itemId) ?? null
export const getCategoryName = (categoryId) => itemData.categories[categoryId] ?? categoryId

// Item IDs only, in issue order: base items, the tricorder, then department and assignment additions.
export function getStartingEquipment(character) {
  const department = loadoutData.departments[character.career.department?.id] ?? {}
  const assignment = loadoutData.assignments[character.career.assignment?.id] ?? {}
  const tricorder = assignment.tricorder ?? department.tricorder ?? loadoutData.defaultTricorder
  const itemIds = [...loadoutData.base, tricorder, ...(department.add ?? []), ...(assignment.add ?? [])]
  return [...new Set(itemIds)].filter((itemId) => itemsById.has(itemId))
}

// The character stores references ({ itemId }), never item data, so items can be rebalanced without touching saves.
// During creation the loadout is fully derived from the career; once play adds a real inventory, this should
// only run until the character is confirmed, or it would overwrite gear gained in play.
export function reconcileEquipment(character) {
  const itemIds = getStartingEquipment(character)
  const current = Array.isArray(character.equipment) ? character.equipment.map((entry) => entry?.itemId) : []
  if (current.length === itemIds.length && current.every((itemId, index) => itemId === itemIds[index])) return character
  return { ...character, equipment: itemIds.map((itemId) => ({ itemId })) }
}

// Resolves the character's references; unknown IDs (e.g. an item removed from the data) are skipped.
export const getEquippedItems = (character) => character.equipment.map((entry) => getItemById(entry.itemId)).filter(Boolean)

// [{ id, label, value }] for display, in the data's order; banded stats show their word (Range 2 -> Medium).
export function getItemStatLines(item) {
  const { order, labels, bands } = itemData.statDisplay
  return order
    .filter((statId) => item.stats[statId] !== undefined)
    .map((statId) => ({ id: statId, label: labels[statId], value: bands[statId]?.[item.stats[statId]] ?? String(item.stats[statId]) }))
}
