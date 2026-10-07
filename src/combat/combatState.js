// Combat state and its reducer. All combat rules run here (through the rule modules), never in React handlers.
// The reducer is pure and never reads the clock or Math.random: every roll comes from the combat's own seed plus a roll
// counter, so the same characters, encounter, seed and actions always replay the same fight (and it can run headless).
// Personal condition (Book p.276-277, p.290-292; rules/personalCondition.js): a successful attack inflicts an Injury of
// the weapon's severity (less Protection); the target may Avoid it by taking that much Stress, else suffers it and is
// Defeated. There are no Hits. The player decides Avoid Injury for party members (state.incomingInjury waits for it),
// and which attribute a newly Fatigued party member shuts down (state.pendingFatigue); AI-controlled combatants decide
// through combat/injuryPolicy.js. A failed attack is a miss.
// Every roll (attacks, assists, opposed rolls, the Ambush) is the shared STA 2E task (rules/taskPreparation.js +
// rules/taskResolver.js) on the combatants' own characters, the same one challenge objects use. Combat decides what a
// result means here: a Hit, and what happens to the mission's pools (state.resources, rules/missionResources.js; the
// same object exploration holds): a party task saves its Momentum to the group pool, an NPC's Momentum becomes Threat.
// Complications stay complications (Book p.263: they are not turned into Threat unless someone buys them off).
// Actions (Book p.288): each turn one major and one minor action (actions.json). Besides attacking: Guard, First Aid,
// Direct and Assist here, and challenge objects in the world (exploration/combatLink.js, the same objects and rules as
// in exploration), all through the same shared task.
//
// This file holds the reducer and re-exports the public surface of the modules it is built from, so callers import
// everything combat-state from here:
//   turnActions.js      the action economy (major / minor / free, the round's major-action limit)
//   combatSelectors.js  read-only questions: who acts, opponents, turn groups, what a combatant can afford
//   combatMovement.js   Move and Sprint: blocks, allowance, reachable tiles, paths
//   combatAttacks.js    attack previews, opposition, Aim, Assist / Direct dice, hit chance
//   combatTasks.js      Guard, First Aid, Direct previews and their shared roll
//   combatInjuries.js   inflicting, avoiding and suffering Injuries; Fatigue
//   combatAmbush.js     the party's one Ambush attempt
//   combatTurnOrder.js  turns, rounds, switching party members, settling a Direct, the outcome
//   combatSetup.js      createCombat and late arrivals
//   combatLog.js        shared state helpers and the log's wording
import { getAttributeName } from '../character/runtimeCharacter.js'
import { canCommunicate } from '../rules/communication.js'
import { addThreat, checkDicePurchase, npcMomentumToThreat, payForDice, saveMomentum, spendMomentum } from '../rules/missionResources.js'
import { chooseFatiguedAttribute, injuryText, needsFatigueAttribute, reviveCondition, treatInjury } from '../rules/personalCondition.js'
import { evaluateStaDie, rerollDie, rollDice } from '../rules/taskResolver.js'
import { ambushStep } from './combatAmbush.js'
import {
  aimRerollsFor,
  AIM_TEXT,
  assistTaskFor,
  attackDifficulty,
  canAimReroll,
  canAssist,
  difficultyBreakdown,
  evaluateAttack,
  previewAttack,
  rollOpposition,
  withoutUsedAssist,
} from './combatAttacks.js'
import { affordAddedSeverity, inflictInjury, injuryFor, resolveInjury } from './combatInjuries.js'
import { addLog, assistLine, diceText, focusText, formatPosition, markAction, momentumLine, oppositionName, purchaseLine, recordDecision, takeRandom, taskText, updateCombatant, withStats } from './combatLog.js'
import { canMove, canSprint, getPathTo } from './combatMovement.js'
import { canAfford, canAim, extraMinorBlock, facingToward, getActiveCombatant, getTurnGroup, isActive, isTurnFinished, secondMajorBlock } from './combatSelectors.js'
import { createCombat } from './combatSetup.js'
import { directBlock, getAuthority, getDirectableAllies, previewFirstAid, previewGuard, rollCombatTask } from './combatTasks.js'
import { advanceTurn, settleDirected, switchToMember, withOutcome } from './combatTurnOrder.js'
import { canTakeCover } from './coverSystem.js'
import { ACTION_TYPE_NAMES, actionsLeftText, actionTypeOf, ADAPTATION_MOMENTUM_SPENDS, EXTRA_ACTIONS, freshTurn, spendTurnAction } from './turnActions.js'
import { getInjuryMode, getWeapon } from './weaponSystem.js'

