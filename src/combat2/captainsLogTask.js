// Combat Type 2 only: the older Captain's Log task evaluation (Book: Captain's Log p.80, p.187). Any 20 generates
// Threat; both dice succeeding generates Momentum; a focus never adds successes. Combat Type 1 and challenge objects use
// the STA 2E resolver (src/rules/taskResolver.js); Combat Type 2 has not been migrated.
import { getAttributeName, getDisciplineName } from '../character/runtimeCharacter.js'
import { findTaskFocus } from '../rules/taskPreparation.js'

export function buildTask(character, { attribute, discipline, difficulty = 1, focusCandidates = [] }) {
  const attributeValue = character.attributes[attribute]
  const disciplineValue = character.disciplines[discipline]
  return {
    attribute: { id: attribute, name: getAttributeName(attribute), value: attributeValue },
    discipline: { id: discipline, name: getDisciplineName(discipline), value: disciplineValue },
    targetNumber: attributeValue + disciplineValue,
    difficulty,
    focus: findTaskFocus(character, focusCandidates),
  }
}

export function evaluateTask(task, dice) {
  const successes = dice.filter((value) => value <= task.targetNumber).length
  return {
    dice: dice.map((value) => ({ value, success: value <= task.targetNumber, twenty: value === 20 })),
    successes,
    passed: successes >= task.difficulty,
    momentum: successes === dice.length,
    threat: dice.some((value) => value === 20),
  }
}
