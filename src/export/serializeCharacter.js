import { getCharacterFocuses, getCharacterValues, getFinalScores } from '../rules/finishingTouches.js'
import { getTraitEntries } from '../rules/characterSheet.js'
import { validateCharacter } from '../rules/characterValidation.js'
import { getEquippedItems } from '../rules/equipment.js'
import { getSpeciesAbility } from '../rules/species.js'
import { getTalentEntries } from '../rules/talents.js'
import { getRoleRecord } from '../rules/roles.js'

// Bump when the exported structure changes so future loaders can detect old files.
// 0.8.0: final.rank / department / assignment / role (STA 2E role with its Role Benefit).
// 0.9.0: character.faction and final.faction (every authored person in the game shares this record shape).
// 0.10.0: Core Rulebook lifepath. education.trait (Career Path trait, also in final.traits), identity.age and
// identity.pastime, two species traits for mixed heritage, and a player-written species ability (id 'custom').
export const SCHEMA_VERSION = '0.10.0'

const ref = (value) => (value ? { id: value.id, name: value.name } : null)

// Derived from the choices at export time (null until Finishing Touches resolves them); loaders can recompute it.
function buildFinal(character) {
  return {
    faction: ref(character.faction),
    attributes: getFinalScores(character, 'attributes'),
    disciplines: getFinalScores(character, 'disciplines'),
    values: getCharacterValues(character).map((value) => value.text.trim()),
    focuses: getCharacterFocuses(character).map((focus) => focus.name.trim()),
    traits: getTraitEntries(character).map(({ id, name }) => ({ id, name })),
    speciesAbility: getSpeciesAbility(character.species),
    // Character Talents only; the Species Ability above is never one of them. source.step is the granting step.
    talents: getTalentEntries(character).map(({ stepId, stepTitle, slot, talent }) => ({
      id: talent.id,
      name: talent.name,
      category: talent.category,
      choice: slot.choice ? { kind: talent.choice.kind, id: slot.choice.id, name: slot.choice.name } : null,
      description: talent.description,
      requirements: talent.requirements,
      effects: talent.effects,
      ...(talent.limits ? { limits: talent.limits } : {}),
      era: talent.era,
      source: { step: stepId, stepTitle },
      reference: talent.source,
    })),
    // Service details. The assignment is the Captain's Log posting; the role is the STA 2E role whose Role Benefit
    // is neither a Character Talent nor the Species Ability.
    rank: ref(character.career.rank),
    department: ref(character.career.department),
    assignment: ref(character.career.assignment),
    role: getRoleRecord(character.career.role),
    // Names for readability only; character.equipment ({ itemId }) is the record a loader should use.
    equipment: getEquippedItems(character).map(({ id, name }) => ({ itemId: id, name })),
  }
}

// Lets a loader tell a confirmed, rules-valid character from a work in progress without re-running the rules.
function buildStatus(character) {
  const issues = validateCharacter(character)
  return {
    confirmed: Boolean(character.confirmedAt),
    valid: issues.length === 0,
    issues: issues.map(({ stepId, message }) => ({ stepId, message })),
  }
}

export function serializeCharacter(character) {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    status: buildStatus(character),
    // JSON round-trip guarantees only plain data leaves the app.
    character: JSON.parse(JSON.stringify(character)),
    final: buildFinal(character),
  }
}
