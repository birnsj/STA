import { checkDicePurchase, npcMomentumToThreat, payForDice, savableMomentum, saveMomentum } from '../../rules/missionResources.js'
import { evaluateStaDie, resolveStaTask, rollDice } from '../../rules/taskResolver.js'
import { damageObjectInCombat, previewObjectAttack } from '../combatEnvironment.js'
import { addLog, diceText, focusText, markAction, momentumLine, purchaseLine, recordDecision, takeRandom, taskText, updateCombatant, withStats } from '../combatLog.js'
import { facingToward } from '../combatSelectors.js'
import { withOutcome } from '../combatTurnOrder.js'
import { actionsLeftText, spendTurnAction } from '../turnActions.js'
import { CombatAction } from './CombatAction.js'

// Attack Object (major, the attack's cost): { objectId, weaponId, purchase }. Shooting a destructible object
// (world/environment.js). PROTOTYPE RULE (designer decision, Oct 2026): one roll that resolves at once, the weapon's
// attack task against previewObjectAttack's Difficulty; a success does the weapon's severity less the object's
// Resistance (at least 1) to its Structure, and any explosion it sets off hurts everyone it reaches. No Aim, Assist,
// reroll or Counterattack: an object neither defends nor fights back.
export class AttackObjectAction extends CombatAction {
  constructor() {
    super('attackObject')
  }

  get cost() {
    return 'attack'
  }

  unavailableReason(state, actor, { objectId, weaponId }) {
    const economy = super.unavailableReason(state, actor)
    if (economy) return economy
    const preview = previewObjectAttack(state, actor.id, objectId, weaponId)
    return preview.available ? null : (preview.reason ?? 'No shot.')
  }

  apply(state, actor, action) {
    const preview = previewObjectAttack(state, actor.id, action.objectId, action.weaponId)
    if (!preview.available) return state
    const purchase = checkDicePurchase(state.resources, action.purchase, actor.side)
    if (!purchase.valid) return state
    const decided = recordDecision(state, actor, action)
    const { random, next: afterDraw } = takeRandom(decided.state)
    const { task, record, weapon, prepared } = preview
    const dice = rollDice(random, purchase.dice)
    const evaluation = resolveStaTask({ leader: { task, dice }, difficulty: task.difficulty, ignoreComplications: prepared.ignoreComplications ?? 0, bonusMomentum: prepared.bonusMomentum ?? 0 })
    const playerSide = actor.side === 'player'
    const saving = playerSide ? saveMomentum(state.resources, savableMomentum(evaluation)) : { resources: state.resources, saved: 0, lost: 0 }
    const npcThreat = playerSide ? 0 : evaluation.momentumGenerated
    const resources = npcMomentumToThreat(payForDice(saving.resources, purchase), npcThreat)
    const turned = updateCombatant(afterDraw, actor.id, { facing: facingToward(actor.position, record.position) })
    const used = spendTurnAction(turned, actor.id, 'attack')
    let next = { ...used, resources, turn: { ...used.turn, attacks: state.turn.attacks + 1 }, result: null }
    next = withStats(next, (stats) => {
      stats.attacks += 1
      stats.byCombatant[actor.id].attacks += 1
      stats.byCombatant[actor.id].lastAttackRound = state.round
      stats.momentum.spentDice += purchase.momentum
      stats.threat.fromDice += purchase.threatAdded
      stats.threat.spentByNpcs += purchase.threatSpent
      if (playerSide) stats.momentum.generated += evaluation.momentumGenerated
      stats.momentum.saved += saving.saved
      stats.momentum.lost += saving.lost
      stats.threat.fromNpcMomentum += npcThreat
    })
    const lines = [
      ...decided.lines,
      `Attack Object (${actionsLeftText(next.turn)})`,
      `${actor.character.name} fires at the ${record.name} with ${weapon.name}`,
      `Range: ${preview.band.name} (${preview.distance} tiles)`,
      taskText(task),
      `Focus: ${focusText(task)}`,
      ...(purchase.bonusDice ? [purchaseLine(purchase)] : []),
      `Difficulty: ${task.difficulty} (${preview.difficultyLines.map((line) => `${line.label} ${line.change >= 0 ? '+' : ''}${line.change}`).join(', ')})`,
      `Rolls: ${diceText(dice.map((value) => evaluateStaDie(task, value)))}`,
      `Successes: ${evaluation.successes} vs Difficulty ${task.difficulty}`,
      `RESULT: ${evaluation.success ? 'SUCCESS' : 'FAILURE'}`,
      ...(evaluation.success ? [`Damage: ${weapon.name} severity ${weapon.severity} - Resistance ${record.resistance} = ${preview.damage} Structure`] : []),
      playerSide ? momentumLine(evaluation.momentumGenerated, saving, resources) : `Momentum generated: ${evaluation.momentumGenerated}${npcThreat ? ` (NPC: added to Threat, now ${resources.threat})` : ''}`,
      ...(evaluation.complications ? [`Complications: ${evaluation.complications}`] : []),
    ]
    let explosions = []
    if (evaluation.success) {
      const hit = damageObjectInCombat(next, record.id, preview.damage)
      next = hit.state
      lines.push(...hit.lines)
      explosions = next.environment.explosions.filter((explosion) => !state.environment.explosions.includes(explosion)).map((explosion) => explosion.id)
    }
    next = markAction(next, 'attackObject', actor.id, { objectId: record.id, weaponId: weapon.id, passed: evaluation.success, explosions, awaiting: Boolean(next.incomingInjury) })
    return withOutcome(addLog(next, lines))
  }
}