export { ACTIONS_PER_TURN, ACTION_TYPE_NAMES, ADAPTATION_MOMENTUM_SPENDS, COMBAT_TASKS, EXTRA_ACTIONS, MAX_MAJORS_PER_ROUND, actionTypeOf, actionsLeft, actionsLeftText, majorsTaken } from './turnActions.js'
export {
  awaitingDecision,
  canAct,
  canAfford,
  canAim,
  extraMinorBlock,
  getActiveCombatant,
  getCombatantList,
  getFacing,
  getOpponents,
  getTurnGroup,
  getTurnGroupRange,
  getTurnOf,
  isActive,
  isTurnFinished,
  knowsAbout,
  secondMajorBlock,
  secondMajorLines,
  statusText,
} from './combatSelectors.js'
export { canMove, canSprint, getBlockers, getMovementBlock, getMovementLeft, getPathTo, getReachable } from './combatMovement.js'
export {
  AIM_TEXT,
  aimRerollsFor,
  attackDifficulty,
  canAimReroll,
  canAssist,
  evaluateAttack,
  getAssistFor,
  getAssistableAllies,
  getAttackTask,
  getHitChance,
  hasTargetInRange,
  isAccurate,
  previewAttack,
  rollAwaitsPlayer,
} from './combatAttacks.js'
export { directBlock, directTargetBlock, getAuthority, getDirectableAllies, getFirstAidOptions, getGuardTargets, previewFirstAid, previewGuard } from './combatTasks.js'
export { injuryFor, previewInjuries } from './combatInjuries.js'
export { AMBUSH_DIFFICULTY, AMBUSH_FOCUSES, canAmbush, getAmbushTargets, getAmbusher, previewAmbush } from './combatAmbush.js'
export { settleDirected } from './combatTurnOrder.js'
export { addCombatant, createCombat } from './combatSetup.js'

// A challenge object's task or routine action taken in combat (exploration/combatLink.js runs the object's own rules
// through challengeObjects.js; this records what it means for the fight). interaction: { actorId, cost ('major' |
// 'minor' | 'free'), resources (the mission pools after the attempt), label, passed (null = no roll), task, dice,
// successes, complications, momentumGenerated, momentumSaved, assistUsed, lines }.
export function canInteract(state, actorId, cost) {
  const actor = state.combatants[actorId]
  return Boolean(actor) && canAfford(state, actor, cost)
}

export function applyInteraction(state, interaction) {
  const actor = state.combatants[interaction.actorId]
  if (!canInteract(state, actor.id, interaction.cost)) return state
  let next = spendTurnAction({ ...state, resources: interaction.resources }, actor.id, interaction.cost)
  if (interaction.assistUsed) next = withoutUsedAssist(next, actor.id, { via: 'assist' })
  next = withStats(next, (stats) => {
    stats.tasks.interact += 1
    if (interaction.passed) stats.tasks.passed += 1
    stats.momentum.generated += interaction.momentumGenerated ?? 0
    stats.momentum.saved += interaction.momentumSaved ?? 0
  })
  if (interaction.passed !== null) {
    next = {
      ...next,
      result: {
        kind: 'task',
        key: state.log.length,
        taskKind: 'interact',
        label: interaction.label,
        attackerId: actor.id,
        targetId: null,
        task: interaction.task,
        opposition: null,
        dice: interaction.dice,
        assist: interaction.assist ?? null,
        rerolls: [],
        successes: interaction.successes,
        passed: interaction.passed,
        momentumGenerated: interaction.momentumGenerated ?? 0,
        momentumSaved: interaction.momentumSaved ?? 0,
        momentumUnsaved: 0,
        threatAdded: 0,
        complications: interaction.complications ?? 0,
        closed: false,
      },
    }
  }
  next = markAction(next, 'interact', actor.id, { passed: interaction.passed })
  next = addLog(next, [`${interaction.label} (${ACTION_TYPE_NAMES[actionTypeOf(interaction.cost)]} action; ${actionsLeftText(next.turn)})`, ...interaction.lines])
  return withOutcome(settleDirected(next))
}

