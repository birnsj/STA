// The encounter definitions (data/adaptation/combat/encounters.json) on their own, so a setup screen or a party card can
// read one without pulling in the combat engine.
import encounterData from '../data/adaptation/combat/encounters.json'
import { withStandardIssue } from './weaponSystem.js'

export const getEncounter = (encounterId) => encounterData.encounters.find((encounter) => encounter.id === encounterId) ?? null
export const DEFAULT_ENCOUNTER_ID = encounterData.encounters[0].id
export const DEFAULT_MAP_ID = encounterData.encounters[0].defaultMapId
export const ENEMY_SPAWNS_NEEDED = encounterData.encounters[0].roster.length

// Combat started in the exploration world (src/exploration/combatLink.js).
export const WORLD_ENCOUNTER_ID = 'explorationContact'

// The character as they will fight if combat starts in the world: their own weapons, or the world encounter's standard
// issue if they bring none. Used by the exploration UI to show the weapon before any fight begins.
export const armedForWorldCombat = (character) => withStandardIssue(character, getEncounter(WORLD_ENCOUNTER_ID).standardIssueWeapon)
