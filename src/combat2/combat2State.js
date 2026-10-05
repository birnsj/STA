// Combat Type 2 controller: a pure, seeded reducer over one combat state (nothing shared with Combat Type 1's state).
// Turn loop (designer spec): enemy intents shown -> player spends 2 AP (actions resolve immediately) -> End Turn ->
// enemies act one at a time on the current map -> new intents -> player gets 2 AP again, until win or loss.
// Kept independent of any arena so the same state could later be built from units standing on an episode map.
import encounterData from '../data/adaptation/combat2/encounter.json'
import enemyData from '../data/adaptation/combat2/enemies.json'
import { normalizeCharacterRecord } from '../character/runtimeCharacter.js'
import { deriveSeed, seededRandomInt } from '../rules/seededRandom.js'
import { evaluateTask, rollDice } from '../rules/taskResolver.js'
import {
  canPlayerAct,
  getEnemies,
  getMoveOptions,
  getPlayer,
  isActiveUnit,
  isHazardActive,
  isHazardTile,
  previewPlayerAction,
  TUNING,
} from './actions2.js'
import { planAllEnemies, planEnemy } from './intents2.js'
import { pathFrom, tileKey, tilesWithRole } from './map2.js'

const MAX_EVENTS = 40
const { encounter } = encounterData
export const DEFAULT_MAP_ID = encounter.defaultMapId
export const ENEMY_SPAWNS_NEEDED = encounter.roster.length

function makeUnit(id, side, character, position, extra = {}) {
  return { id, side, character, position, hits: 0, status: 'active', ...extra }
}

// map: a parsed map file (src/maps/mapFormat.js). The player stands on its first player start and the roster fills its
// enemy spawns in order.
export function createCombat2({ player, seed, map: mapFile }) {
  const map = { width: mapFile.width, height: mapFile.height, tiles: mapFile.tiles }
  const units = { player: makeUnit('player', 'player', player, mapFile.markers.playerStarts[0] ?? { x: 1, y: 1 }) }
  const order = ['player']
  encounter.roster.slice(0, mapFile.markers.enemySpawns.length).forEach((enemyId, index) => {
    const entry = enemyData.enemies.find((enemy) => enemy.id === enemyId)
    const { character } = normalizeCharacterRecord(entry.record, { id: `${enemyId}-${index}` })
    const id = `${enemyId}-${index}`
    units[id] = makeUnit(id, 'enemy', character, mapFile.markers.enemySpawns[index], { role: entry.role, weaponName: entry.weaponName ?? null, weaponRange: entry.weaponRange ?? 1 })
    order.push(id)
  })
  const state = {
    encounterName: mapFile.name,
    weather: mapFile.weather,
    objectives: encounter.objectives,
    areas: mapFile.areas,
    map,
    hazardControls: tilesWithRole(map, 'hazardControl'),
    hazard: { tiles: tilesWithRole(map, 'hazard'), active: false },
    units,
    order,
    playerId: 'player',
    round: 1,
    phase: 'player',
    ap: TUNING.actionPoints,
    momentum: 0,
    threat: 0,
    intents: {},
    enemyQueue: [],
    seed,
    rollIndex: 0,
    nextEventId: 1,
    events: [],
    outcome: null,
  }
  return { ...state, intents: planAllEnemies(state) }
}

function addEvent(state, event) {
  const events = [...state.events, { ...event, id: state.nextEventId, round: state.round }].slice(-MAX_EVENTS)
  return { ...state, events, nextEventId: state.nextEventId + 1 }
}

function updateUnit(state, id, changes) {
  return { ...state, units: { ...state.units, [id]: { ...state.units[id], ...changes } } }
}

function roll(state, task) {
  const random = seededRandomInt(deriveSeed(state.seed, state.rollIndex))
  const dice = rollDice(random)
  return { state: { ...state, rollIndex: state.rollIndex + 1 }, dice, result: evaluateTask(task, dice) }
}

function checkOutcome(state) {
  if (!isActiveUnit(getPlayer(state))) return { ...state, outcome: 'defeat', phase: 'over', enemyQueue: [] }
  if (getEnemies(state).every((enemy) => !isActiveUnit(enemy))) return { ...state, outcome: 'victory', phase: 'over', enemyQueue: [] }
  return state
}

// Captain's Log p.204: 3 hits = injured / defeated (MAX_HITS is the tunable default).
function applyHit(state, unitId) {
  const unit = state.units[unitId]
  const hits = Math.min(TUNING.maxHits, unit.hits + 1)
  return updateUnit(state, unitId, { hits, status: hits >= TUNING.maxHits ? 'down' : 'active' })
}

// Momentum and Threat are tracked for the player's rolls (display only in this prototype; no spends yet).
function recordPlayerRoll(state, result) {
  return { ...state, momentum: state.momentum + (result.momentum ? 1 : 0), threat: state.threat + (result.threat ? 1 : 0) }
}

