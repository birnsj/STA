// Read-only questions about a combat state: who is acting, who opposes whom, whose turn record applies, and whether a
// combatant can afford an action right now. Nothing here changes state.
import { conditionSummary } from '../rules/personalCondition.js'
import { RANGE_BANDS, tileDistance } from './rangeSystem.js'
import { actionTypeOf, actionsLeft, EXTRA_ACTIONS, freshTurn, majorsTaken, MAX_MAJORS_PER_ROUND, REACH_PENALTY } from './turnActions.js'

const REACH_TILES = RANGE_BANDS.find((band) => band.id === 'reach').maxTiles

// facing: presentation only (the book has no facing rules). One of the 8 grid directions, e.g. { x: 1, y: -1 }; it follows
// the last step of a move and turns toward the target of an attack.
export const facingToward = (from, to) => {
  const x = Math.sign(to.x - from.x)
  const y = Math.sign(to.y - from.y)
  return x || y ? { x, y } : { x: 0, y: -1 }
}

// The directed ally acts (Direct) while the commander's turn waits; otherwise whoever's turn it is.
export const getActiveCombatant = (state) => state.combatants[state.directed?.allyId ?? state.order[state.turnIndex]]
// Able to act: not Defeated (Book p.292: a Defeated character is prone and takes no actions). Designer decision (Oct
// 2026): an enemy that surrendered is out of the fight too (combatSocial.js).
export const isActive = (combatant) => !combatant.condition.defeated && !combatant.surrendered
// Stands on its tile and blocks movement: a surrendered enemy still does; the Defeated (prone) don't.
export const occupiesTile = (combatant) => !combatant.condition.defeated
export const getCombatantList = (state) => state.order.map((id) => state.combatants[id])
// Whether a combatant knows another is there. Only combat started in the world tracks this (state.knowledge), and only
// for enemies: a party member an enemy hasn't detected is present but not one of its opponents.
export const knowsAbout = (state, viewer, other) => !state.knowledge?.[viewer.id] || Boolean(state.knowledge[viewer.id][other.id]?.known)
export const getOpponents = (state, combatant) =>
  getCombatantList(state).filter((other) => other.side !== combatant.side && isActive(other) && knowsAbout(state, combatant, other))

// Designer decision (Oct 2026): party members whose initiative slots are next to each other act as one group; the player
// picks who acts, can switch at any time (even with actions left), and the group ends when every member is finished.
// Defeated combatants between them do not split a group. Enemies always act one at a time.
export function getTurnGroupRange(state) {
  const { order, combatants, turnIndex } = state
  const isParty = (index) => combatants[order[index]].side === 'player'
  if (!isParty(turnIndex)) return { start: turnIndex, end: turnIndex, ids: [order[turnIndex]] }
  const joins = (index) => isParty(index) || !isActive(combatants[order[index]])
  let start = turnIndex
  let end = turnIndex
  while (start > 0 && joins(start - 1)) start -= 1
  while (end < order.length - 1 && joins(end + 1)) end += 1
  const ids = order.slice(start, end + 1).filter((id) => combatants[id].side === 'player' && isActive(combatants[id]))
  return { start, end, ids }
}

export const getTurnGroup = (state) => getTurnGroupRange(state).ids

// Every combatant always has a facing; one without a stored facing faces the nearest active opponent.
export function getFacing(state, combatant) {
  if (combatant.facing) return combatant.facing
  const nearest = getOpponents(state, combatant).sort((a, b) => tileDistance(combatant.position, a.position) - tileDistance(combatant.position, b.position))[0]
  return facingToward(combatant.position, nearest?.position ?? combatant.position)
}

export function getTurnOf(state, id) {
  if (state.directed?.allyId === id) return state.turn
  if (state.directed?.commanderId === id) return state.directed.commanderTurn
  return id === state.order[state.turnIndex] ? state.turn : state.groupTurns[id] ?? freshTurn()
}

// Out of actions: no major or minor action left, or pressed End Turn.
export function isTurnFinished(state, id) {
  const turn = getTurnOf(state, id)
  return turn.done || actionsLeft(turn) <= 0
}

// Something waits for a decision before play goes on: an Avoid Injury choice, a Fatigue attribute choice or a
// Counterattack.
export const awaitingDecision = (state) => Boolean(state.incomingInjury || state.pendingFatigue || state.pendingCounterattack)

export const canAct = (state, combatant) => !state.outcome && !state.pending && !awaitingDecision(state) && getActiveCombatant(state)?.id === combatant.id
// actionId: an action id (its type from actions.json) or a type ('major' | 'minor' | 'free').
export function canAfford(state, combatant, actionId) {
  const type = actionTypeOf(actionId)
  return canAct(state, combatant) && (type === 'free' || state.turn[type] > 0)
}

// Book p.265, p.324: NPCs pay with Threat for the spends the party pays for with group Momentum.
export const extraActionPool = (combatant) => (combatant.side === 'player' ? 'momentum' : 'threat')

function poolShortfall(state, combatant, cost) {
  const pool = extraActionPool(combatant)
  if (state.resources[pool] >= cost) return null
  return pool === 'momentum' ? `Costs ${cost} Momentum; the group pool has ${state.resources.momentum}.` : `Costs ${cost} Threat; there is ${state.resources.threat}.`
}

// Book p.260: an Extra Minor Action for 1 Momentum, once per turn. Why it can't be bought now (null = it can).
export function extraMinorBlock(state, combatant) {
  if (!canAct(state, combatant)) return 'Not this character\'s action.'
  if (state.turn.done) return 'Turn ended.'
  if (state.turn.extraMinor) return 'Already bought an extra minor action this turn.'
  return poolShortfall(state, combatant, EXTRA_ACTIONS.extraMinorCost)
}

// Book p.289: a second major action for 2 Momentum; the task attempted with it is +1 Difficulty. Not while directed
// (Direct is the ally's extra action), and never a third major action in a round.
export function secondMajorBlock(state, combatant) {
  if (!canAct(state, combatant)) return 'Not this character\'s action.'
  if (state.directed) return 'Not during a Direct.'
  if (state.turn.done) return 'Turn ended.'
  if (state.turn.major > 0) return 'Take your major action first.'
  if (majorsTaken(state, combatant.id) >= MAX_MAJORS_PER_ROUND) return `Already ${MAX_MAJORS_PER_ROUND} major actions this round.`
  return poolShortfall(state, combatant, EXTRA_ACTIONS.secondMajorCost)
}

// The Difficulty lines a bought second major action adds to this combatant's next major task ([] when none waits).
export const secondMajorLines = (state, combatantId) =>
  getTurnOf(state, combatantId).secondMajor ? [{ label: 'Second major action', change: EXTRA_ACTIONS.secondMajorDifficulty }] : []

// Book p.286: being within Reach of an enemy raises the Difficulty of any task that isn't a melee attack (actions.json
// reachPenalty; the caller leaves melee attacks out). Enemies are the active opponents the combatant knows about, as for
// the Move block. position: where the task is attempted from (the AI tests other tiles).
export function reachLines(state, combatant, position = combatant.position) {
  const enemy = getOpponents(state, combatant).find((opponent) => tileDistance(position, opponent.position) <= REACH_TILES)
  return enemy ? [{ label: `Enemy within Reach (${enemy.character.name})`, change: REACH_PENALTY }] : []
}

// Aim doesn't stack, and is taken at most once per turn (Book p.260: each minor action once per turn).
export const canAim = (state, combatant) => canAfford(state, combatant, 'aim') && !state.turn.aimReroll && !state.turn.aimed

export const statusText = (combatant) => conditionSummary(combatant.character, combatant.condition)
