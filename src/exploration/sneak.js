// Sneaking in exploration: how fast a sneaking character moves and how hard they are to notice, from their sneak skill
// (Control + Security). Tuning and the design notes: src/data/adaptation/exploration/sneak.json.
import data from '../data/adaptation/exploration/sneak.json'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const sneakSkill = (character) => (character?.attributes?.control ?? 0) + (character?.disciplines?.security ?? 0)

export function sneakSpeed(character) {
  const { baseSpeed, perPoint, min, max } = data.speed
  return clamp(baseSpeed + perPoint * (sneakSkill(character) - data.referenceSkill), min, max)
}

export const sneakCatchUpSpeed = (character) => sneakSpeed(character) * data.speed.catchUpFactor

// The multiplier on an NPC's awareness build rate for a sneaking character (replaces the moving / running one).
export function sneakDetectionMultiplier(character, moving) {
  const { movingMultiplier, stillMultiplier, perPoint, minFactor, maxFactor } = data.detection
  const factor = clamp(1 - perPoint * (sneakSkill(character) - data.referenceSkill), minFactor, maxFactor)
  return (moving ? movingMultiplier : stillMultiplier) * factor
}
