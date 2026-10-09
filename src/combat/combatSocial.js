// Persuade and Intimidate: asking an enemy to surrender (Book Core pp.279-282; designer decisions Oct 2026, actions.json
// social). Book p.280: a resisted request is an opposed task in which the asker rolls first and its successes set the
// Difficulty; the resister then rolls (enemies: Control + Command). If the asker wins, the resister gives in or resists
// by suffering Stress equal to the asker's successes. Prototype: an enemy resists while it has Stress left and surrenders
// once it has none; Intimidate also leaves it Intimidated (+1 Difficulty to resist from then on).
import actionData from '../data/adaptation/combat/actions.json'
import { AUDIBLE_RANGE_TILES, withinEarshot } from '../rules/communication.js'
import { checkDicePurchase, npcMomentumToThreat, payForDice, saveMomentum } from '../rules/missionResources.js'
import { remainingStress, sufferStress } from '../rules/personalCondition.js'
import { prepareTask } from '../rules/taskPreparation.js'
import { resolveStaTask, rollDice, staSuccessOdds } from '../rules/taskResolver.js'
import { taskContext, withoutUsedAssist } from './combatAttacks.js'
import { startFatigueChoice } from './combatInjuries.js'
import { addLog, diceText, focusText, markAction, momentumLine, purchaseLine, recordDecision, takeRandom, taskText, updateCombatant, withStats } from './combatLog.js'
import { isActive, reachLines } from './combatSelectors.js'
import { previewCombatTask } from './combatTasks.js'
import { withOutcome } from './combatTurnOrder.js'
import { ACTION_TYPE_NAMES, actionsLeftText, actionTypeOf, COMBAT_TASKS, spendTurnAction } from './turnActions.js'

const SOCIAL = actionData.social
export const SOCIAL_KINDS = ['persuade', 'intimidate']
const VERBS = { persuade: 'Persuade', intimidate: 'Intimidate' }

// The enemy's side of the opposed task: Control + Command, plus its own Difficulty changes (Intimidated, Fatigue, an
// enemy within Reach), which Book p.258 applies on top of the Difficulty the asker sets.
function prepareResist(state, target) {
  const prepared = prepareTask(
    target.character,
    { ...COMBAT_TASKS.resistRequest, difficulty: 0 },
    taskContext(state, target, {
      difficultyMod: target.intimidated ? SOCIAL.intimidatedDifficulty : 0,
      difficultyModLabel: 'Intimidated',
      extraLines: reachLines(state, target),
    }),
  )
  return { prepared, task: prepared.task, extra: prepared.difficulty }
}

// What the task panel shows before asking, and exactly what the roll uses. Besides the usual task preview: resist (the
// enemy's task) and penalty (the asker's own Difficulty changes, which Book p.256 says lower the Difficulty it sets).
export function previewSocial(state, actorId, targetId, kind) {
  const actor = state.combatants[actorId]
  const target = targetId ? state.combatants[targetId] : null
  const verb = VERBS[kind]
  const block =
    !target || target.side === actor.side || !isActive(target)
      ? `Choose an enemy to ${verb.toLowerCase()}.`
      : !withinEarshot(actor, target)
        ? `${target.character.name} is out of earshot (more than ${AUDIBLE_RANGE_TILES} tiles).`
        : null
  const preview = previewCombatTask(state, actor, { kind, label: target ? `${verb} ${target.character.name}` : verb, target, spec: COMBAT_TASKS[kind], block })
  return { ...preview, penalty: preview.task.difficulty, resist: target ? prepareResist(state, target) : null }
}

const setDifficulty = (preview, successes) => (preview.task.autoFail ? 0 : Math.max(0, successes - preview.penalty))

// Chance the asker wins with this many dice (assist die left out): the enemy's roll falls short of the Difficulty set.
export function socialChance(preview, dice) {
  if (!preview.resist) return 0
  const resistOdds = staSuccessOdds(preview.resist.task)
  const resistBelow = (difficulty) => resistOdds.slice(0, difficulty).reduce((total, p) => total + p, 0)
  return staSuccessOdds(preview.task, dice).reduce((total, p, successes) => {
    const set = setDifficulty(preview, successes)
    return set > 0 ? total + p * resistBelow(set + preview.resist.extra) : total
  }, 0)
}

