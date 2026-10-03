// Designer spec: binary cover. A defender in Cover rolls Control + Security (2d20) and the attack's Difficulty becomes
// the higher of the normal Difficulty and the defender's successes. Designer decision: Cover comes from the Take Cover
// action, only next to a cover object (any of the 8 surrounding tiles), and is lost when the unit moves.
import { buildTask, countSuccesses, rollDice } from '../rules/taskResolver.js'
import { neighbours, tileAt } from './battleMap.js'

export const COVER_TASK = { attribute: 'control', discipline: 'security' }

export const canTakeCover = (map, position) => neighbours(position).some((tile) => tileAt(map, tile) === 'cover')

export function rollCoverDefence(defender, random) {
  const task = buildTask(defender, { ...COVER_TASK, difficulty: 0 })
  const dice = rollDice(random)
  return { task, dice, successes: countSuccesses(task.targetNumber, dice) }
}

export const applyCoverToDifficulty = (difficulty, defenderSuccesses) => Math.max(difficulty, defenderSuccesses)
