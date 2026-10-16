// AI / Auto Combat: leave damaging hazard tiles and never step onto them (designer 2026-10-15).
// Human Move clicks are unchanged. Suits with hazardImmunity treat matching tiles as safe.
import { isImmuneToHazard } from '../rules/equipment.js'
import { hazardAt } from '../world/environment.js'
import { canMove, canSprint, getReachable } from './combatMovement.js'

// Damaging lingering hazard on this tile for this character, or null (severity 0 / immune / none).
export function damagingHazardAt(environment, position, character) {
  if (!environment || !position) return null
  const hazard = hazardAt(environment, position)
  if (!hazard || hazard.severity <= 0) return null
  if (character && isImmuneToHazard(character, hazard.type)) return null
  return hazard
}

export const isSafeTile = (environment, position, character) => !damagingHazardAt(environment, position, character)

// Reachable entries (steps > 0) that are safe for this character.
export function safeReachable(state, combatant, kind = 'move') {
  return [...getReachable(state, combatant, kind).values()].filter(
    (entry) => entry.steps > 0 && isSafeTile(state.environment, entry.position, combatant.character),
  )
}

// Leave a damaging tile: nearest safe Move, else Sprint. Null if already safe, immune, or nowhere safe to go.
export function escapeHazardStep(state, self) {
  if (!damagingHazardAt(state.environment, self.position, self.character)) return null
  for (const kind of ['move', 'sprint']) {
    if (!(kind === 'sprint' ? canSprint(state, self) : canMove(state, self))) continue
    const safe = safeReachable(state, self, kind).sort((a, b) => a.steps - b.steps)
    if (!safe.length) continue
    const entry = safe[0]
    const verb = kind === 'sprint' ? 'Sprint' : 'Move'
    return {
      type: kind,
      destination: entry.position,
      decision: `${verb} out of hazard`,
      reason: `${self.character.name} is in a hazard; leaving for a safe tile (${entry.steps} step${entry.steps === 1 ? '' : 's'}).`,
    }
  }
  return null
}
