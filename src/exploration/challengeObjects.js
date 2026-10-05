// Challenge objects in the world (videogame adaptation): each offers authored approaches; a roll goes through the one
// STA 2E task (taskPreparation.js + taskResolver.js), and the object's authored outcomes change the same world the rest
// of the game uses: the map (a sealed door's tile), NPC awareness (noise), Party Knowledge (scans) and scenario flags.
//
// Definitions (static, authored: challenges.json now, the map editor later) are kept apart from the scenario's runtime
// state: scenario = { definitions, objects: { [id]: { state, locks, difficultyMods, originalTile } }, flags, traits,
// log, taskCount }. The resolver decides success / failure / complications; the object decides what that means.
import data from '../data/adaptation/exploration/challenges.json'
import { deriveSeed, seededRandomInt } from '../rules/seededRandom.js'
import { prepareAssist, prepareTask } from '../rules/taskPreparation.js'
import { resolveStaTask, rollD20, rollDice } from '../rules/taskResolver.js'
import { emitNoise, getNpcs, isDown } from './awareness.js'
import { getMembers } from './partyControl.js'
import { addKnowledgeFact, revealEntity } from './partyKnowledge.js'

export const INTERACT_RANGE = data.interactRange
// Task rolls draw their own seeds, apart from the fights' (combat uses the seed's first indices).
const TASK_SEED_OFFSET = 100000

const pointOf = (definition) => ({ x: definition.position[0], y: definition.position[1] })
const isUp = (member) => !member.condition || member.condition.status === 'active'

export function createScenario(map) {
  const definitions = data.maps[map.id] ?? data.maps[map.name] ?? []
  const objects = Object.fromEntries(
    definitions.map((definition) => {
      const { x, y } = pointOf(definition)
      return [definition.id, { state: definition.state, locks: {}, difficultyMods: {}, originalTile: map.tiles[y][x] }]
    }),
  )
  return { definitions, objects, flags: {}, traits: [], log: [], taskCount: 0 }
}

