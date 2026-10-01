import { createEmptyEnvironment } from '../rules/environment.js'
import { createEmptyEarlyOutlook } from '../rules/earlyOutlook.js'
import { createEmptyEducation } from '../rules/education.js'
import { createEmptyCareer } from '../rules/career.js'
import { createEmptyCareerHistory } from '../rules/careerHistory.js'
import { createEmptyFinishingTouches, createEmptyIdentity } from '../rules/finishingTouches.js'

// Single source of truth for the character's shape. Fields are added here only
// as each creation screen is approved; the schema is intentionally not final.
export function createEmptyCharacter() {
  return {
    // { id, name, traits: [{ id, name }], attributeBonuses: [{ id, name, value }] }
    species: null,
    // { setting, condition, otherSpecies, value: { text, matrixId }, attributeBonus, disciplineBonus }
    environment: createEmptyEnvironment(),
    // { approach, outlook, path, attributeBonuses: [{ id, name, value }], disciplineBonus, focus: { name, custom } }
    earlyOutlook: createEmptyEarlyOutlook(),
    // { category, option, attributeBonuses, disciplinePicks: { major, minors, swapFrom, swapTo }, disciplineBonuses,
    //   focuses: [{ name, custom }], value: { text, matrixId } }
    education: createEmptyEducation(),
    // { length, value: { text, matrixId }, assignment, department (null for Communications Officer), rank }
    career: createEmptyCareer(),
    // { events: [{ event, attributeBonus, disciplineBonus, focus: { name, custom } } | null, ...] } (two events)
    careerHistory: createEmptyCareerHistory(),
    // { value: { text, matrixId }, attributes: { increases, keepAtMax, redistribution }, disciplines: { same } }
    finishingTouches: createEmptyFinishingTouches(),
    // Prototype presentation data, not book mechanics: { name, pronouns, portrait: { id, name } }
    identity: createEmptyIdentity(),
    // Prototype: optional player-written notes; never read by the rules.
    backgroundNotes: '',
    // ISO timestamp set by Confirm Character on Review; any later edit clears it.
    confirmedAt: null,
  }
}
