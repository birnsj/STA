// Small state transitions every combat step shares (log entries, the last action marker, a combatant update, the stats
// block, the next seeded roll) and the log's wording for tasks, dice and Momentum, so every step reads the same way.
import { deriveSeed, seededRandomInt } from '../rules/seededRandom.js'
import { MAX_MOMENTUM, PROTOTYPE_SAVE_BONUS_MOMENTUM } from '../rules/missionResources.js'
import { evaluateStaDie } from '../rules/taskResolver.js'
import { previewAttack } from './combatAttacks.js'

export const addLog = (state, lines, kind = 'action') => ({ ...state, log: [...state.log, { id: state.log.length, round: state.round, kind, lines }] })

// The action that just happened (key = the log index of its entry), so the battlefield can show it once.
export const markAction = (state, type, actorId, details = {}) => ({ ...state, lastAction: { key: state.log.length, type, actorId, ...details } })

export const updateCombatant = (state, id, changes) => ({ ...state, combatants: { ...state.combatants, [id]: { ...state.combatants[id], ...changes } } })

// The next roll's generator: one derived seed per roll, so replays match no matter how the UI is paced.
export function takeRandom(state) {
  return { random: seededRandomInt(deriveSeed(state.seed, state.rolls)), next: { ...state, rolls: state.rolls + 1 } }
}

export function withStats(state, change) {
  const stats = structuredClone(state.stats)
  change(stats)
  return { ...state, stats }
}

export const turnHeader = (combatant) => [
  combatant.character.name,
  `Initiative: Daring ${combatant.character.attributes.daring}, Control ${combatant.character.attributes.control}`,
]

export const taskText = (task) => `${task.attribute.name} ${task.attribute.value} + ${task.department.name} ${task.department.value} = TN ${task.targetNumber}`

export const focusText = (task) => (task.focus ? `${task.focus} (critical at or under ${task.criticalRange})` : 'None (critical only on a 1)')

// Evaluated dice as "4 = 2 (critical), 17 = 0, 20 = 0 (complication)".
export const diceText = (dice) =>
  dice.map((die) => `${die.value} = ${die.successes}${die.critical ? ' (critical)' : ''}${die.complication ? ' (complication)' : ''}`).join(', ')

export const purchaseLine = (purchase) => {
  const paid = [purchase.momentum && `${purchase.momentum} Momentum`, purchase.threatAdded && `${purchase.threatAdded} Threat added`, purchase.threatSpent && `${purchase.threatSpent} Threat spent`]
  return `Bought ${purchase.bonusDice} bonus d20${purchase.bonusDice === 1 ? '' : 's'} (${purchase.dice}d20) for ${purchase.cost}: ${paid.filter(Boolean).join(' + ')}`
}

export const momentumLine = (generated, saving, resources) =>
  `Momentum generated: ${generated}; ${saving.saved} saved to the group pool (now ${resources.momentum}/${MAX_MOMENTUM})${saving.lost ? `; ${saving.lost} over the maximum, lost unless spent now` : ''}`

export const bonusMomentumLine = (bonus) =>
  PROTOTYPE_SAVE_BONUS_MOMENTUM
    ? `Bonus Momentum: ${bonus} of that (saved to the pool: prototype rule; Book p.260 says it can't be saved)`
    : `Bonus Momentum: ${bonus} of that (cannot be saved to the pool, Book p.260)`

export const assistLine = (state, assist) => {
  const die = evaluateStaDie(assist.task, assist.die)
  const role = assist.via === 'direct' ? 'Commander assists (Direct)' : 'Assist'
  return `${role}: ${state.combatants[assist.helperId].character.name}, ${taskText(assist.task)}, focus ${focusText(assist.task)}, rolls ${diceText([die])}`
}

export const oppositionName = (opposition) => (opposition.when === 'targetInCover' ? 'Target in cover' : 'Target defends')

export const formatPosition = (position) => `(${position.x},${position.y})`

// AI-chosen actions carry decision (what) and reason (why). They are logged and kept for the debug panel; player actions carry neither.
export function recordDecision(state, actor, action, details = {}) {
  if (!action.reason) return { state, lines: [] }
  // For a move, the planned shot is measured from the destination.
  const from = details.path ? details.path[details.path.length - 1] : undefined
  const plan = action.targetId && action.weaponId ? previewAttack(state, actor.id, action.targetId, action.weaponId, from) : null
  const lastDecision = {
    round: state.round,
    actorId: actor.id,
    type: action.type,
    decision: action.decision ?? action.type,
    reason: action.reason,
    targetId: action.targetId ?? null,
    weaponId: action.weaponId ?? null,
    injuryMode: action.injuryMode ?? null,
    band: plan?.band?.name ?? null,
    distance: plan?.distance ?? null,
    path: null,
    actorInCover: actor.inCover,
    targetInCover: action.targetId ? state.combatants[action.targetId].inCover : null,
    ...details,
  }
  const lines = [`AI Decision: ${lastDecision.decision}`, `Reason: ${action.reason}`]
  return { state: { ...state, aiReason: action.reason, lastDecision }, lines }
}
