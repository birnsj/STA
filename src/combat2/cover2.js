// Combat Type 2 cover (videogame adaptation, designer spec): no Defense stat; a ranged attack against an exposed target is
// Difficulty 1, against a target in meaningful cover Difficulty 2 (both d20s must succeed).
// Implementer default awaiting review: "meaningful cover" = a cover object next to the target on the attacker's side
// (within 60 degrees of the line to the attacker), so flanking or pushing a target away from its cover removes it.
import { givesCover, neighbours } from './map2.js'

const COVER_ANGLE_COS = 0.5

export function findCover(map, target, attacker) {
  const toAttacker = { x: attacker.x - target.x, y: attacker.y - target.y }
  const length = Math.hypot(toAttacker.x, toAttacker.y)
  if (!length) return null
  return (
    neighbours(target).find((tile) => {
      if (!givesCover(map, tile)) return false
      const offset = { x: tile.x - target.x, y: tile.y - target.y }
      const cos = (offset.x * toAttacker.x + offset.y * toAttacker.y) / (Math.hypot(offset.x, offset.y) * length)
      return cos >= COVER_ANGLE_COS
    }) ?? null
  )
}

export const rangedDifficulty = (cover) => (cover ? 2 : 1)
