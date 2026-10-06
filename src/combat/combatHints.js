// The one-line instruction shown during combat: what the player can do next, from the combat state and the UI selection.
import { actionsLeft, actionsLeftText, ADAPTATION_MOMENTUM_SPENDS, canAimReroll, getActiveCombatant, getMovementBlock, getMovementLeft, rollAwaitsPlayer } from './combatState.js'
import { TASK_DICE } from '../rules/taskResolver.js'
import { getInjuryMode } from './weaponSystem.js'

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : word.endsWith('s') ? 'es' : 's'}`

function rollHint(state) {
  const { pending } = state
  if (pending) {
    if (!rollAwaitsPlayer(state)) return `Green dice score 1 success, gold critical dice score 2; you need ${pending.task.difficulty}.`
    const options = []
    const aimDice = pending.dice.filter((value, index) => value > pending.task.targetNumber && canAimReroll(pending, index)).length
    if (aimDice) options.push(pending.aimRerolls > 1 ? `Aim reroll (${pending.aimRerolls} left)` : 'Aim reroll')
    if (ADAPTATION_MOMENTUM_SPENDS && state.resources.momentum) options.push('Momentum reroll (1 Momentum)')
    return `This misses: you need ${plural(pending.task.difficulty, 'success')}. Use ${options.join(' or ')} on a red die, or click No Reroll.`
  }
  return null
}

function modeHint(mode, ui) {
  const { preview, movePath, routeInCover, assistAlly } = ui
  if (mode === 'ambush') {
    const ambush = ui.ambushPreview
    if (ambush?.target && !ambush.available) return `${ambush.reason} Pick a Klingon they can shoot, or right-click / Esc to cancel.`
    if (!ambush?.available) return 'Choose a Klingon the ambusher has a shot at. Right-click or Esc to cancel.'
    return `Click Ambush (free) by ${ambush.target.character.name}: ${ambush.ambusher.character.name} needs 1 die at or under ${ambush.task.targetNumber} (${Math.round(ambush.chance * 100)}%). If spotted, the Klingons act first.`
  }
  if (mode === 'assist') {
    if (assistAlly) return `Click Assist (Major action): ${assistAlly.character.name}'s next task this round adds your 1d20.`
    if (ui.ringAllyName) return `${ui.ringAllyName} can't be assisted now. Click Switch to hand them the turn.`
    return 'Pick the ally to assist in the Task panel, then click ASSIST.'
  }
  if (mode === 'move') {
    if (movePath) return `Click to move there (${plural(movePath.length - 1, 'tile')}${routeInCover ? ', ends in cover' : ''}).`
    return 'Click a blue tile to move there (end next to a crate or console to be in cover), or click a Klingon to attack.'
  }
  if (mode === 'sprint') {
    if (movePath) return `Click to sprint there (${plural(movePath.length - 1, 'tile')}, Major action${routeInCover ? ', ends in cover' : ''}).`
    return 'Click a blue tile to sprint there (half your movement, Major action, no roll). Right-click to cancel.'
  }
  if (mode === 'guard' || mode === 'firstAid' || mode === 'direct') {
    const task = ui.taskPreview
    if (mode === 'direct') return ui.directBlock ?? 'Pick the ally to direct in the Task panel (1 Momentum). They act at once; you assist with Control + Command.'
    if (!task) return 'Pick who in the Task panel. Right-click or Esc to cancel.'
    if (!task.available) return `${task.reason} Right-click or Esc to cancel.`
    return `Click ${task.label} (Major action): you need ${plural(task.task.difficulty, 'success')}, each die at or under ${task.task.targetNumber}.`
  }
  if (mode === 'interact') {
    return 'Pick an approach in the object panel. Its cost (Major or Minor) is shown before you commit.'
  }
  if (mode === 'attack') {
    if (!preview?.task) return 'Click a Klingon to target it.'
    if (!preview.available) return `${preview.reason} Click another Klingon, or Move first.`
    const dice = TASK_DICE + (ui.bonusDice ?? 0)
    if (preview.task.difficulty > dice * 2 + (ui.assistHelper ? 2 : 0)) return 'This shot cannot succeed. Buy bonus d20s, move closer or pick another target.'
    const assisted = ui.assistHelper ? ` ${ui.assistHelper.character.name}'s assist die adds its successes if you score at least one.` : ''
    const critical = preview.task.criticalRange > 1 ? `at or under ${preview.task.criticalRange}` : 'on a 1'
    const opposed = preview.opposition ? ' The target rolls first to set the Difficulty.' : ''
    if (ui.attackMode) return `${getInjuryMode(ui.attackMode).name} chosen: click a Klingon to target it, then FIRE (Major action, ${dice}d20). You need ${plural(preview.task.difficulty, 'success')}: each die at or under ${preview.task.targetNumber}, 2 ${critical}.${opposed}${assisted} Right-click to cancel.`
    return `Click Stun or Deadly by the target to fire (Major action, ${dice}d20). You need ${plural(preview.task.difficulty, 'success')}: each die at or under ${preview.task.targetNumber}, 2 ${critical}.${opposed}${assisted}`
  }
  return null
}

export function getCombatHint(state, ui) {
  if (state.outcome) return null
  const active = getActiveCombatant(state)
  if (state.incomingInjury && !(ui.auto && ui.auto !== 'off')) {
    const target = state.combatants[state.incomingInjury.targetId]
    const { cost, overflow } = state.incomingInjury.option
    const avoid = overflow ? 'fill Stress to maximum and suffer a complication' : `take ${cost} Stress`
    return `${target.character.name} is hit: Avoid Injury (${avoid}) or accept the Injury and be Defeated.`
  }
  if (state.pendingFatigue && !(ui.auto && ui.auto !== 'off')) {
    return `${state.combatants[state.pendingFatigue.combatantId].character.name} is Fatigued: choose the attribute to shut down (its tasks automatically fail).`
  }
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
  const { turn } = state
  if (state.directed) return `${active.character.name} is directed: take one Major action now (${state.combatants[state.directed.commanderId].character.name} assists).`
  if (!actionsLeft(turn)) return ui.nextName ? `Out of actions. Passing to ${ui.nextName}...` : 'Party turn over. The enemy is next...'
  if (!ui.targetInRange) {
    const tiles = getMovementLeft(state, active)
    const sprint = getMovementLeft(state, active, 'sprint')
    const sprintText = sprint ? ` Point at ${active.character.name} for Sprint (+${plural(sprint, 'tile')}).` : ''
    if (tiles) return `No Klingon in range to attack. Move closer (up to ${plural(tiles, 'tile')}).${sprintText}`
    const block = getMovementBlock(state, active, 'move')
    return sprint ? `No Klingon in range to attack.${block ? ` ${block}` : ''}${sprintText}` : `No Klingon in range to attack. ${block ?? 'No movement left this turn.'}`
  }
  if (ui.assistHelper) return `${ui.assistHelper.character.name} is assisting your next task. ${actionsLeftText(turn)}.`
  if (!turn.major) return `${actionsLeftText(turn)}: Move or Aim, a routine interaction, or End Turn.`
  return `${active.character.name}'s turn: one Major action (attack, Sprint, Assist, Guard, First Aid, Direct or a task) and one Minor action (Move, Aim). Point at ${active.character.name} for the rest.`
}
