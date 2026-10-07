// The predefined combat tasks besides attacking (Book p.288): Guard, First Aid and Direct. Each has a preview (what the
// Task panel shows, and exactly what the roll uses) and they share one roll, rollCombatTask, which the reducer calls.
import { findAuthority } from '../rules/authority.js'
import { canCommunicate } from '../rules/communication.js'
import { checkDicePurchase, npcMomentumToThreat, payForDice, saveMomentum } from '../rules/missionResources.js'
import { injuryTypeName } from '../rules/personalCondition.js'
import { prepareTask } from '../rules/taskPreparation.js'
import { resolveStaTask, rollDice } from '../rules/taskResolver.js'
import { getAssistFor, taskContext, withoutUsedAssist } from './combatAttacks.js'
import { assistLine, diceText, focusText, momentumLine, purchaseLine, takeRandom, taskText, withStats } from './combatLog.js'
import { canAfford, getCombatantList, isActive, secondMajorLines } from './combatSelectors.js'
import { tileDistance } from './rangeSystem.js'
import { ACTION_TYPE_NAMES, actionsLeftText, actionTypeOf, COMBAT_TASKS, majorsTaken, MAX_MAJORS_PER_ROUND, spendTurnAction } from './turnActions.js'

const withinReach = (a, b) => tileDistance(a.position, b.position) <= 1

// Guard: yourself, or an ally within Reach.
export const getGuardTargets = (state, actor) =>
  getCombatantList(state).filter((other) => other.side === actor.side && isActive(other) && (other.id === actor.id || withinReach(actor, other)))

// Everything the Task panel shows before rolling a predefined task, and exactly what the roll uses:
// { available, reason, kind, actorId, targetId, label, prepared, task (with the final Difficulty), assist }.
function previewCombatTask(state, actor, { kind, label, target, spec, context = {}, block = null }) {
  const extraLines = actionTypeOf(kind) === 'major' ? secondMajorLines(state, actor.id) : []
  const prepared = prepareTask(actor.character, spec, taskContext(state, actor, { ...context, extraLines }))
  const task = { ...prepared.task, difficulty: prepared.difficulty }
  const assist = getAssistFor(state, actor.id, { spec })
  const reason = block ?? (!canAfford(state, actor, kind) ? `No ${ACTION_TYPE_NAMES[actionTypeOf(kind)]} action left.` : !prepared.possible ? prepared.blockers.join('; ') : null)
  return { available: !reason, reason, kind, label, actorId: actor.id, targetId: target?.id ?? null, prepared, task, assist }
}

export function previewGuard(state, actorId, targetId) {
  const actor = state.combatants[actorId]
  const target = state.combatants[targetId ?? actorId]
  const ally = target && target.id !== actor.id
  const spec = COMBAT_TASKS.guard
  const block = !target || target.side !== actor.side || !isActive(target) ? 'Guard yourself or an ally.' : ally && !withinReach(actor, target) ? `${target.character.name} is not within Reach.` : null
  return previewCombatTask(state, actor, {
    kind: 'guard',
    label: ally ? `Guard ${target.character.name}` : 'Guard',
    target,
    spec,
    // Book p.288: guarding an ally instead of yourself increases the Difficulty by 1.
    context: ally ? { difficultyMod: spec.allyDifficulty, difficultyModLabel: 'Guarding an ally' } : {},
    block,
  })
}

// First Aid on an ally within Reach (Book p.288, p.292): revive a Defeated ally (Difficulty 2), or treat one untreated
// Injury (Difficulty = its severity). [{ target, mode: 'revive' | 'treat:<injury id>', injury?, difficulty, label }]
export function getFirstAidOptions(state, actor) {
  return getCombatantList(state)
    .filter((other) => other.side === actor.side && other.id !== actor.id && withinReach(actor, other))
    .flatMap((other) => [
      ...(!isActive(other) ? [{ target: other, mode: 'revive', difficulty: COMBAT_TASKS.firstAidRevive.difficulty, label: `Revive ${other.character.name}` }] : []),
      ...other.condition.injuries
        .filter((injury) => !injury.treated)
        .map((injury) => ({
          target: other,
          mode: `treat:${injury.id}`,
          injury,
          difficulty: injury.severity,
          label: `Treat ${other.character.name}'s ${injuryTypeName(injury.type)} Injury (Severity ${injury.severity})`,
        })),
    ])
}

export function previewFirstAid(state, actorId, targetId, mode) {
  const actor = state.combatants[actorId]
  const target = state.combatants[targetId]
  const option = target && getFirstAidOptions(state, actor).find((entry) => entry.target.id === target.id && entry.mode === mode)
  const spec = option?.injury ? { ...COMBAT_TASKS.firstAidTreat, difficulty: option.injury.severity } : COMBAT_TASKS.firstAidRevive
  const block = !option ? 'No one within Reach needs this.' : null
  return previewCombatTask(state, actor, { kind: 'firstAid', label: option?.label ?? 'First Aid', target, spec, block })
}

// The character in authority on a side (rules/authority.js), from those able to act, in pick order (party members are
// stored first, in the order they were picked).
export function getAuthority(state, side) {
  const candidates = Object.values(state.combatants).filter((combatant) => combatant.side === side && isActive(combatant))
  return findAuthority(candidates, state.nominatedLeaders?.[side] ?? null)
}

