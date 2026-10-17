// Shapes combat state for the exploration Minimap (tiles, party, enemies) so combat can reuse the same readout.
import { KNOWLEDGE, createPartyKnowledge } from '../../exploration/partyKnowledge.js'

// A party record the minimap's getMembers / isSelected can read.
export function minimapPartyFromCombat(partyCombatants, { selectedId = null, leaderId = null } = {}) {
  const memberIds = partyCombatants.map((member) => member.id)
  return {
    memberIds,
    members: Object.fromEntries(
      partyCombatants.map((member) => [
        member.id,
        { id: member.id, character: member.character, position: member.position, condition: member.condition },
      ]),
    ),
    selectedIds: selectedId && memberIds.includes(selectedId) ? [selectedId] : leaderId && memberIds.includes(leaderId) ? [leaderId] : memberIds.slice(0, 1),
    leaderId: leaderId && memberIds.includes(leaderId) ? leaderId : memberIds[0] ?? null,
  }
}

// NPCs for the minimap: enemies in the fight, plus any exploration bystanders still on the board.
export function minimapWorldFromCombat(enemies, bystanders = []) {
  const npcs = {}
  for (const enemy of enemies) {
    if (enemy.fled) continue
    npcs[enemy.id] = {
      id: enemy.id,
      name: enemy.character.name,
      character: enemy.character,
      position: enemy.position,
      condition: enemy.condition,
      disposition: 'hostile',
      awareness: {},
    }
  }
  for (const bystander of bystanders) {
    npcs[bystander.id] = {
      id: bystander.id,
      name: bystander.character.name,
      character: bystander.character,
      position: bystander.position,
      condition: bystander.condition,
      disposition: bystander.hostile ? 'hostile' : 'neutral',
      awareness: {},
    }
  }
  return { npcs, npcIds: Object.keys(npcs) }
}

// When combat has no party-knowledge layer (standalone Load Episode fights), treat every listed NPC as visible.
export function minimapKnowledgeForCombat(knowledge, npcIds) {
  if (knowledge) return knowledge
  const entities = Object.fromEntries(
    npcIds.map((id) => [
      id,
      {
        state: KNOWLEDGE.VISIBLE,
        observerIds: [],
        source: 'visual',
        identified: true,
        lastKnownPosition: null,
        lastSeenTime: 0,
        lastObserverId: null,
      },
    ]),
  )
  return { ...createPartyKnowledge(), entities }
}
