// The running exploration: the away team (partyControl.js) and the NPCs' awareness of them (awareness.js), advanced
// together each frame. Party actions go to the party reducer unchanged; NPCs only read the party's positions.
// mode is the authority on what is running: EXPLORATION (real time) or COMBAT (Combat Type 1 on the same world, which
// stays frozen until the fight ends; see combatLink.js).
import { getAuthoredCharacter } from '../character/authoredCharacters.js'
import npcData from '../data/adaptation/exploration/npcs.json'
import { spawnFacing } from '../maps/facing.js'
import { createMissionResources } from '../rules/missionResources.js'
import { isDefeated } from '../rules/personalCondition.js'
import { chooseOption, continueConversation, leaveConversation, rollCheck, startConversation } from '../conversation/conversationRuntime.js'
import { createNpc, createWorld, emitNoise, getNpcs, isDown, tickWorld } from './awareness.js'
import { applyScenarioTiles, attemptChallenge, createScenario, INTERACT_RANGE, withMap } from './challengeObjects.js'
import { combatAction, endCombat, MODE, requestCombat, startCombat } from './combatLink.js'
import { createPartyState, getMembers, partyReducer } from './partyControl.js'
import { createPartyKnowledge, updatePartyKnowledge } from './partyKnowledge.js'
import { scanArea, scanNpc } from './partyScan.js'
import { addLogEntry, createMissionLog, logObjectiveChanges } from './missionLog.js'
import { updateObjectives } from './missionObjectives.js'

const isUp = (entity) => !isDefeated(entity.condition)

// The away team perceives from where each member stands now (see partyKnowledge.js).
function perceive(state) {
  const observers = getMembers(state.party)
    .filter(isUp)
    .map((member) => ({ id: member.id, position: member.position }))
  const entities = getNpcs(state.world).map((npc) => ({ id: npc.id, position: npc.position }))
  return { ...state, partyKnowledge: updatePartyKnowledge(state.partyKnowledge, state.party.map, observers, entities, state.world.time) }
}

// Each world actor uses an authored character (characterId) and keeps it as its own for the whole mission: the same
// character fights as the same combatant (the actor's id) in any fight. npcRules: an explicit authored choice of the
// book's streamlined NPC rules for this actor (rules/personalCondition.js npcCategoryOf); none by default.
const actorCharacter = (config) => (config.characterId ? getAuthoredCharacter(config.characterId, { npcRules: config.npcRules ?? null }) : null)

// A map's NPCs: those placed on it in the map editor; otherwise its own entry in npcs.json, or the fallback test NPCs
// on its enemy spawns.
export function npcConfigsFor(map) {
  if (map.npcs?.length) return map.npcs.map((npc) => ({ ...npc, name: npc.name || null, position: [npc.position.x, npc.position.y] }))
  const own = npcData.maps[map.id] ?? npcData.maps[map.name]
  if (own) return own
  return npcData.fallback.slice(0, map.markers.enemySpawns.length).map((config, index) => {
    const spawn = map.markers.enemySpawns[index]
    return { ...config, position: [spawn.x, spawn.y], facing: spawnFacing(map, spawn) }
  })
}

const createNpcWorld = (map) => createWorld(map, npcConfigsFor(map).map((config) => createNpc(config, actorCharacter(config))))

// NPCs with a conversation that any of the given members (able to act) stands close enough to talk to.
export function npcsInTalkRange(state, memberIds) {
  if (state.mode === MODE.COMBAT) return []
  const members = memberIds.map((id) => state.party.members[id]).filter((member) => member && !isDefeated(member.condition))
  return getNpcs(state.world).filter(
    (npc) => npc.conversationId && !isDown(npc) && members.some((member) => Math.hypot(member.position.x - npc.position.x, member.position.y - npc.position.y) <= INTERACT_RANGE),
  )
}

// What the conversation runtime needs from exploration (it can't import this layer).
const CONVERSATION_HOOKS = { refreshMap: withMap, startCombat }

// seed: a whole number; each fight's (and task roll's) seed is derived from it.
// enemiesActive false (the map editor's play-test checkbox): NPCs stand on their posts and never notice the away team or
// start a fight, so a map can be walked freely.
export function createExplorationState(map, characters, seed = 0, { enemiesActive = true } = {}) {
  // Challenge objects and scenario flags (challengeObjects.js); the world map shows each object's current tile.
  const scenario = createScenario(map)
  const worldMap = applyScenarioTiles(map, scenario)
  return {
    mode: MODE.EXPLORATION,
    party: createPartyState(worldMap, characters),
    world: createNpcWorld(worldMap),
    scenario,
    // The last challenge attempt, for the interaction panel (attemptChallenge).
    lastTask: null,
    // The conversation open now (conversation/conversationRuntime.js), or null.
    conversation: null,
    // The mission's group Momentum and Threat (rules/missionResources.js): challenge objects and Combat Type 1 use this
    // one pair; a fight holds it while it runs and hands it back (combatLink.js).
    resources: createMissionResources(),
    // What the away team knows of the NPCs (shared), and what each member perceives now (partyKnowledge.js).
    partyKnowledge: createPartyKnowledge(),
    // Scans (partyScan.js): world time each member may scan again, and the latest scan for the screen.
    scanReadyAt: {},
    lastScan: null,
    // Scans of single NPCs (partyScan.js scanNpc), by NPC id.
    npcScans: {},
    // The Captain's Log entries (missionLog.js).
    missionLog: createMissionLog(),
    // While mode is COMBAT: the Combat Type 1 state and what links it to the world (trigger, participants, snaps).
    combat: null,
    link: null,
    lastCombat: null,
    combatCount: 0,
    seed: seed >>> 0,
    enemiesActive,
  }
}

