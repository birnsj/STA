// Combat state and its reducer. All combat rules run here (through the rule modules), never in React handlers.
// The reducer is pure and never reads the clock or Math.random: every roll comes from the combat's own seed plus a roll
// counter, so the same characters, encounter, seed and actions always replay the same fight (and it can run headless).
// Personal condition (Book p.277-278, p.290-292; rules/personalCondition.js): a successful attack inflicts an Injury of
// the weapon's severity (less Protection); the target may Avoid it by taking that much Stress, else suffers it and is
// Defeated. There are no Hits. The player decides Avoid Injury for party members (state.incomingInjury waits for it),
// and which attribute a newly Fatigued party member shuts down (state.pendingFatigue); AI-controlled combatants decide
// through combat/injuryPolicy.js. A failed attack is a miss.
// Every roll (attacks, assists, opposed rolls, the Ambush) is the shared STA 2E task (rules/taskPreparation.js +
// rules/taskResolver.js) on the combatants' own characters, the same one challenge objects use. Combat decides what a
// result means here: a Hit, and what happens to the mission's pools (state.resources, rules/missionResources.js; the
// same object exploration holds): a party task saves its Momentum to the group pool, an NPC's Momentum becomes Threat.
// Complications stay complications (Book p.258: they are not turned into Threat unless someone buys them off).
// Actions (Book p.288): each turn one major and one minor action (actions.json). Besides attacking: Guard, First Aid,
// Direct and Assist here, and challenge objects in the world (exploration/combatLink.js, the same objects and rules as
// in exploration), all through the same shared task.
//
// This file holds the reducer and re-exports the public surface of the modules it is built from, so callers import
// everything combat-state from here. The reducer only gates on waiting prompts and hands each plain action to its
// CombatAction (actions/registry.js: one class per action type, which validates and applies it). The rule modules:
//   turnActions.js      the action economy (major / minor / free, the round's major-action limit)
//   combatSelectors.js  read-only questions: who acts, opponents, turn groups, what a combatant can afford
//   combatMovement.js   Move and Sprint: blocks, allowance, reachable tiles, paths
//   combatAttacks.js    attack previews, opposition, Aim, Assist / Direct dice, hit chance
//   combatTasks.js      Guard, First Aid, Direct previews and their shared roll
//   combatInjuries.js   inflicting, avoiding and suffering Injuries; Fatigue
//   combatAmbush.js     the party's one Ambush attempt
//   combatCounterattack.js  a defender who won an opposed attack: their Momentum, and the Counterattack
//   combatTurnOrder.js  turns, rounds, switching party members, settling a Direct, the outcome
//   combatSetup.js      createCombat and late arrivals
//   combatLog.js        shared state helpers and the log's wording
import { INTERACT } from './actions/InteractAction.js'
import { combatActionFor } from './actions/registry.js'
import { getActiveCombatant } from './combatSelectors.js'
import { withRetreats } from './combatRetreat.js'
import { createCombat } from './combatSetup.js'
import { settleDirected } from './combatTurnOrder.js'

export { ACTION_TYPE_NAMES, ADAPTATION_MOMENTUM_SPENDS, COMBAT_TASKS, EXTRA_ACTIONS, actionTypeOf, actionsLeft, actionsLeftText, majorsTaken } from './turnActions.js'
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
  occupiesTile,
  reachLines,
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
  canAssistReroll,
  evaluateAttack,
  getAssistFor,
  getAssistableAllies,
  getAttackTask,
  getHitChance,
  hasTargetInRange,
  isAccurate,
  maxAttackSuccesses,
  previewAttack,
  rollAwaitsPlayer,
} from './combatAttacks.js'
export { directBlock, getAuthority, getDirectableAllies, getFirstAidOptions, getGuardTargets, previewFirstAid, previewGuard, previewScan } from './combatTasks.js'
export { isScanned, scanReport, SCAN_TRAIT, visibleCondition } from './combatScan.js'
export { previewSocial, SOCIAL_KINDS, socialChance } from './combatSocial.js'
export { injuryDefeats, injuryFor, previewInjuries } from './combatInjuries.js'
export { combatActionFor } from './actions/registry.js'
export { AMBUSH_FOCUSES, canAmbush, getAmbushTargets, getAmbusher, previewAmbush } from './combatAmbush.js'
export { addCombatant, createCombat } from './combatSetup.js'

// A challenge object's task or routine action taken in combat (WorldEncounter.interact runs the object's own rules; the
// InteractAction records what it means for the fight).
export function canInteract(state, actorId, cost) {
  const actor = state.combatants[actorId]
  return Boolean(actor) && !INTERACT.unavailableReason(state, actor, { cost })
}

export function applyInteraction(state, interaction) {
  return INTERACT.reduce(state, state.combatants[interaction.actorId], interaction)
}

// ---------- reducer ----------

export function combatReducer(state, action) {
  if (action.type === 'restart') return createCombat(action.options)
  if (!state || state.outcome) return state
  const settled = settleDirected(reduceAction(state, action))
  const next = settled === state ? state : withRetreats(settled)
  // Any attack, by either side, spots the party and ends the ambush chance.
  if (next !== state && next.ambush === null && (action.type === 'attack' || action.type === 'attackObject')) return { ...next, ambush: { passed: true } }
  return next
}

function reduceAction(state, action) {
  const actor = getActiveCombatant(state)
  // An incoming Injury waits for its Avoid Injury decision, and a new Fatigue for its attribute, before anything else.
  if (state.incomingInjury && action.type !== 'injuryDecision') return state
  if (state.pendingFatigue && action.type !== 'chooseFatigueAttribute') return state
  if (state.pendingCounterattack && action.type !== 'counterattackDecision') return state

  const registered = combatActionFor(action.type)
  return registered ? registered.reduce(state, actor, action) : state
}
