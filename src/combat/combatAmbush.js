// VIDEOGAME ADAPTATION - designer decision (Oct 2026), from the book's stealth attribute (Captain's Log p.74: Control for
// "remaining stealthy") and ambush (p.205: the ambusher "may score an automatic hit"): on a party turn, until anyone
// attacks (either side), the party may try one Ambush, so it can sneak into position over several rounds. The party
// member with the best Control + Security rolls at Difficulty 1 (the shared STA 2E task: Camouflage or Ambush Tactics also
// gives critical successes at or under Security). VIDEOGAME ADAPTATION: the focus rerolls one failed die for free (no
// book rule gives a focus a reroll). Success: an automatic hit on the chosen Klingon (an Injury from the ambusher's
// weapon, see ambushStep). Failure: the Klingons act first for the rest of the fight, starting now. A free action.
import { saveMomentum } from '../rules/missionResources.js'
import { seededRandomInt } from '../rules/seededRandom.js'
import { prepareTask } from '../rules/taskPreparation.js'
import { rerollDie, resolveStaTask, rollDice, staTaskChance } from '../rules/taskResolver.js'
import { previewAttack } from './combatAttacks.js'
import { inflictInjury, injuryFor } from './combatInjuries.js'
import { addLog, diceText, focusText, markAction, momentumLine, recordDecision, takeRandom, taskText, turnHeader, withStats } from './combatLog.js'
import { getActiveCombatant, getCombatantList, getOpponents, isActive } from './combatSelectors.js'
import { endTurnsOf, startTurnOf, withOutcome } from './combatTurnOrder.js'
import { buildInitiativeOrder } from './initiativeSystem.js'
import { freshTurn } from './turnActions.js'
import { getInjuryMode, getWeapon } from './weaponSystem.js'

export const AMBUSH_DIFFICULTY = 1
export const AMBUSH_FOCUSES = ['Camouflage', 'Ambush Tactics']

export const canAmbush = (state) => state.ambush === null && !state.outcome && !state.pending && !state.directed && getActiveCombatant(state).side === 'player'

export function getAmbusher(state) {
  const score = (combatant) => combatant.character.attributes.control + combatant.character.disciplines.security
  return getCombatantList(state)
    .filter((combatant) => combatant.side === 'player' && isActive(combatant))
    .reduce((best, combatant) => (!best || score(combatant) > score(best) ? combatant : best), null)
}

export function previewAmbush(state, targetId) {
  const ambusher = getAmbusher(state)
  const target = state.combatants[targetId]
  if (!ambusher) return { available: false, reason: 'No one can ambush.' }
  const prepared = prepareTask(ambusher.character, { attribute: 'control', department: 'security', difficulty: AMBUSH_DIFFICULTY, focuses: AMBUSH_FOCUSES, tags: ['ambush'] })
  const task = { ...prepared.task, difficulty: prepared.difficulty }
  // The focus reroll gives a failed die one more try.
  const chance = staTaskChance({ task, difficulty: task.difficulty, rerolls: task.focus ? 1 : 0 })
  const base = { ambusher, target, task, chance }
  if (!canAmbush(state)) return { ...base, available: false, reason: 'The chance to ambush has passed.' }
  if (!target || target.side === 'player' || !isActive(target)) return { ...base, available: false, reason: 'Choose a Klingon to ambush.' }
  // Designer decision (Oct 2026): only a Klingon the ambusher could shoot right now (in a weapon's range, clear line of fire).
  const inReach = ambusher.weaponIds.some((weaponId) => previewAttack(state, ambusher.id, target.id, weaponId).available)
  if (!inReach) return { ...base, available: false, reason: `${ambusher.character.name} has no shot at ${target.character.name} (out of range or no line of fire).` }
  return { ...base, available: true, reason: null }
}

// The Klingons the ambusher could ambush now.
export const getAmbushTargets = (state) => {
  const ambusher = getAmbusher(state)
  return ambusher ? getOpponents(state, ambusher).filter((enemy) => previewAmbush(state, enemy.id).available) : []
}

