// Turns and rounds: starting a combatant's turn, ending a group's turns, handing the turn between party members,
// moving on to the next combatant or round, settling a Direct, and noticing the fight is over.
import { endOfTurnCondition, injuryTypeName } from '../rules/personalCondition.js'
import { addLog, turnHeader, updateCombatant } from './combatLog.js'
import { awaitingDecision, getTurnGroupRange, isActive } from './combatSelectors.js'
import { freshTurn } from './turnActions.js'

// Start of a combatant's own turn: a Guard on them ends (Book p.288: until the start of the guarded character's next turn).
export function startTurnOf(state, id) {
  if (state.startedThisRound.includes(id)) return state
  let next = { ...state, startedThisRound: [...state.startedThisRound, id] }
  if (next.combatants[id].guard) {
    next = updateCombatant(next, id, { guard: null })
    next = addLog(next, [`Guard on ${next.combatants[id].character.name} ends (start of their turn).`], 'info')
  }
  return next
}

// End of the current turn group: each member who took a turn this round reaches the end of it, so Stun Injuries wearing
// off (Book p.292: removed at the end of the next turn after no longer being Defeated) go.
export function endTurnsOf(state, ids) {
  let next = state
  ids.forEach((id) => {
    const combatant = next.combatants[id]
    if (!isActive(combatant) || !next.startedThisRound.includes(id)) return
    const { condition, removed } = endOfTurnCondition(combatant.condition)
    if (!removed.length) return
    next = updateCombatant(next, id, { condition })
    next = addLog(next, [`${combatant.character.name}: ${removed.map((injury) => `${injuryTypeName(injury.type)} Injury (Severity ${injury.severity})`).join(', ')} wears off at the end of their turn.`], 'info')
  })
  return next
}

export function withOutcome(state) {
  const list = Object.values(state.combatants)
  const outcome = list.filter((c) => c.side === 'player').every((c) => !isActive(c))
    ? 'defeat'
    : list.filter((c) => c.side === 'enemy').every((c) => !isActive(c))
      ? 'victory'
      : null
  if (!outcome) return state
  return addLog({ ...state, outcome }, [`${outcome === 'victory' ? 'VICTORY' : 'DEFEAT'} in round ${state.round}.`], 'info')
}

// Hands the turn to another member of the current party group, keeping each member's used actions.
export function switchToMember(state, id) {
  const groupTurns = { ...state.groupTurns, [state.order[state.turnIndex]]: state.turn }
  const next = {
    ...state,
    groupTurns,
    turn: groupTurns[id] ?? freshTurn(),
    turnIndex: state.order.indexOf(id),
    aiReason: null,
    result: state.result && { ...state.result, closed: true },
  }
  return startTurnOf(addLog(next, turnHeader(next.combatants[id]), 'turn'), id)
}

// Moves past the whole current group (a single combatant for enemies) to the next active combatant.
export function advanceTurn(previous) {
  const range = getTurnGroupRange(previous)
  const state = endTurnsOf(previous, previous.order.slice(range.start, range.end + 1))
  let { round } = state
  let turnIndex = range.end
  for (let i = 0; i < state.order.length; i++) {
    turnIndex += 1
    if (turnIndex >= state.order.length) {
      turnIndex = 0
      round += 1
    }
    if (isActive(state.combatants[state.order[turnIndex]])) break
  }
  const newRound = round !== state.round
  let next = {
    ...state,
    turnIndex,
    round,
    turn: freshTurn(),
    groupTurns: {},
    assists: newRound ? {} : state.assists,
    directedThisRound: newRound ? [] : state.directedThisRound,
    majorsThisRound: newRound ? {} : state.majorsThisRound,
    startedThisRound: newRound ? [] : state.startedThisRound,
    aiReason: null,
    result: state.result && { ...state.result, closed: true },
  }
  if (newRound) next = addLog(next, [`ROUND ${round}`], 'round')
  const id = next.order[turnIndex]
  return startTurnOf(addLog(next, turnHeader(next.combatants[id]), 'turn'), id)
}

// A Direct ends once the directed ally has taken their action (and any attack it started has resolved): the commander's
// turn carries on with what it had left.
export function settleDirected(state) {
  const { directed } = state
  if (!directed || state.pending || awaitingDecision(state)) return state
  const ally = state.combatants[directed.allyId]
  if (state.turn.major > 0 && !state.turn.done && isActive(ally) && !state.outcome) return state
  const next = {
    ...state,
    turn: directed.commanderTurn,
    directed: null,
    directedThisRound: [...state.directedThisRound, directed.allyId],
  }
  return addLog(next, [`${ally.character.name}'s directed action is done; back to ${state.combatants[directed.commanderId].character.name}.`], 'info')
}
