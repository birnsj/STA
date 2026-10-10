// Challenge objects in the world (videogame adaptation): each offers authored approaches; a roll goes through the one
// STA 2E task (taskPreparation.js + taskResolver.js), and the object's authored outcomes change the same world the rest
// of the game uses: the map (a sealed door's tile), NPC awareness (noise), Party Knowledge (scans) and scenario flags.
//
// Definitions (static, authored: challenges.json now, the map editor later) are kept apart from the scenario's runtime
// state: scenario = { definitions, objects: { [id]: { state, locks, combatLocks, difficultyMods, originalTiles } }, flags,
// traits: [{ name, potency, description, source }], log, taskCount }. The resolver decides success / failure /
// complications; the object decides what that means. The same objects stay usable in combat (exploration/combatLink.js):
// same definitions, same state, same rules; combat only decides who acts, what it costs and who assists.
import data from '../data/adaptation/exploration/challenges.json'
import { isDefeated } from '../rules/personalCondition.js'
import { prepareAssist, prepareTask } from '../rules/taskPreparation.js'
import { emitNoise, getNpcs, isDown } from './awareness.js'
import { applyFlagChange, checkCondition, checkConditions } from './missionFlags.js'
import { addLogEntry } from './missionLog.js'
import { getMembers } from './partyControl.js'
import { addKnowledgeFact, revealEntity } from './partyKnowledge.js'
import { rollPartyTask, TASK_SEED_OFFSET } from './partyTaskRoll.js'

export const INTERACT_RANGE = data.interactRange
// Scans (partyScan.js) and conversation checks share this seed sequence through scenario.taskCount.
export { TASK_SEED_OFFSET }

const pointOf = (definition) => ({ x: definition.position[0], y: definition.position[1] })
const isUp = (member) => !isDefeated(member.condition)
// The tiles a state's tile replaces: the object's own, plus covers [[x, y]] (the rest of a two-tile doorway).
const tilesOf = (definition) => [definition.position, ...(definition.covers ?? [])].map(([x, y]) => ({ x, y }))

