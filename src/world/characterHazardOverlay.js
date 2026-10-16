// Which hazard flipbook to draw on a character (presentation hook for FigureView). Prefers an active affliction
// (still burning after leaving), else the damaging hazard on their tile. Immune suits hide matching overlays.
// Presentation (designer 2026-10-15): a figure with an overlay is drawn even when the party cannot otherwise see
// them (fire through walls / around corners), so burning enemies stay visible.
import { isImmuneToHazard } from '../rules/equipment.js'
import { normalizeCondition } from '../rules/personalCondition.js'
import { hazardAt } from './environment.js'

// Hazard type id to show on the figure, or null.
export function characterHazardOverlayType(environment, position, character, condition) {
  const afflictions = normalizeCondition(condition).afflictions ?? []
  let best = null
  for (const entry of afflictions) {
    if (character && isImmuneToHazard(character, entry.hazardType)) continue
    if (!best || entry.severity > best.severity) best = entry
  }
  if (best) return best.hazardType

  const hazard = environment && position ? hazardAt(environment, position) : null
  if (!hazard || hazard.severity <= 0) return null
  if (character && isImmuneToHazard(character, hazard.type)) return null
  return hazard.type
}

export const hasCharacterHazardOverlay = (environment, position, character, condition) =>
  Boolean(characterHazardOverlayType(environment, position, character, condition))

// Presentation: keep the last burn through fall → hold → getUp (and while Defeated), then follow the live type again.
// liveType: from characterHazardOverlayType. holding: blastReact / down / getUp / fall stagger. heldType: last shown.
export function resolveHazardOverlayDisplay(liveType, { holding = false, heldType = null } = {}) {
  if (liveType) return { type: liveType, held: liveType }
  if (holding && heldType) return { type: heldType, held: heldType }
  return { type: null, held: null }
}
