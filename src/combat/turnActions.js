// The action economy of a combat turn (Book p.288; actions.json): what a turn holds, what an action costs, and the
// round's limit on major actions. Pure functions over the turn record; nothing here reads the rest of the combat state.
import actionData from '../data/adaptation/combat/actions.json'

export const ACTIONS_PER_TURN = actionData.actionsPerTurn
const ACTION_TYPES = Object.fromEntries(actionData.actions.map((entry) => [entry.id, entry.type]))
// 'major' | 'minor' | 'free' for an action id; a type passed in is returned as it is (challenge approaches carry a type).
export const actionTypeOf = (actionId) => ACTION_TYPES[actionId] ?? actionId
export const ACTION_TYPE_NAMES = { major: 'Major', minor: 'Minor', free: 'Free' }
// VIDEOGAME ADAPTATION, off by default: the earlier designer Momentum spends (reroll a die, cancel Threat; +1 Hit went with Hits).
export const ADAPTATION_MOMENTUM_SPENDS = actionData.adaptationMomentumSpends === true
export const COMBAT_TASKS = actionData.tasks
export const EXTRA_ACTIONS = actionData.extraActions
export const REACH_PENALTY = actionData.reachPenalty.difficulty
export const COUNTERATTACK_COST = actionData.counterattack.cost

// major / minor: actions of each type left this turn (Book p.288: one of each; see actions.json). Move or Sprint, once,
// never both (Book p.288). done: the character pressed End Turn with actions left. attacks: attacks made this turn (for
// the AI). extraMinor: the Extra Minor Action was bought this turn (Book p.260: once per turn). secondMajor: a bought
// second Major action is waiting; the task performed with it is +1 Difficulty (Book p.289, p.260 Swift Action).
export const freshTurn = () => ({
  major: ACTIONS_PER_TURN.major,
  minor: ACTIONS_PER_TURN.minor,
  aimReroll: false,
  done: false,
  attacks: 0,
  moved: false,
  sprinted: false,
  aimed: false,
  extraMinor: false,
  secondMajor: false,
})
const spendAction = (turn, actionId) => {
  const type = actionTypeOf(actionId)
  if (type === 'free') return turn
  return { ...turn, [type]: Math.max(0, turn[type] - 1), ...(type === 'major' ? { secondMajor: false } : {}) }
}
export const actionsLeft = (turn) => turn.major + turn.minor
// Book p.289: nobody attempts more than two major actions in a round (their own, a bought second one, a Direct).
export const MAX_MAJORS_PER_ROUND = 2
// The acting character spends an action from the current turn; a major action also counts toward the round's limit.
export function spendTurnAction(state, actorId, actionId) {
  const turn = spendAction(state.turn, actionId)
  if (actionTypeOf(actionId) !== 'major') return { ...state, turn }
  return { ...state, turn, majorsThisRound: { ...state.majorsThisRound, [actorId]: (state.majorsThisRound[actorId] ?? 0) + 1 } }
}
export const majorsTaken = (state, id) => state.majorsThisRound?.[id] ?? 0

export const actionsLeftText = (turn) => `${turn.major} Major, ${turn.minor} Minor left`