// Momentum to the side that generated it: the party's to the group pool, an NPC's to Threat (Book p.265).
function gain(resources, side, amount) {
  if (!amount) return { resources, saved: 0, lost: 0, threat: 0 }
  if (side === 'player') return { ...saveMomentum(resources, amount), threat: 0 }
  return { resources: npcMomentumToThreat(resources, amount), saved: 0, lost: 0, threat: amount }
}

// The enemy's answer to a request it lost: Stress while it has any left (Book p.277: what it can't take overflows into a
// complication), else it surrenders.
function answerRequest(state, target, stress, lines) {
  const name = target.character.name
  if (remainingStress(target.character, target.condition) <= 0) {
    lines.push(`${name} has no Stress left to resist with and surrenders.`)
    return { state: updateCombatant(state, target.id, { surrendered: true }), outcome: 'surrendered' }
  }
  const suffered = sufferStress(target.character, target.condition, stress, { source: 'Resisting a request' })
  let next = updateCombatant(state, target.id, { condition: suffered.condition })
  lines.push(`${name} refuses, suffering ${suffered.taken} Stress (${suffered.condition.stress} of ${suffered.condition.stress + remainingStress(target.character, suffered.condition)}).`)
  if (suffered.complication) lines.push(`${name} suffers a complication: ${suffered.complication.name} (${suffered.overflow} Stress over the maximum, Book p.277).`)
  if (suffered.becameFatigued) {
    lines.push(`${name} is Fatigued: +1 Difficulty on all tasks, no more Stress, and one attribute shut down (Book p.278).`)
    next = startFatigueChoice(next, target.id, lines)
  }
  return { state: next, outcome: 'stress', stress: suffered.taken }
}

