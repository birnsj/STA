// The single task-resolution service for every Attribute + Department roll in the game: challenge objects, Combat
// Type 1 attacks, assists, opposed rolls and the Ambush. Pure; the caller rolls the dice (seeded) and decides what the
// result means (an object's outcomes, a Hit, who gains Momentum or Threat).
//
// STA 2E core task (Book: STA 2e Core Rulebook p.255-259):
// - target number = Attribute + Department (our character's six disciplines are the 2E departments, same ids);
// - 2d20; each die equal to or under the target number scores a success;
// - with an applicable focus, a die equal to or under the Department rating is a critical success (2 successes);
//   without one, a natural 1 is the critical success;
// - each die in the complication range (20 normally) causes a complication;
// - successes >= Difficulty passes; each success above the Difficulty becomes 1 Momentum;
// - one assistant rolls 1d20 against their own target number and focus; their successes count only if the leader
//   scored at least 1 success;
// - opposed task (p.256): the reactive side rolls first and its successes set the active side's Difficulty.
// - bonus d20s (bought with Momentum or Threat, rules/missionResources.js) are simply more leader dice, up to 5d20.
// - p.278: a Fatigued character automatically fails any task using their shut-down attribute (task.autoFail: every die
//   scores nothing; complications still count).
// Not in yet (hooks only): Determination, Value invocation.
import { getAttributeName, getDisciplineName } from '../character/runtimeCharacter.js'

export const TASK_DICE = 2
// Every die can be a critical success (a 1 always is), so the base pool can score up to twice its dice.
export const MAX_BASE_SUCCESSES = TASK_DICE * 2

export const rollD20 = (random) => Math.floor(random() * 20) + 1

export const rollDice = (random, count = TASK_DICE) => Array.from({ length: count }, () => rollD20(random))

export function rerollDie(dice, index, random) {
  return dice.map((value, i) => (i === index ? rollD20(random) : value))
}

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
  const success = !task.autoFail && value <= task.targetNumber
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
  const success = !leader.task.autoFail && successes >= difficulty
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

// ---------- odds (presentation and AI only; tasks always roll) ----------

const clamp20 = (value) => Math.min(20, Math.max(0, value))

// One die against a task: [chance of 0, 1, 2 successes].
export function staDieOdds(task) {
  if (task.autoFail) return [1, 0, 0]
  const success = clamp20(task.targetNumber)
  const critical = Math.min(success, clamp20(task.criticalRange))
  return [(20 - success) / 20, (success - critical) / 20, critical / 20]
}

// Chances of each success total on `dice` dice: index = successes.
export function staSuccessOdds(task, dice = TASK_DICE) {
  const die = staDieOdds(task)
  let totals = [1]
  for (let i = 0; i < dice; i++) {
    const next = new Array(totals.length + 2).fill(0)
    totals.forEach((chance, total) => die.forEach((dieChance, successes) => (next[total + successes] += chance * dieChance)))
    totals = next
  }
  return totals
}

// Chance a task passes. dice: the leader's pool (2 plus any bonus d20s). rerolls: how many dice scoring nothing may be
// rerolled once (Aim: 1, or 2 with an Accurate weapon). assistTask: an assistant's task (1d20, counted only when the
// leader scores at least 1).
export function staTaskChance({ task, difficulty, dice = TASK_DICE, rerolls = 0, assistTask = null }) {
  if (task.autoFail) return 0
  if (difficulty <= 0) return 1
  const die = staDieOdds(task)
  // Every combination of per-die results (at most 3^5), then up to `rerolls` blank dice rolled again.
  const leader = new Map()
  const add = (map, total, chance) => map.set(total, (map.get(total) ?? 0) + chance)
  const rollAgain = (count, total, chance) => {
    if (!count) return add(leader, total, chance)
    die.forEach((dieChance, successes) => rollAgain(count - 1, total + successes, chance * dieChance))
  }
  const walk = (index, total, blanks, chance) => {
    if (index === dice) return rollAgain(Math.min(blanks, rerolls), total, chance)
    die.forEach((dieChance, successes) => walk(index + 1, total + successes, blanks + (successes ? 0 : 1), chance * dieChance))
  }
  walk(0, 0, 0, 1)
  const assist = assistTask ? staDieOdds(assistTask) : [1, 0, 0]
  let chance = 0
  for (const [total, totalChance] of leader) {
    assist.forEach((assistChance, assistSuccesses) => {
      if (total + (total > 0 ? assistSuccesses : 0) >= difficulty) chance += totalChance * assistChance
    })
  }
  return chance
}