// Why this ally can't be directed now (null = they can). Book p.288: an ally who can hear the commander
// (rules/communication.js: in earshot or by communicator), and Direct never gives anyone a third major action in a
// round. Prototype: once per round per ally.
export function directTargetBlock(state, actor, ally) {
  if (!ally || ally.side !== actor.side || ally.id === actor.id || !isActive(ally)) return 'Not an ally able to act.'
  if (state.directedThisRound.includes(ally.id)) return `${ally.character.name} was already directed this round.`
  if (majorsTaken(state, ally.id) >= MAX_MAJORS_PER_ROUND) return `${ally.character.name} already took ${MAX_MAJORS_PER_ROUND} major actions this round.`
  return canCommunicate(actor, ally, state.comms).reason
}

export const getDirectableAllies = (state, actor) => getCombatantList(state).filter((ally) => !directTargetBlock(state, actor, ally))

// Why this combatant can't Direct right now (null = they can).
export function directBlock(state, actor) {
  if (state.directed) return 'Already directing an ally.'
  const authority = getAuthority(state, actor.side)
  if (authority?.id !== actor.id) return `Only the character in authority may Direct${authority ? ` (${state.combatants[authority.id].character.name}: ${authority.reason})` : ''}.`
  if (!canAfford(state, actor, 'direct')) return 'No Major action left.'
  if (majorsTaken(state, actor.id) >= MAX_MAJORS_PER_ROUND) return `Already ${MAX_MAJORS_PER_ROUND} major actions this round.`
  if (state.resources.momentum < 1) return 'Direct costs 1 Momentum; the group pool is empty.'
  if (!getDirectableAllies(state, actor).length) return 'No ally who can hear you is left to direct this round.'
  return null
}

// The one roll every predefined combat task (Guard, First Aid) makes: the shared STA 2E task with dice bought before the
// roll (Book p.259), the assist die, the performer's structured effects, and Momentum to the group pool (party) or
// Threat (NPC, Book p.264). Spends the action, takes the used assist off the table, and records the result.
// Returns { state, passed, lines } or null when the purchase isn't valid.
export function rollCombatTask(state, actor, preview, requestedPurchase, taskKind) {
  const purchase = checkDicePurchase(state.resources, requestedPurchase, actor.side)
  if (!purchase.valid) return null
  const { random, next: afterDraw } = takeRandom(state)
  const { task, prepared } = preview
  const dice = rollDice(random, purchase.dice)
  const assist = preview.assist && { helperId: preview.assist.helperId, task: preview.assist.task, via: preview.assist.via, die: rollDice(random, 1)[0] }
  const evaluation = resolveStaTask({
    leader: { task, dice },
    assist: assist && { task: assist.task, die: assist.die },
    difficulty: task.difficulty,
    ignoreComplications: prepared.ignoreComplications,
    bonusMomentum: prepared.bonusMomentum,
  })
  const passed = evaluation.success
  const playerSide = actor.side === 'player'
  const paid = payForDice(state.resources, purchase)
  const saving = playerSide ? saveMomentum(paid, evaluation.momentumGenerated) : { resources: paid, saved: 0, lost: 0 }
  const npcThreat = playerSide ? 0 : evaluation.momentumGenerated
  const resources = npcMomentumToThreat(saving.resources, npcThreat)
  let next = withoutUsedAssist(spendTurnAction({ ...afterDraw, resources }, actor.id, taskKind), actor.id, preview.assist)
  next = withStats(next, (stats) => {
    stats.tasks[taskKind] += 1
    if (passed) stats.tasks.passed += 1
    if (playerSide) stats.momentum.generated += evaluation.momentumGenerated
    stats.momentum.saved += saving.saved
    stats.momentum.lost += saving.lost
    stats.momentum.spentDice += purchase.momentum
    stats.threat.fromDice += purchase.threatAdded
    stats.threat.spentByNpcs += purchase.threatSpent
    stats.threat.fromNpcMomentum += npcThreat
  })
  const resultAssist = assist && { ...assist, successes: evaluation.assist.successes, counted: evaluation.assist.counted }
  next = {
    ...next,
    result: {
      kind: 'task',
      key: state.log.length,
      taskKind,
      label: preview.label,
      attackerId: actor.id,
      targetId: preview.targetId,
      task,
      opposition: null,
      dice: evaluation.dice,
      assist: resultAssist,
      rerolls: [],
      successes: evaluation.successes,
      passed,
      momentumGenerated: evaluation.momentumGenerated,
      momentumSaved: saving.saved,
      momentumUnsaved: saving.lost,
      threatAdded: npcThreat,
      complications: evaluation.complications,
      taskResult: evaluation,
      closed: false,
    },
  }
  const lines = [
    `${preview.label} (${ACTION_TYPE_NAMES[actionTypeOf(taskKind)]} action; ${actionsLeftText(next.turn)})`,
    taskText(task),
    `Focus: ${focusText(task)}`,
    `Difficulty: ${task.difficulty} (${preview.prepared.difficultyLines.map((line) => `${line.label} ${line.change >= 0 ? '+' : ''}${line.change}`).join(', ')})`,
    ...(purchase.bonusDice ? [purchaseLine(purchase)] : []),
    `Rolls: ${diceText(evaluation.dice)}`,
    ...(resultAssist ? [assistLine(next, resultAssist), `Assist die: ${!resultAssist.successes ? 'no success' : resultAssist.counted ? `counts (+${resultAssist.successes})` : 'does not count (the leader scored no success)'}`] : []),
    `Successes: ${evaluation.successes} vs Difficulty ${task.difficulty}`,
    `RESULT: ${passed ? 'SUCCESS' : 'FAILURE'}`,
    playerSide ? momentumLine(evaluation.momentumGenerated, saving, resources) : `Momentum generated: ${evaluation.momentumGenerated}${npcThreat ? ` (NPC: added to Threat, now ${resources.threat})` : ''}`,
    ...(evaluation.complications ? [`Complications: ${evaluation.complications}`] : []),
  ]
  return { state: next, passed, lines }
}
