import { addThreat, checkDicePurchase, npcMomentumToThreat, payForDice, savableMomentum, saveMomentum, spendMomentum } from '../../rules/missionResources.js'
import { evaluateStaDie, rerollDie, rollDice } from '../../rules/taskResolver.js'
import {
  aimRerollsFor,
  assistTaskFor,
  attackDifficulty,
  canAimReroll,
  canAssistReroll,
  difficultyBreakdown,
  evaluateAttack,
  previewAttack,
  rollOpposition,
  withoutUsedAssist,
} from '../combatAttacks.js'
import { defenderWins } from '../combatCounterattack.js'
import { affordAddedSeverity, inflictInjury, injuryFor } from '../combatInjuries.js'
import { knockdownAfterHit, unarmedVariantFor } from '../combatUnarmed.js'
import { addLog, assistLine, bonusMomentumLine, diceText, focusText, markAction, momentumLine, oppositionName, purchaseLine, recordDecision, takeRandom, taskText, updateCombatant, withStats } from '../combatLog.js'
import { canAfford, facingToward, isActive } from '../combatSelectors.js'
import { withOutcome } from '../combatTurnOrder.js'
import { actionsLeftText, ADAPTATION_MOMENTUM_SPENDS, spendTurnAction } from '../turnActions.js'
import { getCombatantWeapon, getInjuryMode } from '../weaponSystem.js'
import { CombatAction } from './CombatAction.js'

// An attack is three reducer steps around state.pending: 'attack' rolls (the attacker's dice, the opposed roll, the
// helper's die) and waits; 'reroll' changes one die (Aim, a talent, or the adaptation's Momentum spend); 'resolveAttack'
// counts the successes, inflicts the Injury and settles Momentum and Threat. Each step validates itself and returns the
// same state when it isn't allowed.

// Attack (major): { targetId, weaponId, injuryMode, purchase }.
export class AttackAction extends CombatAction {
  constructor() {
    super('attack')
  }

  unavailableReason(state, actor, { targetId, weaponId, injuryMode }) {
    if (!canAfford(state, actor, 'attack')) return 'No Major action left.'
    const preview = previewAttack(state, actor.id, targetId, weaponId)
    if (!preview.available) return preview.reason ?? 'No shot.'
    return preview.weapon.injuryModes.includes(injuryMode) ? null : 'The weapon has no such setting.'
  }

  reduce(state, actor, action) {
    return actor ? this.apply(state, actor, action) : state
  }

  apply(state, actor, action) {
    if (!canAfford(state, actor, 'attack')) return state
    const preview = previewAttack(state, actor.id, action.targetId, action.weaponId)
    if (!preview.available || !preview.weapon.injuryModes.includes(action.injuryMode)) return state
    // Buy d20s (Book pp.255, 260): action.purchase = { bonusDice, momentum }; the party pays from the group pool and/or adds
    // Threat, an NPC spends Threat.
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
      // Kick (combatUnarmed.js): the unarmed attack the ring offered, which adds its knockdown on a hit. Absent otherwise.
      ...(unarmedVariantFor(action) ? { variant: action.variant } : {}),
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
      assistRerolls: 0,
      assist: null,
      // Talents (combatTalents.js): Steady Hands needs the Aim; Ambush Tactics, a target unaware as the shot is taken
      // (the attack reveals the attacker before it resolves).
      aimed: state.turn.aimReroll,
      targetUnaware: preview.targetUnaware,
      ignoreComplications: preview.ignoreComplications,
      bonusMomentum: preview.bonusMomentum,
    }
    // The helper (an Assist, or the commander on a Direct) rolls after the attacker, against their own Target Number.
    const assistFor = assistTaskFor(state, actor.id, preview.weapon)
    if (assistFor) {
      const [die] = rollDice(random, 1)
      pending.assist = { helperId: assistFor.helperId, task: assistFor.task, via: assistFor.via, die, talentNotes: assistFor.talents?.notes ?? [] }
      pending.bonusMomentum += assistFor.talents?.bonusMomentum ?? 0
      pending.assistRerolls = assistFor.talents?.rerolls ?? 0
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
      ...(pending.assist?.talentNotes.length ? [`Assist talents: ${pending.assist.talentNotes.join('; ')}`] : []),
      ...(opposition?.complications ? [`Defender complications: ${opposition.complications}`] : []),
    ])
  }
}

export class RerollAction extends CombatAction {
  constructor() {
    super('reroll')
  }

  unavailableReason(state) {
    return state.pending ? null : 'No roll to change.'
  }

