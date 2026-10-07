// Data-driven weapons (data/adaptation/combat/weapons.json). Severity is the Injury's severity (rules/personalCondition.js).
import weaponData from '../data/adaptation/combat/weapons.json'
import { getBandIndex, RANGE_BANDS } from './rangeSystem.js'

export const getWeapon = (weaponId) => weaponData.weapons.find((weapon) => weapon.id === weaponId) ?? null
export const getInjuryMode = (modeId) => weaponData.injuryModes.find((mode) => mode.id === modeId) ?? null
export const getAttackTaskSpec = (weapon) => weaponData.attackTasks[weapon.type]

// Weapons the character carries (equipment linked by itemId), plus the always-available Unarmed Strike.
export function getCharacterWeapons(character) {
  const carried = character.equipment
    .map((item) => weaponData.weapons.find((weapon) => weapon.itemId && weapon.itemId === item.itemId))
    .filter(Boolean)
  const always = weaponData.weapons.filter((weapon) => weapon.alwaysAvailable)
  return [...new Set([...carried, ...always])]
}

// A character with no weapon of their own gets the encounter's standard-issue weapon (combat/encounters.js) for that
// fight only: the character's own record and export are never changed.
export function withStandardIssue(character, weaponId) {
  const weapon = weaponId && getWeapon(weaponId)
  if (!weapon || getCharacterWeapons(character).some((carried) => !carried.alwaysAvailable)) return character
  return { ...character, equipment: [...character.equipment, { itemId: weapon.itemId, name: weapon.name }] }
}

// Within optimal range: +0. Each band beyond optimal: +1 Difficulty. Beyond maximum range: unavailable.
export function getRangeModifier(weapon, band) {
  const index = getBandIndex(band.id)
  if (index > getBandIndex(weapon.maximumRange)) return { available: false, modifier: 0 }
  return { available: true, modifier: Math.max(0, index - getBandIndex(weapon.optimalRange)) }
}

export const getBandName = (bandId) => RANGE_BANDS.find((band) => band.id === bandId)?.name ?? bandId

export const describeRange = (weapon) =>
  weapon.optimalRange === weapon.maximumRange
    ? `Optimal ${getBandName(weapon.optimalRange)}`
    : `Optimal ${getBandName(weapon.optimalRange)}, max ${getBandName(weapon.maximumRange)}`
