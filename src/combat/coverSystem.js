// Designer spec: binary cover. A defender in Cover rolls Control + Security (2d20) and the attack's Difficulty becomes
// the higher of the normal Difficulty and the defender's successes. Book (STA 2e Quickstart p. 22): cover is a terrain
// effect, granted to anyone within Reach of a cover feature, with no action. Prototype: being on one of the 4 tiles
// sharing a side with a cover object puts a unit in cover automatically (on spawn and at the end of every move); moving
// elsewhere loses it. Designer decision (Oct 2026): a diagonal (corner) tile gives no cover.
import { buildTask, countSuccesses, rollDice } from '../rules/taskResolver.js'
import { givesCover, isInside } from './battleMap.js'

export const COVER_TASK = { attribute: 'control', discipline: 'security' }

const SIDE_OFFSETS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]

export const canTakeCover = (map, position) =>
  SIDE_OFFSETS.some(([dx, dy]) => {
    const tile = { x: position.x + dx, y: position.y + dy }
    return isInside(map, tile) && givesCover(map, tile)
  })

export function rollCoverDefence(defender, random) {
  const task = buildTask(defender, { ...COVER_TASK, difficulty: 0 })
  const dice = rollDice(random)
  return { task, dice, successes: countSuccesses(task.targetNumber, dice) }
}

export const applyCoverToDifficulty = (difficulty, defenderSuccesses) => Math.max(difficulty, defenderSuccesses)
