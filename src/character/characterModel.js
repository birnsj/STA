import { createEmptyEnvironment } from '../rules/environment.js'
import { createEmptyEarlyOutlook } from '../rules/earlyOutlook.js'
import { createEmptyEducation } from '../rules/education.js'
import { createEmptyCareer } from '../rules/career.js'
import { createEmptyCareerHistory } from '../rules/careerHistory.js'
import { createEmptyFinishingTouches, createEmptyIdentity } from '../rules/finishingTouches.js'
import { createEmptyTalents } from '../rules/talents.js'
import { getCreatorFaction } from '../rules/factions.js'

// Single source of truth for the character's shape. Fields are added here only
// as each creation screen is approved; the schema is intentionally not final.
export function createEmptyCharacter() {
  return {
    // { id, name } (factions.json). Videogame adaptation: fixed for creator characters (no choice screen); authored
    // characters (adaptation/characters.json) carry their own.
    faction: getCreatorFaction(),
    // { id, name, traits: [{ id, name }], attributeBonuses: [{ id, name, value }] }
    species: null,
    // { setting, otherSpecies, value: { text, matrixId }, attributeBonus, disciplineBonus } (Core Step Two: Environment)
    environment: createEmptyEnvironment(),
    // { outlook, path, attributeBonuses: [{ id, name, value }], disciplineBonus, focus: { name, custom } }
    //   (Core Step Three: Upbringing; outlook is the Upbringing, path is accepted / rebelled)
    earlyOutlook: createEmptyEarlyOutlook(),
    // { category, option, attributeBonuses, disciplinePicks: { major, minors, swapFrom, swapTo }, disciplineBonuses,
    //   focuses: [{ name, custom }], value: { text, matrixId }, trait: { id, name } } (Core Step Four: Career Path)
    education: createEmptyEducation(),
    // { length, value: { text, matrixId }, assignment, department (null for Communications Officer), rank }
    career: createEmptyCareer(),
    // { events: [{ event, attributeBonus, disciplineBonus, focus: { name, custom } } | null, ...] } (two events)
    careerHistory: createEmptyCareerHistory(),
    // { value: { text, matrixId }, attributes: { increases, keepAtMax, redistribution }, disciplines: { same } }
    finishingTouches: createEmptyFinishingTouches(),
    // Core p.132: four talents, one per granting step. Kept apart from the Species Ability (species.speciesAbility).
    // { earlyOutlook, education, career, finishingTouches }: each { id, name, choice: { id, name } | null } or null.
    talents: createEmptyTalents(),
    // Prototype presentation data, not book mechanics: { name, pronouns, portrait: { id, name } }
    identity: createEmptyIdentity(),
    // Prototype: optional player-written notes; never read by the rules.
    backgroundNotes: '',
    // Videogame adaptation: [{ itemId }] references into the item data, issued automatically from the career.
    equipment: [],
    // ISO timestamp set by Confirm Character on Review; any later edit clears it.
    confirmedAt: null,
  }
}