// The challenge objects authored for a map (challenges.json, by map file name), each where the map's objectPlacements
// puts it (mapFormat.js); a doorway's other tiles (covers) move with it.
export function challengeDefinitionsFor(map) {
  const definitions = data.maps[map.id] ?? data.maps[map.name] ?? []
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

export function createScenario(map) {
  const definitions = challengeDefinitionsFor(map)
  const objects = Object.fromEntries(
    definitions.map((definition) => {
      const originalTiles = tilesOf(definition).map(({ x, y }) => map.tiles[y][x])
      return [definition.id, { state: definition.state, locks: {}, combatLocks: {}, difficultyMods: {}, originalTiles }]
    }),
  )
  return { definitions, objects, flags: {}, traits: [], log: [], taskCount: 0 }
}

// The map with every object's current tile (a sealed door blocks its doorway). Returns the same map when nothing changes,
// so movement caches keyed by the map stay valid.
export function applyScenarioTiles(map, scenario) {
  const changes = scenario.definitions
    .flatMap((definition) => {
      const object = scenario.objects[definition.id]
      const stateTile = definition.states[object.state]?.tile
      return tilesOf(definition).map(({ x, y }, index) => ({ x, y, tile: stateTile ?? object.originalTiles[index] }))
    })
    .filter(({ x, y, tile }) => map.tiles[y][x] !== tile)
  if (!changes.length) return map
  const tiles = map.tiles.map((row) => row.slice())
  changes.forEach(({ x, y, tile }) => {
    tiles[y][x] = tile
  })
  return { ...map, tiles }
}

export const getDefinition = (scenario, objectId) => scenario.definitions.find((definition) => definition.id === objectId) ?? null

// [{ id, name, type, position, state, stateLabel, description }] for drawing and listing.
export const getChallengeViews = (scenario) =>
  scenario.definitions.map((definition) => {
    const object = scenario.objects[definition.id]
    const info = definition.states[object.state] ?? {}
    return {
      id: definition.id,
      name: definition.name,
      type: definition.type,
      position: pointOf(definition),
      state: object.state,
      stateLabel: info.label ?? object.state,
      description: info.description ?? '',
      changed: object.state !== definition.state,
    }
  })

const distanceTo = (definition, position) => Math.hypot(position.x - definition.position[0], position.y - definition.position[1])

// Party members close enough (and able) to act on the object.
export const membersInRange = (party, definition) => getMembers(party).filter((member) => isUp(member) && distanceTo(definition, member.position) <= INTERACT_RANGE)

// Objects any of the given members can reach now.
export const objectsInReach = (state, memberIds) =>
  state.scenario.definitions.filter((definition) => memberIds.some((id) => isUp(state.party.members[id]) && distanceTo(definition, state.party.members[id].position) <= INTERACT_RANGE))

// requires.flags { flag: value } (each must equal its value; an unset flag reads as false, 0 or '') and
// requires.conditions [missionFlags.js conditions].
const meetsRequirements = (scenario, definition, requires = {}) =>
  (!requires.states || requires.states.includes(scenario.objects[definition.id].state)) &&
  Object.entries(requires.flags ?? {}).every(([flag, value]) => checkCondition(scenario.flags, { flag, op: 'equals', value })) &&
  checkConditions(scenario.flags, requires.conditions)

// The actions the object offers now: [{ action, available, reason }]. Actions whose requirements aren't met are not offered.
export function getAvailableActions(state, objectId) {
  const { scenario, world } = state
  const definition = getDefinition(scenario, objectId)
  const object = scenario.objects[objectId]
  return definition.actions
    .filter((action) => meetsRequirements(scenario, definition, action.requires))
    .map((action) => {
      const combatLock = object.combatLocks?.[action.id]
      if (state.combat && combatLock !== undefined && state.combat.round < combatLock) return { action, available: false, reason: 'Try again next round' }
      const lockedUntil = object.locks[action.id]
      if (lockedUntil !== undefined && world.time < lockedUntil) return { action, available: false, reason: `Try again in ${Math.ceil(lockedUntil - world.time)}s` }
      return { action, available: true, reason: null }
    })
}

// The action type an object's action takes in combat (Book p.288: a routine interaction is a minor action, an
// interaction needing a task is a major one), from its authored actionCost.combat.
export const combatCostOf = (action) => action.actionCost?.combat ?? (action.routine ? 'minor' : 'major')

// The party always performs object tasks ('player' side, for side-limited trait rules). condition: the performer's
// personal condition (Fatigue and Stress complications apply in exploration too).
// combatLines (combat only): Difficulty changes combat adds to the task ([{ label, change }], e.g. a bought second Major).
const taskContext = (scenario, objectId, actionId, condition, combatLines = []) => {
  const mod = scenario.objects[objectId].difficultyMods[actionId]
  return { traits: scenario.traits, side: 'player', condition, difficultyMod: mod?.change ?? 0, difficultyModLabel: mod?.label, extraLines: combatLines }
}

// The character math before the roll: { prepared (leader), assist: { approach, task, focus, ... } | null }.
// combatAssist (combat only): the assist combat has decided on (an Assist set up for the performer, or the commander's
// Control + Command on a Direct), already prepared; it replaces the exploration assistant. combatLines: see taskContext.
export function previewChallenge(state, { objectId, actionId, performerId, assistantId = null, assistIndex = 0, combatAssist = null, combatLines = [] }) {
  const definition = getDefinition(state.scenario, objectId)
  const action = definition.actions.find((candidate) => candidate.id === actionId)
  if (action.routine) return { prepared: null, assist: null }
  const performer = state.party.members[performerId]
  const prepared = prepareTask(performer.character, action.task, taskContext(state.scenario, objectId, actionId, performer.condition, combatLines))
  // A combat Assist may carry the helper's talents (combat/combatTalents.js: Pack Tactics' bonus Momentum).
  const talentBonus = combatAssist?.talents?.bonusMomentum ?? 0
  if (combatAssist) return { prepared: talentBonus ? { ...prepared, bonusMomentum: prepared.bonusMomentum + talentBonus } : prepared, assist: combatAssist }
  const approach = assistantId && action.assist?.[assistIndex]
  const assistant = assistantId && state.party.members[assistantId]
  const assist = approach ? { approach, ...prepareAssist(assistant.character, approach, assistant.condition) } : null
  return { prepared, assist }
}

const traitKey = (name) => name.toLowerCase()
const withTraits = (state, traits) => ({ ...state, scenario: { ...state.scenario, traits } })

// ---------- outcome effects ----------

function applyEffect(state, definition, action, effect, ctx) {
  const object = state.scenario.objects[definition.id]
  const setObject = (changes) => ({ ...state, scenario: { ...state.scenario, objects: { ...state.scenario.objects, [definition.id]: { ...object, ...changes } } } })
  switch (effect.type) {
    case 'setState':
      return setObject({ state: effect.state })
    case 'setFlag':
      return { ...state, scenario: { ...state.scenario, flags: applyFlagChange(state.scenario.flags, { flag: effect.flag, op: 'set', value: effect.value }) } }
    // { flag, op: 'set' | 'clear' | 'add', value } (missionFlags.js).
    case 'changeFlag':
      return { ...state, scenario: { ...state.scenario, flags: applyFlagChange(state.scenario.flags, effect) } }
    case 'noise':
      return { ...state, world: emitNoise(state.world, { position: pointOf(definition), radius: effect.radius, intensity: effect.intensity ?? 1, source: `challenge:${definition.id}` }) }
    case 'revealNpcs': {
      const near = getNpcs(state.world).filter((npc) => !isDown(npc) && distanceTo(definition, npc.position) <= effect.radius)
      const partyKnowledge = near.reduce(
        (knowledge, npc) => revealEntity(knowledge, npc, { source: effect.source ?? 'sensor', identified: Boolean(effect.identified), time: state.world.time, observerId: ctx.performerId }),
        state.partyKnowledge,
      )
      return { ...state, partyKnowledge }
    }
    case 'addFact':
      return { ...state, partyKnowledge: addKnowledgeFact(state.partyKnowledge, effect.id, { text: effect.text, source: definition.id, time: state.world.time }) }
    case 'adjustDifficulty': {
      const actionId = effect.actionId ?? action.id
      const previous = object.difficultyMods[actionId]?.change ?? 0
      return setObject({ difficultyMods: { ...object.difficultyMods, [actionId]: { change: previous + effect.change, label: effect.label ?? 'Situation' } } })
    }
    case 'setNpcResponse': {
      const npcs = Object.fromEntries(
        Object.entries(state.world.npcs).map(([id, npc]) => [id, npc.alertGroupId === effect.alertGroupId && (npc.responseType ?? null) === effect.from ? { ...npc, responseType: effect.to } : npc]),
      )
      return { ...state, world: { ...state.world, npcs } }
    }
    case 'lock':
      // The world clock stands still during combat, so there the lock lasts until the next combat round.
      if (state.combat) return setObject({ combatLocks: { ...object.combatLocks, [action.id]: state.combat.round + 1 } })
      return setObject({ locks: { ...object.locks, [action.id]: state.world.time + effect.seconds } })
    // Create Trait (Book p.289): create a trait, remove one, or change its Potency (Book p.252).
    case 'addTrait': {
      const others = state.scenario.traits.filter((trait) => traitKey(trait.name) !== traitKey(effect.name))
      return withTraits(state, [...others, { name: effect.name, potency: effect.potency ?? 1, description: effect.description ?? '', source: definition.id }])
    }
    case 'removeTrait':
      return withTraits(state, state.scenario.traits.filter((trait) => traitKey(trait.name) !== traitKey(effect.name)))
    case 'changePotency':
      return withTraits(
        state,
        state.scenario.traits
          .map((trait) => (traitKey(trait.name) === traitKey(effect.name) ? { ...trait, potency: trait.potency + effect.change } : trait))
          .filter((trait) => trait.potency > 0),
      )
    case 'message':
      ctx.messages.push(effect.text)
      return state
    // { text }: an entry in the Captain's Log (missionLog.js).
    case 'addLogEntry':
      return addLogEntry(state, { kind: 'authored', text: effect.text })
    default:
      return state
  }
}

// The exploration state with the world map showing every object's current tile (after an object's state changed).
export const withMap = (state) => {
  const map = applyScenarioTiles(state.party.map, state.scenario)
  return map === state.party.map ? state : { ...state, party: { ...state.party, map }, world: { ...state.world, map } }
}

// A player's attempt: { objectId, actionId, performerId, assistantId, assistIndex, purchase }. purchase (optional):
// bonus d20s bought before the roll, { bonusDice, momentum } (rules/missionResources.js), paid from the mission's
// group Momentum and/or by adding Threat. Afterwards the task's Momentum is saved to the group pool (bonus Momentum
// never is: Book p.260). Returns the new state with lastTask (what the panel shows) and a log entry; the state is
// unchanged when the attempt isn't allowed. In combat, request.combatAssist replaces assistantId (see previewChallenge)
// and the caller has already put the fighters' positions into party.members.
export function attemptChallenge(state, request) {
  const { objectId, actionId, performerId, assistantId = null, assistIndex = 0, combatAssist = null } = request
  const definition = getDefinition(state.scenario, objectId)
  const offered = definition && getAvailableActions(state, objectId).find((entry) => entry.action.id === actionId)
  const inRange = definition ? membersInRange(state.party, definition).map((member) => member.id) : []
  if (!offered?.available || !inRange.includes(performerId)) return state
  if (!combatAssist && assistantId && (assistantId === performerId || !inRange.includes(assistantId) || !offered.action.assist?.[assistIndex])) return state
  const { action } = offered

  const ctx = { performerId, messages: [] }
  const key = state.scenario.taskCount
  let result = null
  let preview = { prepared: null, assist: null }
  let effects = action.onSuccess ?? []
  let purchase = null
  let saving = null
  let next = { ...state, scenario: { ...state.scenario, taskCount: key + 1 } }
  if (!action.routine) {
    preview = previewChallenge(state, request)
    // No Momentum spends on challenge results yet, so it all goes to the group pool (partyTaskRoll.js).
    const roll = rollPartyTask(state, { prepared: preview.prepared, assist: preview.assist, purchase: request.purchase })
    if (!roll) return state
    ;({ result, purchase, saving } = roll)
    next = roll.state
    effects = [...(action.always ?? []), ...((result.success ? action.onSuccess : action.onFailure) ?? []), ...(result.complications ? (action.onComplication ?? []) : [])]
  }
  next = effects.reduce((current, effect) => applyEffect(current, definition, action, effect, ctx), next)
  const entry = {
    key,
    time: state.world.time,
    objectId,
    actionId,
    performerId,
    assistantId: preview.assist ? (combatAssist?.helperId ?? assistantId) : null,
    routine: Boolean(action.routine),
    success: result ? result.success : true,
    successes: result?.successes ?? null,
    momentumGenerated: result?.momentumGenerated ?? 0,
    momentumSaved: saving?.saved ?? 0,
    momentumLost: saving?.lost ?? 0,
    bonusDice: purchase?.bonusDice ?? 0,
    momentumSpentOnDice: purchase?.momentum ?? 0,
    threatAddedForDice: purchase?.threatAdded ?? 0,
    complications: result?.complications ?? 0,
  }
  next = { ...next, scenario: { ...next.scenario, log: [...next.scenario.log, entry] } }
  next = { ...next, lastTask: { ...entry, prepared: preview.prepared, assist: preview.assist, result, messages: ctx.messages } }
  return withMap(next)
}