// The reducer's 'ambush' action.
export function ambushStep(state, action) {
  const preview = previewAmbush(state, action.targetId)
  if (!preview.available) return state
  const { ambusher, target, task } = preview
  const decided = recordDecision(state, ambusher, action)
  const { random, next: afterDraw } = takeRandom(decided.state)
  const resolve = (values) => resolveStaTask({ leader: { task, dice: values }, difficulty: task.difficulty })
  let dice = rollDice(random)
  const rerolls = []
  const firstRoll = resolve(dice)
  if (task.focus && !firstRoll.success) {
    const index = firstRoll.dice.findLastIndex((die) => !die.successes)
    const rerolled = rerollDie(dice, index, random)
    rerolls.push({ index, from: dice[index], to: rerolled[index], source: 'focus' })
    dice = rerolled
  }
  const evaluation = resolve(dice)
  const passed = evaluation.success
  const saving = saveMomentum(state.resources, evaluation.momentumGenerated)
  let next = {
    ...afterDraw,
    resources: saving.resources,
    ambush: { ambusherId: ambusher.id, targetId: target.id, success: passed },
  }
  const lines = [
    ...decided.lines,
    `Ambush: ${ambusher.character.name} sneaks up on ${target.character.name}`,
    `${taskText(task)}, Difficulty ${task.difficulty}`,
    `Focus: ${task.focus ? `${focusText(task)}; free reroll` : focusText(task)}`,
    ...rerolls.map((reroll) => `Focus reroll die ${reroll.index + 1}: ${reroll.from} -> ${reroll.to}`),
    `Rolls: ${diceText(evaluation.dice)} (${evaluation.successes} ${evaluation.successes === 1 ? 'success' : 'successes'})`,
  ]
  if (passed) {
    // The ambusher's first weapon with a shot, on Stun when it has a Stun setting (see actions.json ambush notes).
    const weapon = getWeapon(ambusher.weaponIds.find((weaponId) => previewAttack(state, ambusher.id, target.id, weaponId).available))
    const mode = weapon.injuryModes.includes('stun') ? 'stun' : weapon.injuryModes[0]
    const hit = inflictInjury(next, ambusher.id, target.id, injuryFor(next, ambusher, target, weapon, mode))
    next = hit.state
    lines.push('RESULT: AMBUSHED', `Automatic hit: ${weapon.name} (${getInjuryMode(mode).name})`, ...hit.lines)
  } else {
    lines.push('RESULT: SPOTTED. The Klingons act first this fight.')
  }
  if (passed) lines.push(momentumLine(evaluation.momentumGenerated, saving, next.resources))
  if (evaluation.complications) lines.push(`Complications: ${evaluation.complications}`)
  next = withStats(next, (stats) => {
    stats.momentum.generated += evaluation.momentumGenerated
    stats.momentum.saved += saving.saved
    stats.momentum.lost += saving.lost
  })
  next = markAction(next, 'ambush', ambusher.id, { targetId: target.id, passed, removed: !isActive(next.combatants[target.id]) })
  next = addLog(next, lines)
  next = {
    ...next,
    result: {
      kind: 'ambush',
      attackerId: ambusher.id,
      targetId: target.id,
      task,
      opposition: null,
      dice: evaluation.dice,
      assist: null,
      rerolls,
      successes: evaluation.successes,
      passed,
      momentumGenerated: evaluation.momentumGenerated,
      momentumSaved: saving.saved,
      momentumUnsaved: saving.lost,
      threatAdded: 0,
      complications: evaluation.complications,
      taskResult: evaluation,
      closed: false,
    },
  }
  if (passed) return withOutcome(next)
  // Spotted: the party's round ends here (anyone yet to act loses that turn) and a new round starts with initiative rebuilt
  // Klingons first (same tie-breaks as the fight's start), so the Klingons act now and stay first for the rest of the fight.
  const all = Object.values(next.combatants)
  const order = buildInitiativeOrder(all, seededRandomInt(state.seed), { firstSide: 'enemy' })
  const first = next.combatants[order.find((id) => isActive(next.combatants[id]))]
  const round = state.round + 1
  next = endTurnsOf(next, next.startedThisRound)
  next = {
    ...next,
    order,
    round,
    turnIndex: order.indexOf(first.id),
    turn: freshTurn(),
    groupTurns: {},
    assists: {},
    directedThisRound: [],
    majorsThisRound: {},
    startedThisRound: [],
    aiReason: null,
  }
  next = addLog(next, [`Initiative (Klingons first, then Daring, then Control): ${order.map((id) => next.combatants[id].character.name).join(', ')}`], 'info')
  next = addLog(next, [`ROUND ${round}`], 'round')
  return startTurnOf(addLog(next, turnHeader(first), 'turn'), first.id)
}
