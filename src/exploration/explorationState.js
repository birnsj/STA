// The running exploration: the away team (partyControl.js) and the NPCs' awareness of them (awareness.js), advanced
// together each frame. Party actions go to the party reducer unchanged; NPCs only read the party's positions.
// mode is the authority on what is running: EXPLORATION (real time) or COMBAT (Combat Type 1 on the same world, which
// stays frozen until the fight ends; see combatLink.js).
import { normalizeCharacterRecord } from '../character/runtimeCharacter.js'
import enemyData from '../data/adaptation/combat/enemies.json'
import npcData from '../data/adaptation/exploration/npcs.json'
import { createNpc, createWorld, emitNoise, getNpcs, tickWorld } from './awareness.js'
import { applyScenarioTiles, attemptChallenge, createScenario } from './challengeObjects.js'
import { combatAction, endCombat, MODE, requestCombat } from './combatLink.js'
import { createPartyState, getMembers, partyReducer } from './partyControl.js'
import { createPartyKnowledge, updatePartyKnowledge } from './partyKnowledge.js'

const isUp = (entity) => !entity.condition || entity.condition.status === 'active'

// The away team perceives from where each member stands now (see partyKnowledge.js).
function perceive(state) {
  const observers = getMembers(state.party)
    .filter(isUp)
    .map((member) => ({ id: member.id, position: member.position }))
  const entities = getNpcs(state.world).map((npc) => ({ id: npc.id, position: npc.position }))
  return { ...state, partyKnowledge: updatePartyKnowledge(state.partyKnowledge, state.party.map, observers, entities, state.world.time) }
}

// The NPC's character takes the NPC's id, so the same character is the same combatant in any fight.
const enemyCharacter = (characterId, npcId) => {
  const template = enemyData.enemies.find((enemy) => enemy.id === characterId)
  return template ? normalizeCharacterRecord(template.record, { id: npcId }).character : null
}

// The test NPCs for a map: its own entry in npcs.json, or the fallback NPCs on its enemy spawns.
export function npcConfigsFor(map) {
  const own = npcData.maps[map.id] ?? npcData.maps[map.name]
  if (own) return own
  const centre = { x: (map.width - 1) / 2, y: (map.height - 1) / 2 }
  return npcData.fallback.slice(0, map.markers.enemySpawns.length).map((config, index) => {
    const spawn = map.markers.enemySpawns[index]
    return { ...config, position: [spawn.x, spawn.y], facing: (Math.atan2(centre.y - spawn.y, centre.x - spawn.x) * 180) / Math.PI }
  })
}

const createNpcWorld = (map) => createWorld(map, npcConfigsFor(map).map((config) => createNpc(config, enemyCharacter(config.characterId, config.id))))

// seed: a whole number; each fight's (and task roll's) seed is derived from it.
export function createExplorationState(map, characters, seed = 0) {
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
    // What the away team knows of the NPCs (shared), and what each member perceives now (partyKnowledge.js).
    partyKnowledge: createPartyKnowledge(),
    // While mode is COMBAT: the Combat Type 1 state and what links it to the world (trigger, participants, snaps).
    combat: null,
    link: null,
    lastCombat: null,
    combatCount: 0,
    seed: seed >>> 0,
  }
}

export function explorationReducer(state, action) {
  switch (action.type) {
    case 'reset':
      return createExplorationState(action.map, action.characters, action.seed)
    case 'tick': {
      if (state.mode === MODE.COMBAT) return state
      const party = partyReducer(state.party, action)
      return requestCombat(perceive({ ...state, party, world: tickWorld(state.world, party, action.seconds) }))
    }
    // action: a Combat Type 1 action (or aiStep) from the combat screen.
    case 'combat':
      return combatAction(state, action.action)
    case 'endCombat':
      return endCombat(state)
    // A challenge-object action: { objectId, actionId, performerId, assistantId, assistIndex } (challengeObjects.js).
    case 'challenge':
      return state.mode === MODE.COMBAT ? state : attemptChallenge(state, action)
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
