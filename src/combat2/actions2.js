// Combat Type 2 action previews: what each action would need, which task it rolls, and why it can or cannot be used.
// Pure functions of the combat state, used both by the UI (to explain the numbers) and by the reducer (to resolve).
import encounterData from '../data/adaptation/combat2/encounter.json'
import { buildTask } from './captainsLogTask.js'
import { findCover, rangedDifficulty } from './cover2.js'
import { distance, isAdjacent, isInside, isSolid, lineOfSight, reachableTiles, samePosition, tileKey } from './map2.js'

export const TUNING = encounterData.tuning
export const ACTION_SPECS = encounterData.actions
export const ACTION_IDS = ['move', 'phaser', 'melee', 'push', 'interact']

// Chance that 2d20 roll at least `difficulty` dice at or under the target number.
export function taskChance(targetNumber, difficulty) {
  const p = Math.min(Math.max(targetNumber, 0), 20) / 20
  if (difficulty <= 0) return 1
  if (difficulty === 1) return 1 - (1 - p) ** 2
  if (difficulty === 2) return p * p
  return 0
}

export const getPhaser = (character) => character.equipment.find((item) => encounterData.phaserItemIds.includes(item.itemId)) ?? null

export function buildActionTask(character, actionId, difficulty = 1) {
  const spec = ACTION_SPECS[actionId]
  return buildTask(character, { attribute: spec.attribute, discipline: spec.discipline, difficulty, focusCandidates: spec.focusCandidates })
}

export const isActiveUnit = (unit) => unit.status === 'active'
export const getPlayer = (state) => state.units[state.playerId]
export const getEnemies = (state) => state.order.filter((id) => state.units[id].side === 'enemy').map((id) => state.units[id])
export const unitAt = (state, position) =>
  Object.values(state.units).find((unit) => isActiveUnit(unit) && samePosition(unit.position, position)) ?? null

export const isHazardTile = (state, position) => state.hazard.tiles.some((tile) => samePosition(tile, position))
export const isHazardActive = (state, position) => state.hazard.active && isHazardTile(state, position)

// Tiles a unit cannot step into: every other active unit, plus the grating while it is discharging (nobody walks in on purpose).
export function getBlockedKeys(state, unitId) {
  const blocked = new Set(
    Object.values(state.units)
      .filter((unit) => unit.id !== unitId && isActiveUnit(unit))
      .map((unit) => tileKey(unit.position)),
  )
  if (state.hazard.active) state.hazard.tiles.forEach((tile) => blocked.add(tileKey(tile)))
  return blocked
}

export const canPlayerAct = (state) => state.phase === 'player' && !state.outcome && state.ap > 0

export function getMoveOptions(state, unitId, maxSteps = TUNING.moveTiles) {
  const unit = state.units[unitId]
  return reachableTiles(state.map, unit.position, maxSteps, getBlockedKeys(state, unitId))
}

// Why a tile within move distance cannot be a destination (for the Move overlay and detail panel).
export function describeBlockedTile(state, unitId, position, moveOptions) {
  if (!isInside(state.map, position)) return 'Outside the map'
  if (isSolid(state.map, position)) return 'Blocked: solid object'
  const occupant = unitAt(state, position)
  if (occupant && occupant.id !== unitId) return `Occupied: ${occupant.character.name}`
  if (isHazardActive(state, position)) return 'Blocked: EPS discharge'
  if (!moveOptions.has(tileKey(position))) return `Out of reach (Move is ${TUNING.moveTiles} tiles)`
  return null
}

function baseCheck(state, attacker, target) {
  if (!target || !isActiveUnit(target)) return 'No target'
  if (target.side === attacker.side) return 'Not an enemy'
  return null
}

// Ranged attack (player Phaser or enemy disruptor) from `from` (defaults to the attacker's tile).
export function previewRanged(state, attackerId, targetId, { from, maxRange, actionId = 'phaser' } = {}) {
  const attacker = state.units[attackerId]
  const target = state.units[targetId]
  const origin = from ?? attacker.position
  const range = maxRange ?? TUNING.phaserRange
  const problem = baseCheck(state, attacker, target)
  if (problem) return { available: false, reason: problem }
  const dist = distance(origin, target.position)
  const sight = lineOfSight(state.map, origin, target.position)
  const cover = findCover(state.map, target.position, origin)
  const difficulty = rangedDifficulty(cover)
  const task = buildActionTask(attacker.character, actionId, difficulty)
  let reason = null
  if (dist > range) reason = `Out of range (${dist} / ${range})`
  else if (!sight.clear) reason = 'No line of sight'
  return { available: !reason, reason, task, chance: taskChance(task.targetNumber, difficulty), distance: dist, range, sight, cover, difficulty }
}

