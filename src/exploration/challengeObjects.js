// Challenge objects in the world (videogame adaptation): each offers authored approaches; a roll goes through the one
// STA 2E task (taskPreparation.js + taskResolver.js), and the object's authored outcomes change the same world the rest
// of the game uses: the map (a sealed door's tile), NPC awareness (noise), Party Knowledge (scans) and scenario flags.
//
// Definitions (static, authored: in the map file through the Object Editor, else challenges.json) are kept apart from the scenario's runtime
// state: scenario = { definitions, objects: { [id]: { state, locks, combatLocks, difficultyMods, originalTiles } }, flags,
// traits: [{ name, potency, description, source }], log, taskCount }. The behaviour lives in the object classes
// (src/world/, docs/world-objects.md); these functions are the scenario-level entry points the screens, the reducers
// and combat (exploration/combatLink.js) call.
import data from '../data/adaptation/exploration/challenges.json'
import { combatCostOf } from '../world/ChallengeObject.js'
import { hazardChallengeFor } from '../world/EnvironmentalHazard.js'
import { playableActions, repairDefinitions } from '../world/objectDefinitions.js'
import { applyScenarioTiles as retile, objectFor, objectForDefinition, objectsOf, withMap as withRetiledMap } from '../world/objects.js'
import { objectiveFlag } from './missionFlags.js'
import { canAct } from './partyControl.js'
import { TASK_SEED_OFFSET } from './partyTaskRoll.js'

export const INTERACT_RANGE = data.interactRange
// Scans (partyScan.js) and conversation checks share this seed sequence through scenario.taskCount.
export { TASK_SEED_OFFSET }

// The challenge objects authored for a map: its own (map.objects, the Object Editor) or else challenges.json's for its
// file name. Each stands where the map's objectPlacements puts it (mapFormat.js); a doorway's other tiles (covers) move
// with it.
// Malformed parts are repaired rather than crashing (world/objectDefinitions.js); definitionProblemsFor lists the repairs.
const authoredList = (map) => map.objects ?? data.maps[map.id] ?? data.maps[map.name] ?? []
export const authoredDefinitionsFor = (map) => repairDefinitions(authoredList(map)).definitions
export const definitionProblemsFor = (map) => repairDefinitions(authoredList(map)).problems
export function challengeDefinitionsFor(map) {
  const definitions = authoredDefinitionsFor(map)
  const placements = map.objectPlacements ?? {}
  return definitions.map((definition) => {
    const placed = placements[definition.id]
    if (!placed) return definition
    const [dx, dy] = [placed.x - definition.position[0], placed.y - definition.position[1]]
    if (!dx && !dy) return definition
    const inside = ([x, y]) => x >= 0 && y >= 0 && x < map.width && y < map.height
    return {
      ...definition,
      position: [placed.x, placed.y],
      ...(definition.covers ? { covers: definition.covers.map(([x, y]) => [x + dx, y + dy]).filter(inside) } : {}),
    }
  })
}

// Where an objective's marker goes: on its linked challenge object (objectId), else its own position (or null).
export function objectivePosition(map, objective) {
  if (!objective.objectId) return objective.position ?? null
  const definition = challengeDefinitionsFor(map).find((entry) => entry.id === objective.objectId)
  return definition ? { x: definition.position[0], y: definition.position[1] } : null
}

// The map's startsActive objectives are active from the first moment.
// Actions the game can't run (a task without an Attribute or Department) are left out of play.
export function createScenario(map) {
  const definitions = challengeDefinitionsFor(map).map(playableActions)
  const objects = Object.fromEntries(definitions.map((definition) => [definition.id, objectForDefinition(definition).createRuntime(map)]))
  const flags = Object.fromEntries((map.objectives ?? []).filter((objective) => objective.startsActive).map((objective) => [objectiveFlag(objective.id), 'active']))
  return { definitions, objects, flags, traits: [], log: [], taskCount: 0 }
}

// The map with every object's current tile; the same map when nothing changes (world/objects.js).
export function applyScenarioTiles(map, scenario) {
  return retile(map, scenario)
}

export function withMap(state) {
  return withRetiledMap(state)
}

// [{ id, name, type, position, state, stateLabel, description, changed }] for drawing and listing.
export const getChallengeViews = (scenario) => objectsOf(scenario).map((object) => object.view(scenario))

// Party members close enough (and able) to act on the object.
export const membersInRange = (party, definition) => objectForDefinition(definition).membersInRange(party)

// Objects any of the given members can reach now.
export const objectsInReach = (state, memberIds) =>
  objectsOf(state.scenario)
    .filter((object) => memberIds.some((id) => canAct(state.party.members[id]) && object.inReach(state.party.members[id].position)))
    .map((object) => object.definition)

// The challenge behind an id: an authored object in the scenario, or a hazard's Neutralize task ('hazard:{id}',
// world/EnvironmentalHazard.js), or null.
export const challengeFor = (state, objectId) => objectFor(state.scenario, objectId) ?? hazardChallengeFor(state.environment, objectId)

// The actions the object offers now: [{ action, available, reason }]. Actions whose requirements aren't met are not offered.
export const getAvailableActions = (state, objectId) => challengeFor(state, objectId)?.availableActions(state) ?? []

export { combatCostOf }

// The character math before the roll (ChallengeObject preview).
export const previewChallenge = (state, request) => challengeFor(state, request.objectId)?.preview(state, request) ?? null

// A player's attempt: { objectId, actionId, performerId, assistantId, assistIndex, purchase, combatAssist, combatLines }
// (ChallengeObject attempt). The state is unchanged (the same object) when the attempt isn't allowed.
export function attemptChallenge(state, request) {
  const object = challengeFor(state, request.objectId)
  return object ? object.attempt(state, request) : state
}