  reduce(state, actor, action) {
    return this.apply(state, actor, action)
  }

  apply(state, actor, action) {
    const { pending } = state
    if (!pending || action.dieIndex < 0 || action.dieIndex >= pending.dice.length) return state
    const attacker = state.combatants[pending.attackerId]
    if (action.source === 'aim' && !canAimReroll(pending, action.dieIndex)) return state
    if (action.source === 'assist' && !canAssistReroll(pending)) return state
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
      pending: {
        ...pending,
        dice,
        rerolls: [...pending.rerolls, reroll],
        aimRerolls: pending.aimRerolls - (action.source === 'aim' ? 1 : 0),
        assistRerolls: (pending.assistRerolls ?? 0) - (action.source === 'assist' ? 1 : 0),
      },
    }
    if (action.source === 'momentum') next = withStats(next, (stats) => (stats.momentum.spentReroll += 1))
    const sourceText = { aim: 'Aim', assist: 'Student of War', momentum: 'Momentum spent:' }[action.source]
    return addLog(markAction(next, 'reroll', attacker.id, { source: action.source }), [
      ...decided.lines,
      `${sourceText} reroll die ${reroll.index + 1}: ${reroll.from} -> ${reroll.to}`,
      `Rolls: ${dice.join(', ')}`,
    ])
  }
}

export class ResolveAttackAction extends CombatAction {
  constructor() {
    super('resolveAttack')
  }

  unavailableReason(state) {
    return state.pending ? null : 'No roll to resolve.'
  }

  reduce(state, actor, action) {
    return this.apply(state, actor, action)
  }

  apply(state, actor, action) {
    const { pending } = state
    if (!pending) return state
    const attacker = state.combatants[pending.attackerId]
    const target = state.combatants[pending.targetId]
    const weapon = getCombatantWeapon(attacker, pending.weaponId)
    const evaluation = evaluateAttack(pending)
    const passed = evaluation.success
    const playerSide = attacker.side === 'player'
    // Book p.290: a Deadly attack by a player character is escalation (+1 Threat). Enemy Deadly attacks cost nothing yet.
    const deadlyThreat = playerSide && getInjuryMode(pending.injuryMode).generatesThreat ? 1 : 0
    // A party task saves its Momentum to the group pool (bonus Momentum too: PROTOTYPE RULE, missionResources.js
    // savableMomentum); an NPC's Momentum becomes Threat (Book p.265). Complications stay complications on the result.
    const saving = playerSide ? saveMomentum(state.resources, savableMomentum(evaluation)) : { resources: state.resources, saved: 0, lost: 0 }
    const npcThreat = playerSide ? 0 : evaluation.momentumGenerated
    let resources = addThreat(npcMomentumToThreat(saving.resources, npcThreat), deadlyThreat)
    // Hook: action.addedSeverity (Momentum for +severity, Book p.292); no UI or AI asks for it yet.
    const added = passed ? affordAddedSeverity(resources, weapon, action.addedSeverity, playerSide) : { added: 0, cost: 0 }
    if (added.cost) resources = spendMomentum(resources, added.cost)
    let next = { ...state, pending: null, resources }
    let injuryLines = []
    let injury = null
    if (passed) {
      injury = injuryFor(next, attacker, target, weapon, pending.injuryMode, added.added, { aimed: pending.aimed, targetUnaware: pending.targetUnaware })
      const hit = inflictInjury(next, attacker.id, target.id, injury)
      next = hit.state
      injuryLines = hit.lines
      injury = { ...injury, decided: hit.avoided ? 'avoided' : 'suffered' }
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
      ...(playerSide && evaluation.bonusMomentum ? [bonusMomentumLine(evaluation.bonusMomentum)] : []),
      ...(evaluation.complications ? [`Complications: ${evaluation.complications}`] : []),
      ...(deadlyThreat ? [`Threat +1 (Deadly attack), now ${resources.threat}`] : []),
    ]
    next = markAction(next, 'resolve', attacker.id, { targetId: target.id, weaponId: weapon.id, passed, removed: !isActive(after), injury, awaiting: false })
    next = addLog(next, lines)
    // Book p.290: an opposed attack the target won may be answered with a Counterattack (combatCounterattack.js).
    const won = !passed && pending.opposition ? defenderWins(next, pending, evaluation) : null
    if (won) next = addLog(won.state, won.lines)
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
        // The Injury the hit inflicts; decided: 'avoided' (Stress/Threat spent) or 'suffered' (Defeated).
        injury,
        counterattack: won?.counterattack ?? null,
        closed: false,
      },
    }
    return withOutcome(next)
  }
}
