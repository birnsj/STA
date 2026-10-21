// What a reusable conversation can say about the NPC it is with (videogame adaptation, no book rule). One conversation
// file can serve many NPCs, but mission flags are global, so two things make it work per NPC:
//   - a flag name may hold {npc} (the talking NPC's id) or {group} (its alert group, else its own id), e.g.
//     "{group}.identified": one flag per group, or "{npc}.questioned": one per NPC;
//   - a condition may read a property of the talking NPC instead of a flag: { npc: 'disposition', op, value }.
// Both are plain data; no code is read from content. Everything else about conditions is missionFlags.js.
import socialData from '../data/adaptation/exploration/social.json'
import { checkCondition } from '../exploration/missionFlags.js'
import { checkDifficultyChange, checksSkipped } from '../exploration/partySocial.js'

// Properties an NPC condition can read. kind: how the editor asks for the value.
export const NPC_PROPERTIES = [
  { id: 'disposition', label: 'NPC disposition', kind: 'disposition' },
  { id: 'hostility', label: 'NPC hostility (0 friendly ... 4 aggressive)', kind: 'number' },
  { id: 'intimidated', label: 'NPC is Intimidated', kind: 'boolean' },
  { id: 'checkDifficulty', label: 'NPC check Difficulty change', kind: 'number' },
]
export const getNpcProperty = (id) => NPC_PROPERTIES.find((property) => property.id === id) ?? null

// The flag name for this NPC: {npc} and {group} replaced. An NPC with no alert group stands alone, so {group} falls
// back to its own id rather than a name every ungrouped NPC would share.
export function scopedFlag(name, npcId, npc) {
  if (typeof name !== 'string' || !name.includes('{')) return name
  return name.replaceAll('{npc}', npcId ?? '').replaceAll('{group}', npc?.alertGroupId || npcId || '')
}

// The value of a property for this NPC (undefined for an unknown property or NPC).
export function npcPropertyValue(state, npcId, property) {
  const npc = state.world.npcs[npcId]
  if (!npc) return undefined
  switch (property) {
    case 'disposition':
      return npc.disposition
    case 'hostility':
      return Math.max(0, socialData.dispositionOrder.indexOf(npc.disposition))
    case 'intimidated':
      return checksSkipped(state, npcId)
    case 'checkDifficulty':
      return checkDifficultyChange(state, npcId)
    default:
      return undefined
  }
}

// One condition of a conversation, for the NPC it is with: a flag (with {npc} and {group} resolved) or an NPC property.
export function checkScopedCondition(state, npcId, condition) {
  if (condition?.npc) {
    const value = npcPropertyValue(state, npcId, condition.npc)
    if (value === undefined) return false
    // The property is read as if it were a flag, so every comparison means what it does everywhere else.
    return checkCondition({ [condition.npc]: value }, { ...condition, flag: condition.npc })
  }
  if (!condition?.flag) return true
  return checkCondition(state.scenario.flags, { ...condition, flag: scopedFlag(condition.flag, npcId, state.world.npcs[npcId]) })
}

export const checkScopedConditions = (state, npcId, conditions = []) => conditions.every((condition) => checkScopedCondition(state, npcId, condition))
