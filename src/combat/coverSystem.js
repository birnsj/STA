// Designer spec: binary cover. Being in cover turns a ranged attack into an opposed task (the defender's roll and how it
// sets the Difficulty are in weapons.json attackTasks, resolved in combatState.js). Book (STA 2e Quickstart p. 22): cover
// is a terrain effect, granted to anyone within Reach of a cover feature, with no action. Prototype: being on one of the
// 4 tiles sharing a side with a cover object puts a unit in cover automatically (on spawn and at the end of every move);
// moving elsewhere loses it. Designer decision (Oct 2026): a diagonal (corner) tile gives no cover.
import { givesCover, isInside } from './battleMap.js'

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