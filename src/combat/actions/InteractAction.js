import { withoutUsedAssist } from '../combatAttacks.js'
import { withStats } from '../combatLog.js'
import { canAfford } from '../combatSelectors.js'
import { settleDirected, withOutcome } from '../combatTurnOrder.js'
import { ACTION_TYPE_NAMES, actionsLeftText, actionTypeOf, spendTurnAction } from '../turnActions.js'
import { CombatAction } from './CombatAction.js'

// A challenge object's task or routine action taken in combat. The object's own rules run in the world first
// (WorldEncounter.interact: ChallengeObject attempt, the same object and task as in exploration); this records what it
// means for the fight. Only a fight in the world has objects, so the combat reducer never sees 'interact'.
// interaction: { actorId, cost ('major' | 'minor' | 'free'), resources (the mission pools after the attempt), label,
// passed (null = no roll), task, dice, successes, complications, momentumGenerated, momentumSaved, assistUsed, lines }.
export class InteractAction extends CombatAction {
  constructor() {
    super('interact')
  }

  unavailableReason(state, actor, { cost }) {
    return actor && canAfford(state, actor, cost) ? null : `No ${ACTION_TYPE_NAMES[actionTypeOf(cost)] ?? ''} action left.`
  }

  apply(state, actor, interaction) {
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
    next = this.record(next, actor, { passed: interaction.passed }, [`${interaction.label} (${ACTION_TYPE_NAMES[actionTypeOf(interaction.cost)]} action; ${actionsLeftText(next.turn)})`, ...interaction.lines])
    return withOutcome(settleDirected(next))
  }
}

export const INTERACT = new InteractAction()
