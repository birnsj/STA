// The running exploration: the away team (partyControl.js) and the NPCs' awareness of them (awareness.js), advanced
// together each frame. Party actions go to the party reducer unchanged; NPCs only read the party's positions.
// mode is the authority on what is running: EXPLORATION (real time) or COMBAT (a fight on the same world, which
// stays frozen until the fight ends; see combatLink.js).
import { controllerFor, isUp } from '../actors/controllers.js'
import { getAuthoredCharacter } from '../character/authoredCharacters.js'
import { assignNpcAppearances } from '../character/npcAppearance.js'
import npcData from '../data/adaptation/exploration/npcs.json'
import { spawnFacing } from '../maps/facing.js'
import { createMissionResources } from '../rules/missionResources.js'
import { chooseOption, continueConversation, leaveConversation, rollCheck, startConversation } from '../conversation/conversationRuntime.js'
import { createNpc, createWorld, emitNoise, getNpcs, tickWorld } from './awareness.js'
import { applyScenarioTiles, attemptChallenge, challengeFor, createScenario, INTERACT_RANGE, withMap } from './challengeObjects.js'
import { combatAction, endCombat, MODE, requestCombat, startCombat } from './combatLink.js'
import { createPartyState, getMembers, partyReducer } from './partyControl.js'
import { createPartyKnowledge, updatePartyKnowledge } from './partyKnowledge.js'
import { scanArea, scanDestructible, scanNpc } from './partyScan.js'
import { askNpc } from './partySocial.js'
import { addLogEntry, createMissionLog, logObjectiveChanges } from './missionLog.js'
import { foughtNpcIds, isMissionFailed, mustSurviveIds, updateObjectives } from './missionObjectives.js'
import {
  dropItem,
  equipItem,
  pickupItem,
  seedMemberInventory,
  seedPartyInventory,
  transferItem,
  unequipItem,
} from '../rules/inventory.js'
import { applyEnvironmentTiles, createEnvironment } from '../world/environment.js'
import { answerInjuryPrompt, applyPendingObjectHit, clearBlastReact, fireOnObject, neutralizeHazardTask, tickHazards } from './explorationEnvironment.js'

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
// appearance: the gender and portrait it is shown with (character/npcAppearance.js), or null.
const actorCharacter = (config, appearance) =>
  config.characterId ? getAuthoredCharacter(config.characterId, { npcRules: config.npcRules ?? null, appearance }) : null

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

function createNpcWorld(map) {
  const configs = npcConfigsFor(map)
  const appearances = assignNpcAppearances(configs.map((config) => ({ key: config.id, characterId: config.characterId, gender: config.gender ?? null, portraitId: config.portraitId ?? null })))
  return createWorld(map, configs.map((config, index) => createNpc(config, actorCharacter(config, appearances[index]))))
}

// NPCs with a conversation that any of the given members (able to act) stands close enough to talk to.
export function npcsInTalkRange(state, memberIds) {
  if (state.mode === MODE.COMBAT) return []
  const members = memberIds.map((id) => state.party.members[id]).filter(isUp)
  return getNpcs(state.world).filter(
    (npc) => controllerFor(npc).canTalk(npc) && members.some((member) => Math.hypot(member.position.x - npc.position.x, member.position.y - npc.position.y) <= INTERACT_RANGE),
  )
}

// A conversation ends once no member able to act is in talk range of its NPC (designer decision, 2026-10-11: the party
// can move while talking, so walking away leaves).
function endConversationOutOfRange(state) {
  if (!state.conversation) return state
  const inRange = npcsInTalkRange(state, state.party.memberIds).some((npc) => npc.id === state.conversation.npcId)
  return inRange ? state : leaveConversation(state)
}

// What the conversation runtime needs from exploration (it can't import this layer).
const CONVERSATION_HOOKS = { refreshMap: withMap, startCombat }

