// Which enemy figures the Pixi boards keep drawing when party sight is incomplete. Presentation rule shared by
// WorldCombat (hiddenIds) and kept in sync with PixiExplorationBoard's NPC skip.
import { isDefeated } from '../rules/personalCondition.js'
import { isVisibleToParty } from './partyKnowledge.js'

// True when an enemy combatant should be left off the board (no figure). Fallen bodies and hazard-revealed figures stay.
export function hideEnemyFromBoard(knowledge, unit, { revealed = false } = {}) {
  if (unit?.side !== 'enemy') return false
  if (isDefeated(unit.condition)) return false
  if (revealed) return false
  return !isVisibleToParty(knowledge, unit.id)
}
