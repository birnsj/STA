// The one-line instruction shown during combat: what the player can do next, from the combat state and the UI selection.
import { getActiveCombatant, isActive } from './combatState.js'
import { TASK_DICE } from '../rules/taskResolver.js'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

function rollHint(state) {
  const { pending, result } = state
  if (pending) {
    const options = []
    if (pending.aimReroll) options.push('Aim reroll')
    if (state.momentum) options.push('Momentum reroll')
    const reroll = options.length ? ` You can use ${options.join(' or ')} on a red die first.` : ''
    return `Green dice are successes; you need ${pending.task.difficulty}.${reroll} Then click Resolve.`
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

function modeHint(mode, { preview, movePath }) {
  if (mode === 'move') return movePath ? `Click to move there (${plural(movePath.length - 1, 'tile')}).` : 'Click a blue tile to move there, or choose another action on the right.'
  if (mode === 'aim') return 'Click AIM. Later this turn you may reroll one attack die.'
  if (mode === 'takeCover') return 'Click TAKE COVER. Attackers must beat your cover roll. Moving loses it.'
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
  if (minorUsed && majorUsed) return ui.othersReady ? 'Turn used up. Passing to the next Ready party member...' : 'Turn used up. Ending the turn...'
  if (minorUsed) return 'Now click Attack, or End Turn.'
  if (majorUsed) return 'You can still Move, Aim or Take Cover, or click End Turn.'
  return `${active.character.name}'s turn: a minor action (Move, Aim, Take Cover) and an Attack, then End Turn.`
}