// seed: a whole number; each fight's (and task roll's) seed is derived from it.
// enemiesActive false (the map editor's play-test checkbox): NPCs stand on their posts and never notice the away team or
// start a fight, so a map can be walked freely.
export function createExplorationState(map, characters, seed = 0, { enemiesActive = true } = {}) {
  // Challenge objects and scenario flags (challengeObjects.js); the world map shows each object's current tile.
  const scenario = createScenario(map)
  // Destructible objects and hazards (world/environment.js): each object's tile is on the world map too.
  const environment = createEnvironment(map, seed >>> 0)
  const worldMap = applyEnvironmentTiles(applyScenarioTiles(map, scenario), environment)
  // itemInstances / groundItems / per-member inventory: session-only play inventory (rules/inventory.js).
  const seeded = seedPartyInventory({
    mode: MODE.EXPLORATION,
    party: createPartyState(worldMap, characters),
    world: createNpcWorld(worldMap),
    scenario,
    environment,
    itemInstances: {},
    groundItems: {},
  })
  return {
    ...seeded,
    hazardClock: 0,
    // Avoid Injury prompts a blast or hazard round left for party members, answered one at a time.
    injuryPrompts: [],
    // The last challenge attempt, for the interaction panel (attemptChallenge).
    lastTask: null,
    // The conversation open now (conversation/conversationRuntime.js), or null.
    conversation: null,
    // The mission's group Momentum and Threat (rules/missionResources.js): challenge objects and combat use this
    // one pair; a fight holds it while it runs and hands it back (combatLink.js).
    resources: createMissionResources(),
    // What the away team knows of the NPCs (shared), and what each member perceives now (partyKnowledge.js).
    partyKnowledge: createPartyKnowledge(),
    // Scans (partyScan.js): world time each member may scan again, the latest area scan for the screen, and the latest
    // single-NPC scan (rings around the scanner and the NPC).
    scanReadyAt: {},
    lastScan: null,
    lastTargetScan: null,
    // Scans of single NPCs (partyScan.js scanNpc), by NPC id.
    npcScans: {},
    // Scans of destructibles (partyScan.js scanDestructible), by object id: hazards and countermeasures on success.
    objectScans: {},
    // Persuade / Intimidate on NPCs (partySocial.js): world time each member may ask again, per NPC
    // { intimidated, last }, and the latest request for the screen.
    socialReadyAt: {},
    npcSocial: {},
    lastSocial: null,
    // The Captain's Log entries (missionLog.js).
    missionLog: createMissionLog(),
    // While mode is COMBAT: the combat state and what links it to the world (trigger, participants, snaps).
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
  return addLogEntry(next, {
    kind: 'check',
    text: `${performer}: ${check.label} (with ${npc}): ${check.result.success ? 'succeeded' : 'failed'}.`,
    story: { event: check.result.success ? 'checkSuccess' : 'checkFailure', performer, label: check.label, npc },
  })
}

const memberName = (state, id) => state.party.members[id]?.character.name ?? 'The away team'
const npcName = (state, id) => state.world.npcs[id]?.name ?? id
const listText = (label, names) => (names.length ? ` ${label}: ${names.join(', ')}.` : '')

// A challenge-object task just rolled (in exploration or in a fight) goes in the Captain's Log, ahead of any entry its
// outcome wrote. Routine actions (no roll, e.g. opening a door) aren't logged.
function logObjectTask(previous, next) {
  const task = next.lastTask
  if (!task || task === previous.lastTask || task.routine) return next
  // A hazard's Neutralize task is looked up from before the roll: a success has put the hazard out.
  const object = challengeFor(previous, task.objectId) ?? challengeFor(next, task.objectId)
  const objectName = object?.definition.name ?? task.objectId
  const action = object?.action(task.actionId)?.label ?? task.actionId
  const performer = memberName(next, task.performerId)
  return addLogEntry(next, {
    kind: 'task',
    text: `${performer}: ${action} (${objectName}): ${task.success ? 'succeeded' : 'failed'}.`,
    story: { event: task.success ? 'taskSuccess' : 'taskFailure', performer, label: action, object: objectName },
    at: previous.missionLog?.entries.length ?? 0,
  })
}

// A fight breaking out, and how it ended (combatLink.js lastCombat), go in the Captain's Log.
function logFights(previous, next) {
  if (previous.mode !== MODE.COMBAT && next.mode === MODE.COMBAT && next.link) {
    const { trigger, npcIds } = next.link
    const byUs = trigger.source === 'PLAYER_ATTACK'
    const attacker = memberName(next, trigger.targetId)
    const enemies = npcIds.map((id) => npcName(next, id))
    return addLogEntry(next, {
      kind: 'fight',
      text: byUs ? `${attacker} attacked ${npcName(next, trigger.npcId)}. Fight: ${enemies.join(', ')}.` : `Attacked by ${enemies.join(', ')}.`,
      story: { event: byUs ? 'fightStartedByUs' : 'fightStartedByThem', attacker, target: npcName(next, trigger.npcId), enemies },
    })
  }
  if (previous.mode === MODE.COMBAT && next.mode !== MODE.COMBAT && next.lastCombat) {
    const { outcome, down, surrendered, fled } = next.lastCombat
    const isMember = (id) => previous.party.memberIds.includes(id)
    const names = (ids) => ids.filter((id) => !isMember(id)).map((id) => npcName(next, id))
    const story = { event: 'fightEnded', outcome, down: names(down), surrendered: names(surrendered), fled: names(fled), fallen: down.filter(isMember).map((id) => memberName(next, id)) }
    return addLogEntry(next, {
      kind: 'fight',
      text: `Fight over (${outcome}).${listText('Down', story.down)}${listText('Surrendered', story.surrendered)}${listText('Fled', story.fled)}${listText('Our wounded', story.fallen)}`,
      story,
    })
  }
  return next
}

// A fight with an NPC the map marks mustSurvive in it (missionObjectives.js) fails the mission as it ends, written in
// the Captain's Log once. previous.combat is the fight as it ended.
function checkMissionFailure(previous, next) {
  if (isMissionFailed(next) || previous.mode !== MODE.COMBAT || next.mode === MODE.COMBAT) return next
  const npcIds = foughtNpcIds(previous.combat, mustSurviveIds(next.party.map))
  if (!npcIds.length) return next
  const names = npcIds.map((id) => npcName(next, id))
  return addLogEntry({ ...next, missionFailed: { npcIds } }, { kind: 'fight', text: `We failed to protect ${names.join(', ')}. Mission failed.` })
}

// Objectives with conditions move as the flags change; every change that makes an objective active or complete is
// written in the Captain's Log, as are object tasks and fights.
export function explorationReducer(state, action) {
  const next = reduceExploration(state, action)
  return next === state || !state ? next : logObjectiveChanges(state, updateObjectives(checkMissionFailure(state, logFights(state, logObjectTask(state, next)))))
}

function reduceExploration(state, action) {
  switch (action.type) {
    case 'reset':
      return createExplorationState(action.map, action.characters, action.seed, { enemiesActive: action.enemiesActive ?? true })
    case 'tick': {
      if (state.mode === MODE.COMBAT) return state
      const party = partyReducer(state.party, action)
      // The clock still runs (challenge-object locks expire on it); only the NPCs stand still.
      if (state.enemiesActive === false) return endConversationOutOfRange(tickHazards(perceive({ ...state, party, world: { ...state.world, time: state.world.time + Math.max(0, action.seconds) } }), action.seconds))
      const next = requestCombat(tickHazards(perceive({ ...state, party, world: tickWorld(state.world, party, action.seconds) }), action.seconds))
      // A fight breaking out ends any conversation.
      return next.mode === MODE.COMBAT && next.conversation ? { ...next, conversation: null } : endConversationOutOfRange(next)
    }
    // action: a combat action (or aiStep) from the combat screen.
    case 'combat':
      return combatAction(state, action.action)
    case 'endCombat':
      return endCombat(state)
    // A challenge-object action: { objectId, actionId, performerId, assistantId, assistIndex } (challengeObjects.js).
    case 'challenge':
      return state.mode === MODE.COMBAT ? state : attemptChallenge(state, action)
    // { memberId, objectId, purchase }: that character fires on a destructible object (explorationEnvironment.js).
    case 'fireOnObject':
      return fireOnObject(state, action)
    // After the object-shot beam: Structure damage, explosion, blast stagger (and fight if needed).
    case 'applyPendingObjectHit':
      return applyPendingObjectHit(state)
    // { avoid }: the answer to the first queued Avoid Injury prompt from a blast or hazard.
    case 'answerInjuryPrompt':
      return answerInjuryPrompt(state, action.avoid)
    // { id }: blast fall / getUp finished — drop the presentation marker so walk and facing return to normal.
    case 'clearBlastReact':
      return clearBlastReact(state, action.id)
    // { hazardId, performerId, purchase, assistantId }: the hazard's Neutralize task (world/EnvironmentalHazard.js).
    case 'neutralizeHazard':
      return state.mode === MODE.COMBAT ? state : neutralizeHazardTask(state, action)
    // { memberId }: that character scans for life signs (partyScan.js).
    case 'scan':
      return state.mode === MODE.COMBAT ? state : scanArea(state, action.memberId)
    // { memberId, npcId }: that character scans one NPC (partyScan.js).
    case 'scanNpc':
      return state.mode === MODE.COMBAT ? state : scanNpc(state, action.memberId, action.npcId)
    // { memberId, objectId }: that character scans one destructible (partyScan.js).
    case 'scanDestructible':
      return state.mode === MODE.COMBAT ? state : scanDestructible(state, action.memberId, action.objectId)
    // { memberId, npcId, kind: 'persuade' | 'intimidate' }: that character asks one NPC (partySocial.js).
    // A lost Intimidate on an aggressive NPC provokes it: it attacks the one who threatened it.
    case 'askNpc': {
      if (state.mode === MODE.COMBAT) return state
      const next = askNpc(state, action.memberId, action.npcId, action.kind)
      return next !== state && next.lastSocial?.provoked ? startCombat(next, { triggerNpcId: action.npcId, triggerTargetId: action.memberId, source: 'PROVOKED' }) : next
    }
    // { npcId, targetId }: the away team attacks that NPC (combat on the same map, combatLink.js).
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
    // { ids }: those characters beam out of the mission (partyControl.js startBeamOut, then beamOut once the beam has
    // played); each is written in the Captain's Log. A fight breaking out meanwhile keeps them on the mission.
    case 'startBeamOut':
      return state.mode === MODE.COMBAT ? state : { ...state, party: partyReducer(state.party, action) }
    case 'beamOut': {
      if (state.mode === MODE.COMBAT) return { ...state, party: partyReducer(state.party, { type: 'cancelBeamOut', ids: action.ids }) }
      const ids = action.ids.filter((id) => state.party.memberIds.includes(id))
      if (!ids.length) return state
      const next = { ...state, party: partyReducer(state.party, { type: 'beamOut', ids }) }
      return ids.reduce((logged, id) => {
        const name = state.party.members[id].character.name
        return addLogEntry(logged, { kind: 'beam', text: `${name} beamed out.`, story: { event: 'beamOut', name } })
      }, next)
    }
    // { characters }: they beam in beside the lead (partyControl.js startBeamIn, then finishBeamIn once the beam has
    // played); each is written in the Captain's Log. Not during a fight.
    case 'startBeamIn': {
      if (state.mode === MODE.COMBAT) return state
      const avoid = getNpcs(state.world).map((npc) => npc.position)
      const party = partyReducer(state.party, { type: 'startBeamIn', characters: action.characters, avoid })
      if (party === state.party) return state
      const ids = party.memberIds.filter((id) => !state.party.memberIds.includes(id))
      // New arrivals expand their loadout into play inventory; returning members keep what they had.
      const withGear = ids.reduce((next, id) => seedMemberInventory(next, id), { ...state, party })
      return ids.reduce((logged, id) => addLogEntry(logged, { kind: 'beam', text: `${withGear.party.members[id].character.name} beamed in.` }), withGear)
    }
    // A fight may have started meanwhile: they are on the mission either way.
    case 'finishBeamIn':
      return { ...state, party: partyReducer(state.party, action) }
    // Puts every NPC back on its post, unaware (developer tool).
    case 'resetNpcs':
      return state.mode === MODE.COMBAT ? state : { ...state, world: createNpcWorld(state.party.map), partyKnowledge: createPartyKnowledge(), lastCombat: null }
    // Inventory (rules/inventory.js). Frozen during combat: gear changes wait until the fight ends.
    case 'equipItem':
      return state.mode === MODE.COMBAT ? state : equipItem(state, action)
    case 'unequipItem':
      return state.mode === MODE.COMBAT ? state : unequipItem(state, action)
    case 'transferItem':
      return state.mode === MODE.COMBAT ? state : transferItem(state, action)
    case 'dropItem':
      return state.mode === MODE.COMBAT ? state : dropItem(state, action)
    case 'pickupItem':
      return state.mode === MODE.COMBAT ? state : pickupItem(state, action)
    default: {
      // Party orders are frozen while combat runs: the combat screen gives the orders then.
      if (state.mode === MODE.COMBAT) return state
      const party = partyReducer(state.party, action)
      return party === state.party ? state : { ...state, party }
    }
  }
}
