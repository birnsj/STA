// The one-line instruction shown during combat: what the player can do next, from the combat state and the UI selection.
import { getActiveCombatant, getMovementLeft, isActive, rollAwaitsPlayer, TURN_AP } from './combatState.js'
import { TASK_DICE } from '../rules/taskResolver.js'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

function rollHint(state) {
  const { pending, result } = state
  if (pending) {
    if (!rollAwaitsPlayer(state)) return `Green dice are successes; you need ${pending.task.difficulty}.`
    const options = []
    if (pending.aimReroll) options.push('Aim reroll')
    if (state.momentum) options.push('Momentum reroll')
    return `This misses: you need ${pending.task.difficulty} green ${pending.task.difficulty === 1 ? 'die' : 'dice'}. Use ${options.join(' or ')} on a red die, or click No Reroll.`
  }
  if (result && !result.closed && result.passed && !result.extraHit && state.momentum && isActive(state.combatants[result.targetId])) {
    if (!state.turn.ap) {
      // The turn still ends by itself, after a longer pause so the offer can be taken (see CombatScreen).
      return state.lastAction?.type === 'resolve' ? 'Hit! Spend Momentum for +1 Hit below before the turn ends, or let it pass to keep it.' : null
    }
    return 'Hit! You have Momentum: spend it for +1 Hit below, or keep it for later.'
  }
  return null
}

function modeHint(mode, ui) {
  const { preview, movePath, routeInCover, assistAlly } = ui
  if (mode === 'assist') {
    if (assistAlly) return `Click Assist (1 AP): ${assistAlly.character.name}'s next attack this round adds your 1d20.`
    if (ui.ringAllyName) return `${ui.ringAllyName} can't be assisted now. Click Switch to hand them the turn.`
    return 'Pick the ally to assist in the Task panel, then click ASSIST.'
  }
  if (mode === 'move') {
    if (movePath) return `Click to move there (${plural(movePath.length - 1, 'tile')}${routeInCover ? ', ends in cover' : ''}).`
    return 'Click a blue tile to move there (end next to a crate or console to be in cover), or click a Klingon to attack.'
  }
  if (mode === 'attack') {
    if (!preview?.task) return 'Click a Klingon to target it.'
    if (!preview.available) return `${preview.reason} Click another Klingon, or Move first.`
    if (preview.task.difficulty > TASK_DICE) return 'This shot cannot succeed. Move closer or pick another target.'
    const assisted = ui.assistHelper ? ` ${ui.assistHelper.character.name}'s assist die adds 1 more if you score at least one.` : ''
    return `Click Stun or Deadly by the target to fire (1 AP). You need ${plural(preview.task.difficulty, 'success')}: each die at or under ${preview.task.targetNumber}.${assisted}`
  }
  return null
}

export function getCombatHint(state, ui) {
  if (state.outcome) return null
  const active = getActiveCombatant(state)
  if (ui.auto && ui.auto !== 'off') {
    const prefix = ui.auto === 'paused' ? 'Auto Combat paused' : 'Auto Combat'
    // A choice about to run (its button lit on the map) is explained before the older reason.
    const reason = ui.planned ? `${ui.planned.decision}: ${ui.planned.reason}` : state.aiReason
    return `${prefix}: ${active.character.name}${reason ? ` - ${reason}` : ' is deciding.'}`
  }
  if (active.controller !== 'player') return `${active.character.name} is acting. Watch the dice at the bottom.`
  const roll = rollHint(state)
  if (roll) return roll
  const selected = modeHint(ui.mode, ui)
  if (selected) return selected
  const { ap } = state.turn
  if (!ap) return ui.nextName ? `Out of AP. Passing to ${ui.nextName}...` : 'Party turn over. The enemy is next...'
  if (!ui.targetInRange) {
    const tiles = getMovementLeft(state, active)
    return tiles ? `No Klingon in range to attack. Move closer (up to ${plural(tiles, 'tile')}).` : 'No Klingon in range to attack, and you have already moved this turn.'
  }
  if (ui.assistHelper) return `${ui.assistHelper.character.name} is assisting your next attack. ${plural(ap, 'AP')} left.`
  if (ap < TURN_AP) return `${plural(ap, 'AP')} left: click a Klingon to attack or aim, or a party member to assist${state.turn.moved ? '' : '; or Move'}.`
  return `${active.character.name}'s turn: ${TURN_AP} AP, 1 per action. Click a Klingon to attack or aim; the turn ends at 0 AP.`
}
