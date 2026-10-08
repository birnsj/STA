// Values for each lifepath stage, used by Auto and the dev Autofill so a generated value reflects the stage that
// grants it: the book's examples where it gives them (species sidebars, Experience), otherwise the prototype text in
// data/adaptation/stageValues.json. Players still pick from the book's values or write their own on screen.
import stageValues from '../data/adaptation/stageValues.json'
import careerLengths from '../data/source/careerLengths.json'
import { getEnvironmentValueExamples } from './environment.js'
import { getCharacterValues } from './finishingTouches.js'

const toTexts = (values) => values.map((value) => value.text)

// The value pool for one stage, from the choice that stage depends on.
function getPool(character, stage) {
  switch (stage) {
    case 'environment':
      return character.environment.setting ? toTexts(getEnvironmentValueExamples(character)) : []
    case 'education':
      return stageValues.education[character.education.option?.id] ?? []
    case 'career': {
      const length = careerLengths.lengths.find((entry) => entry.id === character.career.length?.id)
      return toTexts(length?.valueExamples ?? [])
    }
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
