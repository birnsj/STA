import { getCharacterFocuses, getCharacterValues, getFinalScores } from '../rules/finishingTouches.js'
import { getTraitEntries } from '../rules/characterSheet.js'
import { validateCharacter } from '../rules/characterValidation.js'

// Bump when the exported structure changes so future loaders can detect old files.
export const SCHEMA_VERSION = '0.4.0'

// Derived from the choices at export time (null until Finishing Touches resolves them); loaders can recompute it.
function buildFinal(character) {
  return {
    attributes: getFinalScores(character, 'attributes'),
    disciplines: getFinalScores(character, 'disciplines'),
    values: getCharacterValues(character).map((value) => value.text.trim()),
    focuses: getCharacterFocuses(character).map((focus) => focus.name.trim()),
    traits: getTraitEntries(character).map(({ id, name }) => ({ id, name })),
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
