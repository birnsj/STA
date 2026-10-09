// Movement in combat (Book p.288: Move, a minor action; Sprint, a major action): whether a combatant may move now, how
// far, which tiles it can reach and the path to one. The grid rules themselves live in movementSystem.js.
import { tileKey } from './battleMap.js'
import { canAfford, getOpponents, getTurnOf, occupiesTile } from './combatSelectors.js'
import { findPath, getMovementTiles, getReachableTiles, getSprintTiles } from './movementSystem.js'
import { tileDistance } from './rangeSystem.js'
import { actionTypeOf } from './turnActions.js'

// Why a Move (kind 'move', a minor action) or Sprint (kind 'sprint', a major action) can't be taken now; null = it can.
// Book p.288: the Movement minor action can't be taken in the same turn as the Movement (Sprint) major action, nor while
// any enemy is within Reach. The book gives no disengage rule, so none is added: a character in Reach of an enemy can
// still Sprint.
export function getMovementBlock(state, combatant, kind = 'move') {
  const turn = getTurnOf(state, combatant.id)
  if (turn[actionTypeOf(kind)] <= 0) return `No ${actionTypeOf(kind)} action left.`
  if (kind === 'sprint') {
    if (turn.sprinted) return 'Already sprinted this turn.'
    if (turn.moved) return 'Moved this turn: Move and Sprint cannot both be taken in one turn.'
    return null
  }
  if (turn.moved) return 'Already moved this turn.'
  if (turn.sprinted) return 'Sprinted this turn: Move and Sprint cannot both be taken in one turn.'
  const adjacent = getOpponents(state, combatant).find((opponent) => tileDistance(combatant.position, opponent.position) <= 1)
  if (adjacent) return `${adjacent.character.name} is within Reach: no Move while an enemy is within Reach.`
  return null
}

// How far a Move or Sprint could go now: the full allowance if it can be taken (getMovementBlock), else nothing.
export function getMovementLeft(state, combatant, kind = 'move') {
  if (getMovementBlock(state, combatant, kind)) return 0
  return kind === 'sprint' ? getSprintTiles(combatant.character) : getMovementTiles(combatant.character)
}

// Enemies cannot be passed; allies can be passed but not stopped on. Defeated combatants do not block.
export function getBlockers(state, combatant) {
  const blockedKeys = new Set(state.blockedKeys ?? [])
  const occupiedKeys = new Set()
  for (const other of Object.values(state.combatants)) {
    if (other.id === combatant.id || !occupiesTile(other)) continue
    ;(other.side === combatant.side ? occupiedKeys : blockedKeys).add(tileKey(other.position))
  }
  return { blockedKeys, occupiedKeys }
}

export function getReachable(state, combatant, kind = 'move') {
  return getReachableTiles(state.map, combatant.position, getMovementLeft(state, combatant, kind), getBlockers(state, combatant))
}

export function getPathTo(state, combatant, destination, kind = 'move') {
  return findPath(state.map, combatant.position, destination, getMovementLeft(state, combatant, kind), getBlockers(state, combatant))
}

export const canMove = (state, combatant) => canAfford(state, combatant, 'move') && getMovementLeft(state, combatant) > 0
export const canSprint = (state, combatant) => canAfford(state, combatant, 'sprint') && getMovementLeft(state, combatant, 'sprint') > 0
