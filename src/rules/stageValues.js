// Values written for each lifepath stage (data/adaptation/stageValues.json, original prototype text), used by Auto
// and the dev Autofill so a generated value reflects the stage that grants it. Players still pick from the
// book's Values Matrix or write their own on screen.
import stageValues from '../data/adaptation/stageValues.json'
import { getCharacterValues } from './finishingTouches.js'

// The value pool for one stage, from the choice that stage depends on.
function getPool(character, stage) {
  switch (stage) {
    case 'environment': {
      const entry = character.environment.setting ?? character.environment.condition
      return stageValues.environment[entry?.id] ?? []
    }
    case 'education':
      return stageValues.education[character.education.option?.id] ?? []
    case 'career':
      return stageValues.careerLength[character.career.length?.id] ?? []
    case 'finishingTouches':
      return character.careerHistory.events.flatMap((slot) => stageValues.careerEvent[slot?.event?.id] ?? [])
    default:
      return []
  }
}

// A random stage value the character doesn't already hold (Review rejects duplicates), or null if none is left.
export function pickStageValue(character, stage, order) {
  const held = getCharacterValues(character).map((value) => value.text.trim().toLowerCase())
  return order(getPool(character, stage)).find((text) => !held.includes(text.toLowerCase())) ?? null
}