function moveUnit(state, unitId, path) {
  const moved = updateUnit(state, unitId, { position: path[path.length - 1] })
  return addEvent(moved, { type: 'move', actorId: unitId, path })
}

function playerMove(state, destination) {
  const options = getMoveOptions(state, state.playerId)
  if (!options.has(tileKey(destination)) || options.get(tileKey(destination)).steps === 0) return state
  return { ...moveUnit(state, state.playerId, pathFrom(options, destination)), ap: state.ap - 1 }
}

function playerAction(state, actionId, targetId) {
  const preview = previewPlayerAction(state, actionId, targetId)
  if (!preview.available) return state
  let next = { ...state, ap: state.ap - 1 }
  const rolled = roll(next, preview.task)
  next = recordPlayerRoll(rolled.state, rolled.result)
  const passed = rolled.result.passed
  const effect = {}

  if (passed && (actionId === 'phaser' || actionId === 'melee')) {
    next = applyHit(next, targetId)
    effect.hit = true
    effect.defeated = !isActiveUnit(next.units[targetId])
  }
  if (passed && actionId === 'push') {
    next = updateUnit(next, targetId, { position: preview.destination })
    effect.pushedTo = preview.destination
    if (isHazardActive(next, preview.destination)) {
      next = applyHit(next, targetId)
      effect.hazardHit = true
      effect.defeated = !isActiveUnit(next.units[targetId])
    }
  }
  if (passed && actionId === 'interact') {
    next = { ...next, hazard: { ...next.hazard, active: true } }
    // Implementer default: the discharge also hits anyone already standing on the grating.
    const caught = Object.values(next.units).filter((unit) => isActiveUnit(unit) && isHazardTile(next, unit.position))
    caught.forEach((unit) => {
      next = applyHit(next, unit.id)
    })
    effect.hazardOn = true
    effect.caughtIds = caught.map((unit) => unit.id)
  }

  next = addEvent(next, {
    type: 'roll',
    actorId: state.playerId,
    actionId,
    targetId: targetId ?? null,
    task: preview.task,
    dice: rolled.result.dice,
    successes: rolled.result.successes,
    passed,
    momentum: rolled.result.momentum,
    threat: rolled.result.threat,
    cover: Boolean(preview.cover),
    effect,
  })
  return checkOutcome(next)
}

function startRound(state) {
  const next = { ...state, round: state.round + 1, phase: 'player', ap: TUNING.actionPoints, hazard: { ...state.hazard, active: false } }
  return { ...next, intents: planAllEnemies(next) }
}

// One enemy acts: re-plans against the current map, moves, then attacks if it still can.
function enemyStep(state) {
  const [enemyId, ...rest] = state.enemyQueue
  let next = { ...state, enemyQueue: rest }
  const enemy = next.units[enemyId]
  if (enemy && isActiveUnit(enemy)) {
    const plan = planEnemy(next, enemyId)
    const planned = state.intents[enemyId]
    if (plan.path.length > 1) next = moveUnit(next, enemyId, plan.path)
    if (plan.attackFrom && plan.preview) {
      const rolled = roll(next, plan.preview.task)
      next = rolled.state
      if (rolled.result.passed) next = applyHit(next, plan.targetId)
      next = addEvent(next, {
        type: 'roll',
        actorId: enemyId,
        actionId: plan.kind === 'shoot' ? 'disruptor' : 'melee',
        targetId: plan.targetId,
        task: plan.preview.task,
        dice: rolled.result.dice,
        successes: rolled.result.successes,
        passed: rolled.result.passed,
        cover: Boolean(plan.preview.cover),
        changedPlan: planned ? planned.kind !== plan.kind : false,
        effect: { hit: rolled.result.passed, defeated: !isActiveUnit(next.units[plan.targetId]) },
      })
    } else if (planned && planned.kind !== 'advance' && planned.kind !== plan.kind) {
      next = addEvent(next, { type: 'info', actorId: enemyId, text: 'Its planned attack is no longer possible.' })
    }
    next = checkOutcome(next)
  }
  if (next.outcome) return next
  return next.enemyQueue.length ? next : startRound(next)
}

export function combat2Reducer(state, action) {
  switch (action.type) {
    case 'move':
      return canPlayerAct(state) ? playerMove(state, action.destination) : state
    case 'act':
      return canPlayerAct(state) ? playerAction(state, action.actionId, action.targetId) : state
    case 'endTurn': {
      if (state.phase !== 'player' || state.outcome) return state
      const queue = getEnemies(state).filter(isActiveUnit).map((enemy) => enemy.id)
      return queue.length ? { ...state, phase: 'enemy', ap: 0, enemyQueue: queue } : startRound(state)
    }
    case 'enemyStep':
      return state.phase === 'enemy' && state.enemyQueue.length ? enemyStep(state) : state
    default:
      return state
  }
}
