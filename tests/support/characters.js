// Test characters built from explicit numbers, so a test says what rule it checks instead of depending on authored
// content. Talents and species abilities come from the real data files, so the structured effects the rules read
// (effects: [{ type: 'maxStress' | 'stress' | 'protection' }]) are the ones the game actually ships.
import abilityData from '../../src/data/source/speciesAbilities.json'
import talentData from '../../src/data/source/talents.json'

export const talent = (id) => {
  const found = talentData.talents.find((entry) => entry.id === id)
  if (!found) throw new Error(`talent '${id}' is not in talents.json`)
  return found
}

export const speciesAbility = (id) => {
  const found = abilityData.abilities.find((entry) => entry.id === id)
  if (!found) throw new Error(`species ability '${id}' is not in speciesAbilities.json`)
  return found
}

const ATTRIBUTES = { control: 9, daring: 9, fitness: 9, insight: 9, presence: 9, reason: 9 }
const DEPARTMENTS = { command: 2, conn: 2, engineering: 2, medicine: 2, science: 2, security: 2 }

export function makeCharacter({ attributes, disciplines, ...rest } = {}) {
  return {
    id: 'test-officer',
    name: 'Test Officer',
    focuses: [],
    values: [],
    traits: [],
    talents: [],
    speciesAbility: null,
    equipment: [],
    ...rest,
    attributes: { ...ATTRIBUTES, ...attributes },
    disciplines: { ...DEPARTMENTS, ...disciplines },
  }
}

// A weapon shaped like weapons.json, for severity arithmetic that shouldn't depend on a particular authored weapon.
export const makeWeapon = (overrides = {}) => ({ id: 'test-weapon', name: 'Test Weapon', severity: 4, qualities: [], ...overrides })

export const makeInjury = (overrides = {}) => ({ id: 'injury-1', type: 'stun', severity: 2, baseSeverity: 2, addedSeverity: 0, protection: 0, treated: false, recovering: false, source: {}, ...overrides })
