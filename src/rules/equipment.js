// Videogame adaptation, not book mechanics: Captain's Log does not use equipment (CL p.137; Core p.141). Item definitions,
// stats (prototype tuning), and the starting loadout all live in data; this file only reads them.
import itemData from '../data/adaptation/items.json'
import loadoutData from '../data/adaptation/startingEquipment.json'
import rankSource from '../data/source/ranks.json'
import { describeRange, getWeaponForItem } from '../combat/weaponSystem.js'

const items = itemData.items.map((item) => ({ ...itemData.itemDefaults, ...item }))
const itemsById = new Map(items.map((item) => [item.id, item]))

export const getItems = () => items
export const getItemById = (itemId) => itemsById.get(itemId) ?? null
export const getCategoryName = (categoryId) => itemData.categories[categoryId] ?? categoryId

const officerRankIds = rankSource.ranks.map((rank) => rank.id)
const enlistedRankIds = rankSource.enlistedRanks.map((rank) => rank.id)

// Core p.141 sidearm (rule data in startingEquipment.json sidearm): Type-1 for Starfleet, Type-2 for security and
// senior officers, none for civilians. Null when the character gets none.
export function getSidearm(character) {
  const rules = loadoutData.sidearm
  const rankId = character.career.rank?.id
  const isOfficer = officerRankIds.includes(rankId)
  const isStarfleet = rules.starfleetCareerPaths.includes(character.education?.category?.id) || isOfficer || enlistedRankIds.includes(rankId)
  if (!isStarfleet) return null
  const isSecurity = rules.upgradedDepartments.includes(character.career.department?.id)
  const isSenior = isOfficer && officerRankIds.indexOf(rankId) >= officerRankIds.indexOf(rules.seniorOfficerMinRank)
  return isSecurity || isSenior ? rules.upgraded : rules.standard
}

// Item IDs only, in issue order: base items, the tricorder, the sidearm, then department and assignment additions.
export function getStartingEquipment(character) {
  const department = loadoutData.departments[character.career.department?.id] ?? {}
  const assignment = loadoutData.assignments[character.career.assignment?.id] ?? {}
  const tricorder = assignment.tricorder ?? department.tricorder ?? loadoutData.defaultTricorder
  const sidearm = getSidearm(character)
  const itemIds = [...loadoutData.base, tricorder, ...(sidearm ? [sidearm] : []), ...(department.add ?? []), ...(assignment.add ?? [])]
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

// [{ id, label, value }] for display, in the data's order; banded stats show their word. A weapon's severity and range
// come from the combat weapon it is (weapons.json), so what the player reads is what combat uses.
export function getItemStatLines(item) {
  const { order, labels, bands } = itemData.statDisplay
  const weapon = getWeaponForItem(item.id)
  const weaponLines = weapon
    ? [
        { id: 'severity', label: 'Severity', value: String(weapon.severity) },
        { id: 'range', label: 'Range', value: describeRange(weapon) },
      ]
    : []
  return [
    ...weaponLines,
    ...order
      .filter((statId) => item.stats[statId] !== undefined)
      .map((statId) => ({ id: statId, label: labels[statId], value: bands[statId]?.[item.stats[statId]] ?? String(item.stats[statId]) })),
  ]
}