// The Persuade / Intimidate roll. Returns { state, passed, lines } or null when the dice purchase isn't valid.
function rollSocial(state, actor, preview, requestedPurchase) {
  const { kind } = preview
  const purchase = checkDicePurchase(state.resources, requestedPurchase, actor.side)
  if (!purchase.valid) return null
  const { random, next: afterDraw } = takeRandom(state)
  const target = state.combatants[preview.targetId]
  const name = target.character.name
  const assist = preview.assist && { helperId: preview.assist.helperId, task: preview.assist.task, via: preview.assist.via, die: null }
  const askerDice = rollDice(random, purchase.dice)
  if (assist) assist.die = rollDice(random, 1)[0]
  const asked = resolveStaTask({
    leader: { task: preview.task, dice: askerDice },
    assist: assist && { task: assist.task, die: assist.die },
    difficulty: 0,
    ignoreComplications: preview.prepared.ignoreComplications,
  })
  const set = setDifficulty(preview, asked.successes)
  const difficulty = set + preview.resist.extra
  // No successes to set a Difficulty: nothing was asked that needs resisting.
  const resisted = set > 0 ? resolveStaTask({ leader: { task: preview.resist.task, dice: rollDice(random) }, difficulty }) : null
  const passed = Boolean(resisted) && !resisted.success
  // Book p.256: the side that set the Difficulty generates 1 Momentum per success the other side fell short.
  const askerGain = gain(payForDice(state.resources, purchase), actor.side, passed ? difficulty - resisted.successes : 0)
  const resisterGain = gain(askerGain.resources, target.side, resisted?.success ? resisted.momentumGenerated : 0)
  let next = withoutUsedAssist(spendTurnAction({ ...afterDraw, resources: resisterGain.resources }, actor.id, kind), actor.id, preview.assist)
  const momentum = passed ? difficulty - resisted.successes : 0
  next = withStats(next, (stats) => {
    stats.tasks[kind] += 1
    if (passed) stats.tasks.passed += 1
    if (actor.side === 'player') stats.momentum.generated += momentum
    stats.momentum.saved += askerGain.saved + resisterGain.saved
    stats.momentum.lost += askerGain.lost + resisterGain.lost
    stats.momentum.spentDice += purchase.momentum
    stats.threat.fromDice += purchase.threatAdded
    stats.threat.spentByNpcs += purchase.threatSpent
    stats.threat.fromNpcMomentum += askerGain.threat + resisterGain.threat
  })

  const lines = [
    `${preview.label} (${ACTION_TYPE_NAMES[actionTypeOf(kind)]} action; ${actionsLeftText(next.turn)})`,
    `Asks ${name} to surrender: ${taskText(preview.task)}`,
    `Focus: ${focusText(preview.task)}`,
    ...(purchase.bonusDice ? [purchaseLine(purchase)] : []),
    `Rolls: ${diceText(asked.dice)}`,
    ...(assist && asked.assist ? [`Assist die: ${asked.assist.value} = ${asked.assist.successes}${asked.assist.counted ? '' : ' (does not count)'}`] : []),
    `Successes: ${asked.successes}${preview.penalty ? ` less ${preview.penalty} (${preview.prepared.difficultyLines.map((line) => line.label).join(', ')}; Book p.256)` : ''}: Difficulty set ${set}`,
  ]
  let outcome = 'unanswered'
  let stress = 0
  if (!resisted) {
    lines.push(`RESULT: no successes; ${name} ignores the request.`)
  } else {
    lines.push(
      `${name} resists: ${taskText(preview.resist.task)}, Difficulty ${difficulty}${preview.resist.extra ? ` (${preview.resist.prepared.difficultyLines.map((line) => `${line.label} +${line.change}`).join(', ')})` : ''}`,
      `${name} rolls: ${diceText(resisted.dice)} = ${resisted.successes} ${resisted.successes === 1 ? 'success' : 'successes'}`,
    )
    if (!passed) {
      outcome = 'resisted'
      lines.push(`RESULT: ${name} wins and refuses${resisterGain.threat ? ` (+${resisterGain.threat} Threat)` : ''}.`)
    } else {
      lines.push(`RESULT: ${actor.character.name} wins.`)
      if (actor.side === 'player') lines.push(momentumLine(momentum, askerGain, askerGain.resources))
      if (kind === 'intimidate') {
        next = updateCombatant(next, target.id, { intimidated: true })
        lines.push(`${name} is Intimidated: +${SOCIAL.intimidatedDifficulty} Difficulty to resist from now on.`)
      }
      const answered = answerRequest(next, next.combatants[target.id], asked.successes, lines)
      next = answered.state
      outcome = answered.outcome
      stress = answered.stress ?? 0
    }
  }
  const complications = asked.complications + (resisted?.complications ?? 0)
  if (complications) lines.push(`Complications: ${complications}`)

  const resultAssist = assist && asked.assist && { ...assist, successes: asked.assist.successes, counted: asked.assist.counted }
  next = {
    ...next,
    result: {
      kind: 'task',
      key: state.log.length,
      taskKind: kind,
      label: preview.label,
      attackerId: actor.id,
      targetId: target.id,
      task: { ...preview.task, difficulty: 0 },
      opposition: null,
      social: {
        set,
        difficulty,
        resistTask: preview.resist.task,
        resistDice: resisted?.dice ?? [],
        resistSuccesses: resisted?.successes ?? 0,
        outcome,
        stress,
      },
      dice: asked.dice,
      assist: resultAssist,
      rerolls: [],
      successes: asked.successes,
      passed,
      momentumGenerated: actor.side === 'player' ? momentum : 0,
      momentumSaved: askerGain.saved,
      momentumUnsaved: askerGain.lost,
      threatAdded: askerGain.threat + resisterGain.threat,
      complications,
      taskResult: asked,
      closed: false,
    },
  }
  return { state: next, passed, lines }
}

// The reducer's Persuade / Intimidate action: { type: 'persuade' | 'intimidate', targetId, purchase }.
export function socialStep(state, actor, action) {
  const preview = previewSocial(state, actor.id, action.targetId, action.type)
  if (!preview.available) return state
  const decided = recordDecision(state, actor, action)
  const rolled = rollSocial(decided.state, actor, preview, action.purchase)
  if (!rolled) return state
  const next = markAction(rolled.state, action.type, actor.id, { targetId: preview.targetId, passed: rolled.passed })
  return withOutcome(addLog(next, [...decided.lines, ...rolled.lines]))
}