export function previewMelee(state, attackerId, targetId, { from } = {}) {
  const attacker = state.units[attackerId]
  const target = state.units[targetId]
  const problem = baseCheck(state, attacker, target)
  if (problem) return { available: false, reason: problem }
  const origin = from ?? attacker.position
  const task = buildActionTask(attacker.character, 'melee', 1)
  const adjacent = isAdjacent(origin, target.position)
  return { available: adjacent, reason: adjacent ? null : 'Target must be adjacent', task, chance: taskChance(task.targetNumber, 1), distance: distance(origin, target.position) }
}

// Push: straight away from the pusher (diagonally if they stand diagonally). Walls, solid objects and characters stop it.
export function previewPush(state, attackerId, targetId) {
  const attacker = state.units[attackerId]
  const target = state.units[targetId]
  const problem = baseCheck(state, attacker, target)
  if (problem) return { available: false, reason: problem }
  const task = buildActionTask(attacker.character, 'push', 1)
  const chance = taskChance(task.targetNumber, 1)
  if (!isAdjacent(attacker.position, target.position)) return { available: false, reason: 'Target must be adjacent', task, chance }
  const step = { x: Math.sign(target.position.x - attacker.position.x), y: Math.sign(target.position.y - attacker.position.y) }
  const destination = { x: target.position.x + step.x, y: target.position.y + step.y }
  let reason = null
  if (isSolid(state.map, destination)) reason = 'Blocked: wall or solid object behind the target'
  else if (unitAt(state, destination)) reason = `Blocked: ${unitAt(state, destination).character.name} is behind the target`
  return { available: !reason, reason, task, chance, destination, intoHazard: isHazardActive(state, destination), ontoGrating: isHazardTile(state, destination) }
}

export function previewInteract(state, actorId) {
  const actor = state.units[actorId]
  const task = buildActionTask(actor.character, 'interact', 1)
  const adjacent = state.hazardControls.some((control) => isAdjacent(actor.position, control))
  let reason = null
  if (!state.hazardControls.length || !state.hazard.tiles.length) reason = 'This map has no EPS conduit to overload'
  else if (!adjacent) reason = 'Stand next to the EPS conduit control'
  else if (state.hazard.active) reason = 'The conduit is already discharging'
  return { available: !reason, reason, task, chance: taskChance(task.targetNumber, 1) }
}

export function previewPlayerAction(state, actionId, targetId) {
  const { playerId } = state
  if (actionId === 'phaser') {
    if (!getPhaser(getPlayer(state).character)) return { available: false, reason: 'No phaser carried' }
    return previewRanged(state, playerId, targetId)
  }
  if (actionId === 'melee') return previewMelee(state, playerId, targetId)
  if (actionId === 'push') return previewPush(state, playerId, targetId)
  if (actionId === 'interact') return previewInteract(state, playerId)
  return { available: false, reason: 'Unknown action' }
}

// Whether an action has any legal use right now (drives the action bar's enabled state and tooltip).
export function getActionAvailability(state, actionId) {
  if (!canPlayerAct(state)) return { available: false, reason: state.phase === 'player' ? 'No Action Points left' : 'Not your turn' }
  const player = getPlayer(state)
  if (actionId === 'move') {
    const options = getMoveOptions(state, player.id)
    return options.size > 1 ? { available: true } : { available: false, reason: 'Nowhere to move' }
  }
  if (actionId === 'interact') return previewInteract(state, player.id)
  if (actionId === 'phaser' && !getPhaser(player.character)) return { available: false, reason: 'No phaser carried' }
  const enemies = getEnemies(state).filter(isActiveUnit)
  const usable = enemies.some((enemy) => previewPlayerAction(state, actionId, enemy.id).available)
  if (usable) return { available: true }
  const reasons = { phaser: 'No Klingon in range and line of sight', melee: 'No adjacent Klingon', push: 'No adjacent Klingon that can be pushed' }
  return { available: false, reason: reasons[actionId] }
}
