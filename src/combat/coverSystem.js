// Designer spec: binary cover. A defender in Cover rolls Control + Security (2d20) and the attack's Difficulty becomes
// the higher of the normal Difficulty and the defender's successes. Book (STA 2e Quickstart p. 22): cover is a terrain
// effect, granted to anyone within Reach of a cover feature, with no action. Prototype: being on any of the 8 tiles around a
// cover object puts a unit in cover automatically (on spawn and at the end of every move); moving elsewhere loses it.
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
