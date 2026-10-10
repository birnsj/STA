// One away-team task roll outside combat (challenge objects, conversation checks): bonus dice bought from the group
// Momentum pool and/or by adding Threat (rules/missionResources.js), the dice drawn from the mission's task seed
// sequence (scenario.taskCount, shared with scans), the one STA task resolver, and the result's Momentum saved to the
// group pool (bonus Momentum too: PROTOTYPE RULE, missionResources.js savableMomentum).
import { checkDicePurchase, payForDice, savableMomentum, saveMomentum } from '../rules/missionResources.js'
import { deriveSeed, seededRandomInt } from '../rules/seededRandom.js'
import { resolveStaTask, rollD20, rollDice } from '../rules/taskResolver.js'

// Task rolls draw their own seeds, apart from the fights' (combat uses the seed's first indices).
export const TASK_SEED_OFFSET = 100000

// prepared: taskPreparation.js prepareTask's result; assist: { task } | null; requestedPurchase: { bonusDice, momentum }.
// Returns null when the roll isn't allowed (impossible task, or dice the pools can't pay for); otherwise
// { state (resources paid and saved, taskCount advanced), result, purchase, saving }.
export function rollPartyTask(state, { prepared, assist = null, purchase: requestedPurchase }) {
  if (!prepared?.possible) return null
  const purchase = checkDicePurchase(state.resources, requestedPurchase)
  if (!purchase.valid) return null
  const paid = payForDice(state.resources, purchase)
  const random = seededRandomInt(deriveSeed(state.seed, TASK_SEED_OFFSET + state.scenario.taskCount))
  const dice = rollDice(random, purchase.dice)
  const assistDie = assist ? rollD20(random) : null
  const result = resolveStaTask({
    leader: { task: prepared.task, dice },
    assist: assist && { task: assist.task, die: assistDie },
    difficulty: prepared.difficulty,
    ignoreComplications: prepared.ignoreComplications,
    bonusMomentum: prepared.bonusMomentum,
  })
  const saving = saveMomentum(paid, savableMomentum(result))
  const next = { ...state, resources: saving.resources, scenario: { ...state.scenario, taskCount: state.scenario.taskCount + 1 } }
  return { state: next, result, purchase, saving }
}
