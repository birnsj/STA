// The single task-resolution service for every Attribute + Discipline roll in the game (combat now, everything else later).
// Book (Captain's Log p.80, p.187): target number = Attribute + Discipline; each d20 equal to or under it is a success; any 20 generates Threat;
// both dice succeeding generates Momentum (designer chose the p.187 wording over p.205's "two successes on a Difficulty 1 roll").
// Prototype: the task passes when successes >= Difficulty. Book: an applicable focus grants an Advantage (p.79, p.268), not successes.
// Prototype (designer decision, Oct 2026): the focus never adds successes here; combat uses it only to let Aim reroll both attack dice,
// and Ambush uses it for one reroll of a failed die.
import { getAttributeName, getDisciplineName } from '../character/runtimeCharacter.js'

export const TASK_DICE = 2

export const rollD20 = (random) => Math.floor(random() * 20) + 1

// The first of the character's focuses that matches one of the task's candidate focus names.
export function findApplicableFocus(characterFocuses, candidates = []) {
  const wanted = candidates.map((name) => name.toLowerCase())
  return characterFocuses.find((focus) => wanted.includes(focus.toLowerCase())) ?? null
}

export function buildTask(character, { attribute, discipline, difficulty = 1, focusCandidates = [] }) {
  const attributeValue = character.attributes[attribute]
  const disciplineValue = character.disciplines[discipline]
  return {
    attribute: { id: attribute, name: getAttributeName(attribute), value: attributeValue },
    discipline: { id: discipline, name: getDisciplineName(discipline), value: disciplineValue },
    targetNumber: attributeValue + disciplineValue,
    difficulty,
    focus: findApplicableFocus(character.focuses, focusCandidates),
  }
}

export const rollDice = (random, count = TASK_DICE) => Array.from({ length: count }, () => rollD20(random))

export function rerollDie(dice, index, random) {
  return dice.map((value, i) => (i === index ? rollD20(random) : value))
}

export const countSuccesses = (targetNumber, dice) => dice.filter((value) => value <= targetNumber).length

// Pure evaluation of a rolled task; who gains the Momentum/Threat is up to the caller (e.g. combat gives it only to the player side).
export function evaluateTask(task, dice) {
  const successes = countSuccesses(task.targetNumber, dice)
  return {
    dice: dice.map((value) => ({ value, success: value <= task.targetNumber, twenty: value === 20 })),
    successes,
    passed: successes >= task.difficulty,
    momentum: successes === dice.length,
    threat: dice.some((value) => value === 20),
  }
}
