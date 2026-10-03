// The one-line instruction shown during combat: what the player can do next, from the combat state and the UI selection.
import { getActiveCombatant, getMovementLeft, isActive, rollAwaitsPlayer } from './combatState.js'
import { TASK_DICE } from '../rules/taskResolver.js'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

function rollHint(state) {
  const { pending, result } = state
  if (pending) {
    if (!rollAwaitsPlayer(state)) return `Green dice are successes; you need ${pending.task.difficulty}.`
    const options = []
    if (pending.aimReroll) options.push('Aim reroll')
    if (state.momentum) options.push('Momentum reroll')
    return `This misses: you need ${pending.task.difficulty} green ${pending.task.difficulty === 1 ? 'die' : 'dice'}. Use ${options.join(' or ')} on a red die, or click Accept Miss.`
  }
  if (result && !result.closed && result.passed && !result.extraHit && state.momentum && isActive(state.combatants[result.targetId])) {
    if (state.turn.minorUsed && state.turn.majorUsed) {
      // Only an offer from the attack that used up the turn holds the turn open (see CombatScreen); otherwise it passes on.
      return state.lastAction?.type === 'resolve' ? 'Hit! Spend Momentum for +1 Hit below, or click End Turn to keep it.' : null
    }
    return 'Hit! You have Momentum: spend it for +1 Hit below, or keep it for later.'
  }
  return null
}

function modeHint(mode, { preview, movePath, routeInCover }) {
  if (mode === 'move') {
    if (movePath) return `Click to move there (${plural(movePath.length - 1, 'tile')}${routeInCover ? ', ends in cover' : ''}).`
    return 'Click a blue tile to move there (end next to a crate or console to be in cover), or choose another action on the right.'
  }
  if (mode === 'aim') return 'Click AIM. Later this turn you may reroll one attack die.'
  if (mode === 'attack') {
    if (!preview?.task) return 'Click a Klingon to target it.'
    if (!preview.available) return `${preview.reason} Click the other Klingon, or Move first.`
    if (preview.task.difficulty > TASK_DICE) return 'This shot cannot succeed. Move closer or pick another target.'
    return `Choose Stun or Deadly, then click FIRE. You need ${plural(preview.task.difficulty, 'success')}: each die at or under ${preview.task.targetNumber}.`
  }
  return null
}

export function getCombatHint(state, ui) {
  if (state.outcome) return null
  const active = getActiveCombatant(state)
  if (ui.auto && ui.auto !== 'off') {
    const prefix = ui.auto === 'paused' ? 'Auto Combat paused' : 'Auto Combat'
    return `${prefix}: ${active.character.name}${state.aiReason ? ` - ${state.aiReason}` : ' is deciding.'}`
  }
  if (active.controller !== 'player') return `${active.character.name} is acting. Watch the dice at the bottom.`
  const roll = rollHint(state)
  if (roll) return roll
  const selected = modeHint(ui.mode, ui)
  if (selected) return selected
  const { minorUsed, majorUsed } = state.turn
  const tilesLeft = getMovementLeft(state, active)
  if (minorUsed && majorUsed) {
    if (tilesLeft) return `You can still move ${plural(tilesLeft, 'tile')}, or click End Turn.`
    return ui.othersReady ? 'Turn used up. Passing to the next Ready party member...' : 'Turn used up. Ending the turn...'
  }
  if (!majorUsed && !ui.targetInRange) {
    if (tilesLeft) return `No Klingon in range to attack. Move closer (${plural(tilesLeft, 'tile')} left), or End Turn.`
    return 'No Klingon in range to attack. Click End Turn.'
  }
  if (minorUsed && tilesLeft) return `Now click Attack, move ${plural(tilesLeft, 'more tile')}, or End Turn.`
  if (minorUsed) return 'Now click Attack, or End Turn.'
  if (majorUsed) return 'You can still Move or Aim, or click End Turn.'
  return `${active.character.name}'s turn: a minor action (Move or Aim) and an Attack, then End Turn.`
}
