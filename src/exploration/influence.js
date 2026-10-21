// A conversation reaching the NPCs around the one being talked to (videogame adaptation, designer approved Oct 2026; no
// book rule). Pure rules over the exploration state: who is affected, then what happens to them, all through state the
// game already has (disposition, responseType, awareness records, the alert groups).
//
// Who is affected is always narrowed by a filter, never "everyone nearby": the speaker's own alert group, or an
// explicit group or faction. A speaker with no group, and a filter naming nothing, affect nobody.
import { isDown } from '../actors/controllers.js'
import socialData from '../data/adaptation/exploration/social.json'
import { alertGroup, EMPTY_RECORD, getNpcs, hasLineOfSight, STATE } from './awareness.js'
import { distance } from './navigation.js'
import { standNpcDown } from './partySocial.js'

export const INFLUENCE_EFFECTS = [
  { id: 'standDown', label: 'Stand down', description: 'become neutral and calm, with no fight pending or search under way' },
  { id: 'hesitate', label: 'Hesitate', description: 'watch and wait instead of acting on what they see' },
  { id: 'hostile', label: 'Become hostile', description: 'turn hostile (they would fight if it came to it)' },
  { id: 'escalate', label: 'Escalate', description: 'turn aggressive and alerted to the party: a fight started now pulls them in' },
  { id: 'share', label: 'Share what they know', description: 'tell the group who the party is and where they stand (scripted group alert)' },
]
export const INFLUENCE_ORIGINS = [
  { id: 'speaker', label: 'The NPC spoken to' },
  { id: 'leader', label: 'The party leader' },
  { id: 'tile', label: 'A tile (x, y)' },
]
export const INFLUENCE_FILTERS = [
  { id: 'sameGroup', label: "The speaker's alert group" },
  { id: 'group', label: 'A named alert group' },
  { id: 'faction', label: 'A faction' },
]
export const defaultInfluenceRadius = socialData.influenceRadiusTiles

// Where the effect is measured from: the speaker, the party leader or an authored tile. null when it can't be placed.
export function influenceOrigin(state, speaker, origin = 'speaker', tile = null) {
  if (origin === 'leader') return state.party.members[state.party.leaderId]?.position ?? null
  if (origin === 'tile') return Number.isFinite(tile?.x) && Number.isFinite(tile?.y) ? { x: tile.x, y: tile.y } : null
  return speaker?.position ?? null
}

// The NPCs an action reaches: up, matching the filter, within the radius of the origin (and, if needsSight, in sight of
// it). The speaker is left out unless includeSpeaker (its own outcomes are the other actions of the conversation).
// action: { radius (blank: the speaker's influenceRadius, else the default), origin, tile, filter, filterId, needsSight,
// includeSpeaker }.
export function influencedNpcs(state, speakerId, action) {
  const speaker = state.world.npcs[speakerId]
  const origin = influenceOrigin(state, speaker, action.origin, action.tile)
  if (!speaker || !origin) return []
  // The action's own radius, else the speaker's, else the global default.
  const radius = action.radius > 0 ? action.radius : speaker.influenceRadius > 0 ? speaker.influenceRadius : defaultInfluenceRadius
  const matches = (npc) => {
    switch (action.filter) {
      case 'sameGroup':
        return Boolean(speaker.alertGroupId) && npc.alertGroupId === speaker.alertGroupId
      case 'group':
        return Boolean(action.filterId) && npc.alertGroupId === action.filterId
      case 'faction':
        return Boolean(action.filterId) && npc.faction === action.filterId
      default:
        return false
    }
  }
  return getNpcs(state.world).filter(
    (npc) =>
      (action.includeSpeaker || npc.id !== speakerId) &&
      !isDown(npc) &&
      matches(npc) &&
      distance(npc.position, origin) <= radius &&
      (!action.needsSight || hasLineOfSight(state.world.map, npc.position, origin)),
  )
}

const withNpcs = (state, changes) => ({ ...state, world: { ...state.world, npcs: { ...state.world.npcs, ...changes } } })

// Escalate and Share tell the NPC about the party the way the group alert does: Alerted, at the place and moment given,
// told rather than seen (reported), so a fight pulls it in without it knowing more than it was told.
function toldAboutParty(state, npc) {
  const awareness = { ...npc.awareness }
  state.party.memberIds.forEach((id) => {
    const member = state.party.members[id]
    awareness[id] = { ...(awareness[id] ?? EMPTY_RECORD), state: STATE.ALERTED, confidence: 1, lastKnownPosition: { ...member.position }, lastSeenTime: state.world.time, reported: true }
  })
  return awareness
}

// Applies one effect to the NPCs the action reaches. Returns the state unchanged when it reaches nobody.
export function influenceNearby(state, speakerId, action) {
  const affected = influencedNpcs(state, speakerId, action)
  if (!affected.length) return state
  switch (action.effect) {
    case 'standDown':
      return affected.reduce((next, npc) => standNpcDown(next, npc.id, { disposition: 'neutral', leaveGroup: false }), state)
    case 'hesitate':
      return withNpcs(state, Object.fromEntries(affected.map((npc) => [npc.id, { ...npc, responseType: 'observe' }])))
    case 'hostile':
      return withNpcs(state, Object.fromEntries(affected.map((npc) => [npc.id, { ...npc, disposition: 'hostile', responseType: null }])))
    case 'escalate':
      return withNpcs(state, Object.fromEntries(affected.map((npc) => [npc.id, { ...npc, disposition: 'aggressive', responseType: null, awareness: toldAboutParty(state, npc) }])))
    case 'share': {
      const leader = state.party.members[state.party.leaderId]
      if (!leader) return state
      // alertGroup tells a whole group; keep only the NPCs the action reaches.
      // alertGroup tells one whole group, so each group the NPCs belong to is told in turn; then only the NPCs the
      // action reaches keep what they heard.
      const groups = [...new Set(affected.map((npc) => npc.alertGroupId).filter(Boolean))]
      const told = groups.reduce((world, groupId) => alertGroup(world, groupId, { position: leader.position, sourceNpcId: speakerId, targetId: state.party.leaderId, method: 'scripted' }), state.world)
      const kept = new Set(affected.map((npc) => npc.id))
      const npcs = Object.fromEntries(Object.entries(told.npcs).map(([id, npc]) => [id, kept.has(id) ? npc : state.world.npcs[id]]))
      const events = told.events.filter((event) => event.type !== 'GROUP_ALERT_RECEIVED' || kept.has(event.npcId))
      return { ...state, world: { ...told, npcs, events } }
    }
    default:
      return state
  }
}