// ---------- reducer ----------

export function combatReducer(state, action) {
  if (action.type === 'restart') return createCombat(action.options)
  if (!state || state.outcome) return state
  const next = settleDirected(reduceAction(state, action))
  // Any attack, by either side, spots the party and ends the ambush chance.
  if (next !== state && next.ambush === null && action.type === 'attack') return { ...next, ambush: { passed: true } }
  return next
}

function reduceAction(state, action) {
  const actor = getActiveCombatant(state)
  // An incoming Injury waits for its Avoid Injury decision, and a new Fatigue for its attribute, before anything else.
  if (state.incomingInjury && action.type !== 'injuryDecision') return state
  if (state.pendingFatigue && action.type !== 'chooseFatigueAttribute') return state

  switch (action.type) {
    // Book p.277: the player selects the attribute a newly Fatigued party member shuts down (action.attribute), or
    // autocombat's policy does (action.reason).
    case 'chooseFatigueAttribute': {
      const pending = state.pendingFatigue
      const combatant = pending && state.combatants[pending.combatantId]
      if (!combatant || !needsFatigueAttribute(combatant.condition)) return state
      const condition = chooseFatiguedAttribute(combatant.condition, action.attribute)
      if (condition === combatant.condition) return state
      const next = updateCombatant({ ...state, pendingFatigue: null }, combatant.id, { condition })
      return addLog(next, [
        ...(action.reason ? [`AI Decision: shut down ${getAttributeName(action.attribute)}`, `Reason: ${action.reason}`] : []),
        `${combatant.character.name} is Fatigued: ${getAttributeName(action.attribute)} is shut down (its tasks automatically fail).`,
      ])
    }
    // Book p.292 Avoid Injury: the player's decision for a party member (action.avoid), or autocombat's (action.reason).
    case 'injuryDecision': {
      const incoming = state.incomingInjury
      if (!incoming) return state
      const target = state.combatants[incoming.targetId]
      const resolved = resolveInjury(state, incoming, Boolean(action.avoid))
      let next = markAction(resolved.state, 'injury', incoming.attackerId, { targetId: target.id, avoided: resolved.avoided, removed: !isActive(resolved.state.combatants[target.id]) })
      if (next.result?.injury && next.result.targetId === target.id) next = { ...next, result: { ...next.result, injury: { ...next.result.injury, decided: resolved.avoided ? 'avoided' : 'suffered' } } }
      next = addLog(next, [
        ...(action.reason ? [`AI Decision: ${resolved.avoided ? 'Avoid Injury' : 'Accept Injury'}`, `Reason: ${action.reason}`] : []),
        `${target.character.name} ${resolved.avoided ? 'chooses to Avoid Injury' : 'accepts the Injury'}.`,
        ...resolved.lines,
      ])
      return withOutcome(next)
    }
    // Book p.260: 1 Momentum, one more minor action this turn (once per turn).
    case 'buyExtraMinor': {
      if (extraMinorBlock(state, actor)) return state
      const resources = spendMomentum(state.resources, EXTRA_ACTIONS.extraMinorCost)
      const turn = { ...state.turn, minor: state.turn.minor + 1, extraMinor: true }
      const next = withStats({ ...state, resources, turn }, (stats) => {
        stats.tasks.extraMinor += 1
        stats.momentum.spentExtraActions = (stats.momentum.spentExtraActions ?? 0) + EXTRA_ACTIONS.extraMinorCost
      })
      return addLog(markAction(next, 'extraMinor', actor.id), [
        `Momentum spent: ${EXTRA_ACTIONS.extraMinorCost} for an extra minor action (group pool now ${resources.momentum}; ${actionsLeftText(turn)})`,
      ])
    }
    // Book p.288: 2 Momentum, a second major action this turn; its task is +1 Difficulty.
    case 'buySecondMajor': {
      if (secondMajorBlock(state, actor)) return state
      const resources = spendMomentum(state.resources, EXTRA_ACTIONS.secondMajorCost)
      const turn = { ...state.turn, major: state.turn.major + 1, secondMajor: true }
      const next = withStats({ ...state, resources, turn }, (stats) => {
        stats.tasks.secondMajor += 1
        stats.momentum.spentExtraActions = (stats.momentum.spentExtraActions ?? 0) + EXTRA_ACTIONS.secondMajorCost
      })
      return addLog(markAction(next, 'secondMajor', actor.id), [
        `Momentum spent: ${EXTRA_ACTIONS.secondMajorCost} for a second major action (group pool now ${resources.momentum}; ${actionsLeftText(turn)}). Its task is +${EXTRA_ACTIONS.secondMajorDifficulty} Difficulty.`,
      ])
    }
    case 'ambush':
      return ambushStep(state, action)
    case 'move':
    case 'sprint': {
      const kind = action.type
      if (kind === 'move' ? !canMove(state, actor) : !canSprint(state, actor)) return state
      const path = getPathTo(state, actor, action.destination, kind)
      if (!path || path.length < 2) return state
      const destination = path[path.length - 1]
      const steps = path.length - 1
      const decided = recordDecision(state, actor, action, { path })
      const inCover = canTakeCover(state.map, destination)
      const moved = updateCombatant(decided.state, actor.id, { position: destination, inCover, facing: facingToward(path[path.length - 2], destination) })
      const used = spendTurnAction(moved, actor.id, kind)
      const turn = { ...used.turn, ...(kind === 'move' ? { moved: true } : { sprinted: true }) }
      const next = { ...used, turn, lastMove: { key: state.log.length, combatantId: actor.id, path } }
      return addLog(markAction(next, kind, actor.id, { inCover }), [
        ...decided.lines,
        `${kind === 'move' ? 'Move' : 'Sprint'} ${steps} ${steps === 1 ? 'tile' : 'tiles'} (${actionsLeftText(turn)})`,
        `Path: ${path.map(formatPosition).join(' > ')}`,
        ...(inCover ? [`${actor.character.name} is in cover (next to a cover object).`] : actor.inCover ? [`${actor.character.name} leaves cover.`] : []),
      ])
    }
    case 'aim': {
      if (!canAim(state, actor)) return state
      const decided = recordDecision(state, actor, action)
      const used = spendTurnAction(decided.state, actor.id, 'aim')
      const turn = { ...used.turn, aimReroll: true, aimed: true }
      return addLog(markAction({ ...used, turn }, 'aim', actor.id), [
        ...decided.lines,
        `Aim: ${AIM_TEXT} (${actionsLeftText(turn)})`,
      ])
    }
    case 'assist': {
      const ally = state.combatants[action.allyId]
      if (!canAfford(state, actor, 'assist') || !canAssist(state, actor, ally)) return state
      const decided = recordDecision(state, actor, action)
      const used = spendTurnAction(decided.state, actor.id, 'assist')
      const { turn } = used
      const next = { ...used, assists: { ...state.assists, [ally.id]: actor.id } }
      return addLog(markAction(next, 'assist', actor.id, { allyId: ally.id }), [
        ...decided.lines,
        `Assist: ${ally.character.name}'s next task this round adds ${actor.character.name}'s 1d20 (${actionsLeftText(turn)})`,
      ])
    }
    case 'attack': {
      if (!canAfford(state, actor, 'attack')) return state
      const preview = previewAttack(state, actor.id, action.targetId, action.weaponId)
      if (!preview.available || !preview.weapon.injuryModes.includes(action.injuryMode)) return state
      // Buy d20s (Book p.259): action.purchase = { bonusDice, momentum }; the party pays from the group pool and/or adds
      // Threat, an NPC spends Threat (hook: the AI doesn't buy dice yet).
      const purchase = checkDicePurchase(state.resources, action.purchase, actor.side)
      if (!purchase.valid) return state
      const decided = recordDecision(state, actor, action)
      const { random, next: afterDraw } = takeRandom(decided.state)
      const target = state.combatants[action.targetId]
      const opposition = preview.opposition ? rollOpposition(preview.opposition, random) : null
      const difficulty = attackDifficulty(preview, opposition?.successes)
      const pending = {
        attackerId: actor.id,
        targetId: target.id,
        weaponId: preview.weapon.id,
        injuryMode: action.injuryMode,
        band: preview.band,
        distance: preview.distance,
        baseDifficulty: preview.baseDifficulty,
        rangeModifier: preview.rangeModifier,
        guardModifier: preview.guardModifier,
        extraLines: preview.extraLines,
        traitLines: preview.traitLines,
        opposition,
        task: { ...preview.task, difficulty },
        dice: rollDice(random, purchase.dice),
        purchase,
        rerolls: [],
        aimRerolls: state.turn.aimReroll ? aimRerollsFor(preview.weapon) : 0,
        assist: null,
      }
      // The helper (an Assist, or the commander on a Direct) rolls after the attacker, against their own Target Number.
      const assistFor = assistTaskFor(state, actor.id, preview.weapon)
      if (assistFor) {
        const [die] = rollDice(random, 1)
        pending.assist = { helperId: assistFor.helperId, task: assistFor.task, via: assistFor.via, die }
      }
      const used = spendTurnAction(withoutUsedAssist(updateCombatant(afterDraw, actor.id, { facing: facingToward(actor.position, target.position) }), actor.id, assistFor), actor.id, 'attack')
      let next = {
        ...used,
        resources: payForDice(state.resources, purchase),
        turn: { ...used.turn, aimReroll: false, attacks: state.turn.attacks + 1 },
        pending,
        result: null,
      }
      next = withStats(next, (stats) => {
        stats.attacks += 1
        stats.byCombatant[actor.id].attacks += 1
        stats.byCombatant[actor.id].lastAttackRound = state.round
        stats.momentum.spentDice += purchase.momentum
        stats.threat.fromDice += purchase.threatAdded
        stats.threat.spentByNpcs += purchase.threatSpent
      })
      const { task } = pending
      next = markAction(next, 'attack', actor.id, { targetId: target.id, weaponId: preview.weapon.id, injuryMode: action.injuryMode })
      return addLog(next, [
        ...decided.lines,
        `Attack (${actionsLeftText(next.turn)})`,
        `${actor.character.name} attacks ${target.character.name} with ${preview.weapon.name} (${getInjuryMode(action.injuryMode).name})`,
        `Range: ${preview.band.name} (${preview.distance} tiles)`,
        taskText(task),
        `Focus: ${focusText(task)}`,
        ...(pending.aimRerolls ? [`Aim: may reroll ${pending.aimRerolls === 1 ? 'one die' : `up to ${pending.aimRerolls} dice (Accurate)`}`] : []),
        ...(purchase.bonusDice ? [purchaseLine(purchase)] : []),
        opposition
          ? `${oppositionName(opposition)}: ${taskText(opposition.task)}, focus ${focusText(opposition.task)}, rolls ${diceText(opposition.dice)}: ${opposition.successes} ${opposition.successes === 1 ? 'success' : 'successes'}`
          : 'Opposed roll: No',
        `Difficulty: ${task.difficulty} (${difficultyBreakdown(pending)})`,
        `Rolls: ${diceText(pending.dice.map((value) => evaluateStaDie(task, value)))}`,
        ...(pending.assist ? [assistLine(next, pending.assist)] : []),
        ...(opposition?.complications ? [`Defender complications: ${opposition.complications}`] : []),
      ])
    }
    case 'reroll': {
      const { pending } = state
      if (!pending || action.dieIndex < 0 || action.dieIndex >= pending.dice.length) return state
      const attacker = state.combatants[pending.attackerId]
      if (action.source === 'aim' && !canAimReroll(pending, action.dieIndex)) return state
      // VIDEOGAME ADAPTATION (off unless actions.json turns it on): 1 Momentum from the group pool rerolls one die.
      if (action.source === 'momentum' && !ADAPTATION_MOMENTUM_SPENDS) return state
      const resources = action.source === 'momentum' ? attacker.side === 'player' && spendMomentum(state.resources, 1) : state.resources
      if (!resources) return state
      const decided = recordDecision(state, attacker, action)
      const { random, next: afterDraw } = takeRandom(decided.state)
      const dice = rerollDie(pending.dice, action.dieIndex, random)
      const reroll = { index: action.dieIndex, from: pending.dice[action.dieIndex], to: dice[action.dieIndex], source: action.source }
      let next = {
        ...afterDraw,
        resources,
        pending: { ...pending, dice, rerolls: [...pending.rerolls, reroll], aimRerolls: pending.aimRerolls - (action.source === 'aim' ? 1 : 0) },
      }
      if (action.source === 'momentum') next = withStats(next, (stats) => (stats.momentum.spentReroll += 1))
      return addLog(markAction(next, 'reroll', attacker.id, { source: action.source }), [
        ...decided.lines,
        `${action.source === 'aim' ? 'Aim' : 'Momentum spent:'} reroll die ${reroll.index + 1}: ${reroll.from} -> ${reroll.to}`,
        `Rolls: ${dice.join(', ')}`,
      ])
    }
    case 'resolveAttack': {
      const { pending } = state
      if (!pending) return state
      const attacker = state.combatants[pending.attackerId]
      const target = state.combatants[pending.targetId]
      const weapon = getWeapon(pending.weaponId)
      const evaluation = evaluateAttack(pending)
      const passed = evaluation.success
      const playerSide = attacker.side === 'player'
      // Book p.289: a Deadly attack by a player character is escalation (+1 Threat). Enemy Deadly attacks cost nothing yet.
      const deadlyThreat = playerSide && getInjuryMode(pending.injuryMode).generatesThreat ? 1 : 0
      // A party task saves its Momentum to the group pool; an NPC's Momentum becomes Threat (Book p.264). Complications
      // stay complications on the result.
      const saving = playerSide ? saveMomentum(state.resources, evaluation.momentumGenerated) : { resources: state.resources, saved: 0, lost: 0 }
      const npcThreat = playerSide ? 0 : evaluation.momentumGenerated
      let resources = addThreat(npcMomentumToThreat(saving.resources, npcThreat), deadlyThreat)
      // Hook: action.addedSeverity (Momentum for +severity, Book p.291); no UI or AI asks for it yet.
      const added = passed ? affordAddedSeverity(resources, weapon, action.addedSeverity, playerSide) : { added: 0, cost: 0 }
      if (added.cost) resources = spendMomentum(resources, added.cost)
      let next = { ...state, pending: null, resources }
      let injuryLines = []
      let injury = null
      if (passed) {
        injury = injuryFor(next, attacker, target, weapon, pending.injuryMode, added.added)
        const hit = inflictInjury(next, attacker.id, target.id, injury)
        next = hit.state
        injuryLines = hit.lines
      }
      const after = next.combatants[target.id]
      next = withStats(next, (stats) => {
        if (passed) {
          stats.attacksHit += 1
          stats.byCombatant[attacker.id].attacksHit += 1
        }
        if (added.cost) stats.momentum.spentSeverity = (stats.momentum.spentSeverity ?? 0) + added.cost
        if (playerSide) stats.momentum.generated += evaluation.momentumGenerated
        stats.momentum.saved += saving.saved
        stats.momentum.lost += saving.lost
        stats.threat.fromDeadly += deadlyThreat
        stats.threat.fromNpcMomentum += npcThreat
      })
      const { assist } = evaluation
      const momentumText = playerSide
        ? momentumLine(evaluation.momentumGenerated, saving, resources)
        : `Momentum generated: ${evaluation.momentumGenerated}${npcThreat ? ` (NPC: added to Threat, now ${resources.threat})` : ''}`
      const lines = [
        `Final rolls vs TN ${pending.task.targetNumber}: ${diceText(evaluation.dice)}`,
        ...(assist
          ? [`Assist die ${assist.value}: ${assist.counted ? `counts (+${assist.successes})` : assist.successes ? 'does not count (the attacker scored no success)' : 'no success'}`]
          : []),
        `Successes: ${evaluation.successes} vs Difficulty ${pending.task.difficulty}`,
        `RESULT: ${passed ? 'SUCCESS' : 'FAILURE'}`,
        ...(added.cost ? [`Momentum spent: ${added.cost} for +${added.added} severity`] : []),
        ...(passed ? [...injuryLines, momentumText] : []),
        ...(evaluation.complications ? [`Complications: ${evaluation.complications}`] : []),
        ...(deadlyThreat ? [`Threat +1 (Deadly attack), now ${resources.threat}`] : []),
      ]
      const awaiting = Boolean(next.incomingInjury)
      next = markAction(next, 'resolve', attacker.id, { targetId: target.id, weaponId: weapon.id, passed, removed: !isActive(after), injury, awaiting })
      next = addLog(next, lines)
      next = {
        ...next,
        result: {
          attackerId: attacker.id,
          targetId: target.id,
          weaponId: weapon.id,
          injuryMode: pending.injuryMode,
          task: pending.task,
          opposition: pending.opposition,
          dice: evaluation.dice,
          assist: pending.assist && { ...pending.assist, successes: assist.successes, counted: assist.counted },
          rerolls: pending.rerolls,
          successes: evaluation.successes,
          passed,
          momentumGenerated: evaluation.momentumGenerated,
          momentumSaved: saving.saved,
          // Over the pool's maximum: lost.
          momentumUnsaved: saving.lost,
          threatAdded: npcThreat + deadlyThreat,
          complications: evaluation.complications,
          taskResult: evaluation,
          // The Injury the hit inflicts; decided: 'pending' (waiting for Avoid Injury), 'avoided' or 'suffered'.
          injury: injury && { ...injury, decided: awaiting ? 'pending' : isActive(after) ? 'avoided' : 'suffered' },
          closed: false,
        },
      }
      return withOutcome(next)
    }
    // VIDEOGAME ADAPTATION (off unless actions.json turns it on; not a book spend): 1 Momentum removes 1 Threat.
    case 'cancelThreat': {
      if (!ADAPTATION_MOMENTUM_SPENDS) return state
      const resources = state.resources.threat > 0 && spendMomentum(state.resources, 1)
      if (!resources || state.pending) return state
      const decided = recordDecision(state, actor, action)
      const next = withStats({ ...decided.state, resources: { ...resources, threat: resources.threat - 1 } }, (stats) => {
        stats.momentum.spentCancelThreat += 1
        stats.threat.cancelled += 1
      })
      return addLog(markAction(next, 'cancelThreat', actor.id), [...decided.lines, `Momentum spent to cancel 1 Threat (Momentum ${next.resources.momentum}, Threat ${next.resources.threat}).`])
    }
    // Book p.288 Guard (major): Insight + Security, Difficulty 0 (+1 for an ally within Reach). Success: attacks against the
    // guarded character are +1 Difficulty until the start of their next turn. Prototype: always rolled (Book p.254 lets a
    // Difficulty 0 task skip the roll; rolling still generates Momentum, and keeps one flow for every task).
    case 'guard': {
      const preview = previewGuard(state, actor.id, action.targetId)
      if (!preview.available) return state
      const decided = recordDecision(state, actor, action)
      const rolled = rollCombatTask(decided.state, actor, preview, action.purchase, 'guard')
      if (!rolled) return state
      const target = state.combatants[preview.targetId]
      let next = rolled.state
      if (rolled.passed) next = updateCombatant(next, target.id, { guard: { byId: actor.id, round: state.round } })
      next = markAction(next, 'guard', actor.id, { targetId: target.id, passed: rolled.passed })
      return addLog(next, [
        ...decided.lines,
        ...rolled.lines,
        rolled.passed ? `${target.character.name} is guarded: attacks against them are +1 Difficulty until the start of their next turn.` : 'The Guard fails.',
      ])
    }
    // Book p.288 First Aid (major): Daring + Medicine on an adjacent ally. Difficulty 2 revives a Defeated character (the
    // Injury stays; a Stun Injury then wears off at the end of their next turn, Book p.292); Difficulty = an Injury's
    // severity treats that Injury (no penalty from it, but it is still an Injury). Revive and treat are separate actions.
    case 'firstAid': {
      const preview = previewFirstAid(state, actor.id, action.targetId, action.mode)
      if (!preview.available) return state
      const decided = recordDecision(state, actor, action)
      const rolled = rollCombatTask(decided.state, actor, preview, action.purchase, 'firstAid')
      if (!rolled) return state
      const target = state.combatants[preview.targetId]
      const name = target.character.name
      const injuryId = action.mode.startsWith('treat:') ? action.mode.slice('treat:'.length) : null
      let next = rolled.state
      let outcome = injuryId ? `${name}'s Injury is not treated.` : `${name} stays down.`
      if (rolled.passed && !injuryId) {
        const condition = reviveCondition(target.condition)
        next = updateCombatant(next, target.id, { condition, inCover: canTakeCover(next.map, target.position) })
        const still = condition.injuries.length ? ` Still injured: ${condition.injuries.map(injuryText).join('; ')}.` : ''
        outcome = `${name} is no longer Defeated.${still}`
      }
      if (rolled.passed && injuryId) {
        const condition = treatInjury(target.condition, injuryId)
        next = updateCombatant(next, target.id, { condition })
        outcome = `${name}'s ${injuryText(condition.injuries.find((injury) => injury.id === injuryId))}: no penalty from it now; it is still an Injury.`
      }
      next = markAction(next, 'firstAid', actor.id, { targetId: target.id, mode: action.mode, passed: rolled.passed })
      return addLog(next, [...decided.lines, ...rolled.lines, outcome])
    }
    // Book p.288 Direct (major): the character in authority spends 1 Momentum; an ally who can hear immediately takes a
    // major action, which the commander assists (Control + Command). No +1 Difficulty for that ally's second major action.
    case 'direct': {
      const ally = state.combatants[action.allyId]
      if (directBlock(state, actor) || !getDirectableAllies(state, actor).some((candidate) => candidate.id === ally?.id)) return state
      const resources = spendMomentum(state.resources, 1)
      const decided = recordDecision(state, actor, action)
      const used = spendTurnAction(decided.state, actor.id, 'direct')
      const commanderTurn = used.turn
      const via = canCommunicate(actor, ally, state.comms).via
      let next = {
        ...used,
        resources,
        directed: { commanderId: actor.id, allyId: ally.id, commanderTurn },
        // The ally's directed action counts toward their two major actions this round (spendTurnAction on their action).
        turn: { ...freshTurn(), major: 1, minor: 0 },
      }
      next = withStats(next, (stats) => {
        stats.tasks.direct += 1
        stats.momentum.spentDirect += 1
      })
      const authority = getAuthority(state, actor.side)
      return addLog(markAction(next, 'direct', actor.id, { allyId: ally.id }), [
        ...decided.lines,
        `Direct: ${actor.character.name} directs ${ally.character.name} (Major action; ${actionsLeftText(commanderTurn)})`,
        `Authority: ${authority.reason}`,
        `${ally.character.name} hears the order ${via === 'communicator' ? 'over the communicator' : 'in earshot'}.`,
        `Momentum spent: 1 (group pool now ${resources.momentum})`,
        `${ally.character.name} takes one Major action now; ${actor.character.name} assists with Control + Command.`,
      ])
    }
    case 'selectCombatant': {
      if (state.pending || state.directed || action.combatantId === actor.id) return state
      if (!getTurnGroup(state).includes(action.combatantId) || isTurnFinished(state, action.combatantId)) return state
      return switchToMember(state, action.combatantId)
    }
    case 'endTurn': {
      if (state.pending) return state
      // A directed ally passing gives up the directed action (the Momentum is spent); the commander's turn resumes.
      if (state.directed) return addLog({ ...state, turn: { ...state.turn, done: true } }, [`${actor.character.name} passes on the directed action.`])
      const decided = recordDecision(state, actor, action)
      const ended = addLog({ ...decided.state, turn: { ...state.turn, done: true } }, [...decided.lines, `${actor.character.name} ends their turn.`])
      // The rest of the group still to act, in initiative order; the next unfinished member takes over.
      const nextMember = getTurnGroup(ended).find((id) => !isTurnFinished(ended, id))
      return nextMember ? switchToMember(ended, nextMember) : advanceTurn(ended)
    }
    default:
      return state
  }
}
