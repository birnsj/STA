import finishingSource from '../data/source/finishingTouches.json'
import { isPortraitAvailable } from './appearance.js'
import { getCharacterFocuses, getCharacterValues, getFinalScores, hasPronouns } from './finishingTouches.js'
import { areAllMet } from './requirements.js'
import { isTalentSlotMet } from './talents.js'

const complete = finishingSource.completeCharacter

// In category order. Background Notes is optional, so it has no requirement.
export function getFinishingRequirements(character) {
  return {
    finalValue: Boolean(character.finishingTouches.value?.text.trim()) && getCharacterValues(character).length === complete.valueCount,
    attributes: getFinalScores(character, 'attributes') !== null,
    disciplines: getFinalScores(character, 'disciplines') !== null,
    talent: isTalentSlotMet(character, 'finishingTouches'),
    portrait: isPortraitAvailable(character, character.identity.portrait?.id),
    // Last, so naming the character is the final choice on the screen (sections unlock in this order).
    identity: Boolean(character.identity.name.trim()) && hasPronouns(character.identity),
  }
}

export const isFinishingStepComplete = (character) =>
  areAllMet(getFinishingRequirements(character)) && getCharacterFocuses(character).length === complete.focusCount
