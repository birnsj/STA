// The single task-resolution service for every Attribute + Discipline roll in the game.
//
// STA 2E core task (Book: STA 2e Core Rulebook p.255-259), used by challenge objects and meant for every task:
// - target number = Attribute + Department (our character's six disciplines are the 2E departments, same ids);
// - 2d20; each die equal to or under the target number scores a success;
// - with an applicable focus, a die equal to or under the Department rating is a critical success (2 successes);
//   without one, a natural 1 is the critical success;
// - each die in the complication range (20 normally) causes a complication;
// - successes >= Difficulty passes; each success above the Difficulty becomes 1 Momentum;
// - one assistant rolls 1d20 against their own target number and focus; their successes (and complications) count
//   only if the leader scored at least 1 success.
//
// Captain's Log evaluation (Book: Captain's Log p.80, p.187), still used by Combat Type 1: any 20 generates Threat; both
// dice succeeding generates Momentum (designer chose the p.187 wording over p.205's "two successes on a Difficulty 1 roll").
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

// ---------- STA 2E task ----------

export const MAX_COMPLICATION_RANGE = 5

// One participant's side of a task: the target number, the critical range and the complication range.
// focus: the applicable focus name (or null); criticalRange: dice at or under it are critical (the Department rating
// with a focus, 1 without; a talent may widen it). complicationRange 1 = only a 20.
export function buildStaTask(character, { attribute, department, focus = null, criticalRange = null, complicationRange = 1 }) {
  const attributeValue = character.attributes[attribute]
  const departmentValue = character.disciplines[department]
  return {
    attribute: { id: attribute, name: getAttributeName(attribute), value: attributeValue },
    department: { id: department, name: getDisciplineName(department), value: departmentValue },
    targetNumber: attributeValue + departmentValue,
    focus,
    criticalRange: criticalRange ?? (focus ? departmentValue : 1),
    complicationRange: Math.min(MAX_COMPLICATION_RANGE, Math.max(1, complicationRange)),
  }
}

// One d20 against a participant's task: { value, successes (0, 1 or 2), critical, complication }.
export function evaluateStaDie(task, value) {
  const success = value <= task.targetNumber
  const critical = success && value <= task.criticalRange
  return { value, successes: success ? (critical ? 2 : 1) : 0, critical, complication: value > 20 - task.complicationRange }
}

// Pure evaluation of a rolled STA 2E task.
// leader: { task, dice }; assist: { task, die } or null; difficulty: the final Difficulty.
// ignoreComplications: how many complications an effect (e.g. a talent) cancels; bonusMomentum: added on success.
// Who gains the Momentum and what each complication means are up to the caller.
export function resolveStaTask({ leader, assist = null, difficulty, ignoreComplications = 0, bonusMomentum = 0 }) {
  const dice = leader.dice.map((value) => evaluateStaDie(leader.task, value))
  const leaderSuccesses = dice.reduce((total, die) => total + die.successes, 0)
  const assistDie = assist ? evaluateStaDie(assist.task, assist.die) : null
  const assistCounted = Boolean(assistDie) && leaderSuccesses > 0
  const successes = leaderSuccesses + (assistCounted ? assistDie.successes : 0)
  const allDice = [...dice, ...(assistDie ? [assistDie] : [])]
  const complicationsRolled = allDice.filter((die) => die.complication).length
  const complicationsIgnored = Math.min(ignoreComplications, complicationsRolled)
  const success = successes >= difficulty
  return {
    targetNumber: leader.task.targetNumber,
    difficulty,
    dice,
    assist: assistDie && { ...assistDie, targetNumber: assist.task.targetNumber, counted: assistCounted },
    leaderSuccesses,
    successes,
    criticalSuccesses: allDice.filter((die) => die.critical && (die !== assistDie || assistCounted)).length,
    success,
    momentumGenerated: success ? successes - difficulty + bonusMomentum : 0,
    bonusMomentum: success ? bonusMomentum : 0,
    complicationsRolled,
    complicationsIgnored,
    complications: complicationsRolled - complicationsIgnored,
  }
}