// The map with every object's current tile (a sealed door blocks its doorway). Returns the same map when nothing changes,
// so movement caches keyed by the map stay valid.
export function applyScenarioTiles(map, scenario) {
  const changes = scenario.definitions
    .map((definition) => {
      const { x, y } = pointOf(definition)
      const object = scenario.objects[definition.id]
      return { x, y, tile: definition.states[object.state]?.tile ?? object.originalTile }
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

const meetsRequirements = (scenario, definition, requires = {}) =>
  (!requires.states || requires.states.includes(scenario.objects[definition.id].state)) &&
  Object.entries(requires.flags ?? {}).every(([flag, value]) => (scenario.flags[flag] ?? false) === value)

// The actions the object offers now: [{ action, available, reason }]. Actions whose requirements aren't met are not offered.
export function getAvailableActions(state, objectId) {
  const { scenario, world } = state
  const definition = getDefinition(scenario, objectId)
  const object = scenario.objects[objectId]
  return definition.actions
    .filter((action) => meetsRequirements(scenario, definition, action.requires))
    .map((action) => {
      const lockedUntil = object.locks[action.id]
      if (lockedUntil !== undefined && world.time < lockedUntil) return { action, available: false, reason: `Try again in ${Math.ceil(lockedUntil - world.time)}s` }
      return { action, available: true, reason: null }
    })
}

const taskContext = (scenario, objectId, actionId) => {
  const mod = scenario.objects[objectId].difficultyMods[actionId]
  return { traits: scenario.traits, difficultyMod: mod?.change ?? 0, difficultyModLabel: mod?.label }
}

// The character math before the roll: { prepared (leader), assist: { approach, task, focus } | null }.
export function previewChallenge(state, { objectId, actionId, performerId, assistantId = null, assistIndex = 0 }) {
  const definition = getDefinition(state.scenario, objectId)
  const action = definition.actions.find((candidate) => candidate.id === actionId)
  if (action.routine) return { prepared: null, assist: null }
  const prepared = prepareTask(state.party.members[performerId].character, action.task, taskContext(state.scenario, objectId, actionId))
  const approach = assistantId && action.assist?.[assistIndex]
  const assist = approach ? { approach, ...prepareAssist(state.party.members[assistantId].character, approach) } : null
  return { prepared, assist }
}

// ---------- outcome effects ----------

function applyEffect(state, definition, action, effect, ctx) {
  const object = state.scenario.objects[definition.id]
  const setObject = (changes) => ({ ...state, scenario: { ...state.scenario, objects: { ...state.scenario.objects, [definition.id]: { ...object, ...changes } } } })
  switch (effect.type) {
    case 'setState':
      return setObject({ state: effect.state })
    case 'setFlag':
      return { ...state, scenario: { ...state.scenario, flags: { ...state.scenario.flags, [effect.flag]: effect.value } } }
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
      return setObject({ locks: { ...object.locks, [action.id]: state.world.time + effect.seconds } })
    case 'message':
      ctx.messages.push(effect.text)
      return state
    default:
      return state
  }
}

const withMap = (state) => {
  const map = applyScenarioTiles(state.party.map, state.scenario)
  return map === state.party.map ? state : { ...state, party: { ...state.party, map }, world: { ...state.world, map } }
}

// A player's attempt: { objectId, actionId, performerId, assistantId, assistIndex }. Returns the new state with
// lastTask (what the panel shows) and a log entry; the state is unchanged when the attempt isn't allowed.
export function attemptChallenge(state, request) {
  const { objectId, actionId, performerId, assistantId = null, assistIndex = 0 } = request
  const definition = getDefinition(state.scenario, objectId)
  const offered = definition && getAvailableActions(state, objectId).find((entry) => entry.action.id === actionId)
  const inRange = definition ? membersInRange(state.party, definition).map((member) => member.id) : []
  if (!offered?.available || !inRange.includes(performerId)) return state
  if (assistantId && (assistantId === performerId || !inRange.includes(assistantId) || !offered.action.assist?.[assistIndex])) return state
  const { action } = offered

  const ctx = { performerId, messages: [] }
  let result = null
  let preview = { prepared: null, assist: null }
  let effects = action.onSuccess ?? []
  if (!action.routine) {
    preview = previewChallenge(state, request)
    if (!preview.prepared.possible) return state
    const random = seededRandomInt(deriveSeed(state.seed, TASK_SEED_OFFSET + state.scenario.taskCount))
    const dice = rollDice(random)
    const assistDie = preview.assist ? rollD20(random) : null
    result = resolveStaTask({
      leader: { task: preview.prepared.task, dice },
      assist: preview.assist && { task: preview.assist.task, die: assistDie },
      difficulty: preview.prepared.difficulty,
      ignoreComplications: preview.prepared.ignoreComplications,
      bonusMomentum: preview.prepared.bonusMomentum,
    })
    effects = [...(action.always ?? []), ...((result.success ? action.onSuccess : action.onFailure) ?? []), ...(result.complications ? (action.onComplication ?? []) : [])]
  }

  const key = state.scenario.taskCount
  let next = { ...state, scenario: { ...state.scenario, taskCount: key + 1 } }
  next = effects.reduce((current, effect) => applyEffect(current, definition, action, effect, ctx), next)
  const entry = {
    key,
    time: state.world.time,
    objectId,
    actionId,
    performerId,
    assistantId: preview.assist ? assistantId : null,
    routine: Boolean(action.routine),
    success: result ? result.success : true,
    successes: result?.successes ?? null,
    // Hook for the future group Momentum pool: generated here, not yet spent or banked anywhere else.
    momentumGenerated: result?.momentumGenerated ?? 0,
    complications: result?.complications ?? 0,
  }
  next = { ...next, scenario: { ...next.scenario, log: [...next.scenario.log, entry] } }
  next = { ...next, lastTask: { ...entry, prepared: preview.prepared, assist: preview.assist, result, messages: ctx.messages } }
  return withMap(next)
}