// A conversation Task Check just rolled goes in the Captain's Log.
function logCheck(previous, next) {
  const check = next.conversation?.lastCheck
  if (!check || check === previous.conversation?.lastCheck) return next
  const performer = next.party.members[check.performerId]?.character.name ?? 'The away team'
  const npc = next.world.npcs[next.conversation.npcId]?.name ?? 'them'
  return addLogEntry(next, { kind: 'check', text: `${performer}: ${check.label} (with ${npc}): ${check.result.success ? 'succeeded' : 'failed'}.` })
}

// Objectives with conditions move as the flags change; every change that makes an objective active or complete is
// written in the Captain's Log.
export function explorationReducer(state, action) {
  const next = reduceExploration(state, action)
  return next === state || !state ? next : logObjectiveChanges(state, updateObjectives(next))
}

function reduceExploration(state, action) {
  switch (action.type) {
    case 'reset':
      return createExplorationState(action.map, action.characters, action.seed, { enemiesActive: action.enemiesActive ?? true })
    case 'tick': {
      if (state.mode === MODE.COMBAT) return state
      const party = partyReducer(state.party, action)
      // The clock still runs (challenge-object locks expire on it); only the NPCs stand still.
      if (state.enemiesActive === false) return perceive({ ...state, party, world: { ...state.world, time: state.world.time + Math.max(0, action.seconds) } })
      const next = requestCombat(perceive({ ...state, party, world: tickWorld(state.world, party, action.seconds) }))
      // A fight breaking out ends any conversation.
      return next.mode === MODE.COMBAT && next.conversation ? { ...next, conversation: null } : next
    }
    // action: a Combat Type 1 action (or aiStep) from the combat screen.
    case 'combat':
      return combatAction(state, action.action)
    case 'endCombat':
      return endCombat(state)
    // A challenge-object action: { objectId, actionId, performerId, assistantId, assistIndex } (challengeObjects.js).
    case 'challenge':
      return state.mode === MODE.COMBAT ? state : attemptChallenge(state, action)
    // { memberId }: that character scans for life signs (partyScan.js).
    case 'scan':
      return state.mode === MODE.COMBAT ? state : scanArea(state, action.memberId)
    // { memberId, npcId }: that character scans one NPC (partyScan.js).
    case 'scanNpc':
      return state.mode === MODE.COMBAT ? state : scanNpc(state, action.memberId, action.npcId)
    // { npcId, targetId }: the away team attacks that NPC (Combat Type 1 on the same map, combatLink.js).
    case 'attackNpc':
      return state.mode === MODE.COMBAT ? state : startCombat(state, { triggerNpcId: action.npcId, triggerTargetId: action.targetId ?? state.party.leaderId, source: 'PLAYER_ATTACK' })
    // Conversations (conversation/conversationRuntime.js). talk: { npcId, definition (a parsed conversation file) }.
    case 'talk':
      return state.mode === MODE.COMBAT ? state : startConversation(state, action, CONVERSATION_HOOKS)
    case 'conversationChoose':
      return chooseOption(state, action.optionId, CONVERSATION_HOOKS)
    case 'conversationContinue':
      return continueConversation(state, CONVERSATION_HOOKS)
    // { performerId, purchase }: the chosen character attempts the conversation's Task Check.
    case 'conversationRoll':
      return logCheck(state, rollCheck(state, action, CONVERSATION_HOOKS))
    case 'conversationLeave':
      return leaveConversation(state)
    // noise: { position, radius, intensity, source } (see emitNoise).
    case 'emitNoise':
      return state.mode === MODE.COMBAT ? state : { ...state, world: emitNoise(state.world, action.noise) }
    // Puts every NPC back on its post, unaware (developer tool).
    case 'resetNpcs':
      return state.mode === MODE.COMBAT ? state : { ...state, world: createNpcWorld(state.party.map), partyKnowledge: createPartyKnowledge(), lastCombat: null }
    default: {
      // Party orders are frozen while combat runs: the Combat Type 1 screen gives the orders then.
      if (state.mode === MODE.COMBAT) return state
      const party = partyReducer(state.party, action)
      return party === state.party ? state : { ...state, party }
    }
  }
}
