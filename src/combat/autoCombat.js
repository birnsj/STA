// Auto Combat: AI-driven combat on the normal engine. Nothing here depends on React or timers; the screen only decides
// when to take the next step, so the same steps can run headless (runAutoCombat) for later batch simulation.
import {
  canAmbush,
  combatReducer,
  createCombat,
  getActiveCombatant,
  getAmbusher,
  getAmbushTargets,
  getOpponents,
  getReachable,
  getTurnGroup,
  isTurnFinished,
  previewAmbush,
  previewAttack,
} from './combatState.js'
import { canTakeCover } from './coverSystem.js'
import { nextAIStep } from './combatAI.js'
import { retreatStep } from './combatRetreat.js'
import { chooseAvoidInjury, chooseCounterattack, chooseFatigueAttribute } from './injuryPolicy.js'
import { tileDistance } from './rangeSystem.js'
import { PLANNER_PROFILES, plannerStep } from './turnPlanner.js'
import { randomStep } from './randomAI.js'
import { supportStep } from './supportAI.js'
import { deriveSeed, seededRandomInt } from '../rules/seededRandom.js'

// Test options for comparing AIs: which AI plays the party in Auto Combat, and which plays the enemies (always AI-run).
// Classic is the original AI for that side (combatAI.js player and enemy profiles).
export const PARTY_AIS = [
  { id: 'classic', name: 'Classic' },
  { id: 'planner', name: 'Turn Planner' },
  { id: 'squad', name: 'Squad Tactician' },
  { id: 'aggressive', name: 'Aggressive' },
  { id: 'cautious', name: 'Cautious' },
  { id: 'lookahead', name: 'Lookahead' },
  { id: 'random', name: 'Random' },
]

export const ENEMY_AIS = PARTY_AIS

function normalStep(state, self, ai) {
  if (self.retreating) return retreatStep(state, self)
  if (ai === 'random') return randomStep(state, self)
  // Party AIs first weigh Scan, Persuade, Intimidate, First Aid, Guard and Direct against their own attack (supportAI.js).
  const support = supportStep(state, self)
  if (support) return support
  if (PLANNER_PROFILES[ai]) return plannerStep(state, self, ai)
  return nextAIStep(state)
}

// Prototype tuning, not a book rule: the party ambushes when it is at least this likely to succeed (Random: half the time).
const AMBUSH_MIN_CHANCE = 0.5
const AMBUSH_SALT = 0x2f6b9a3d

// A tile the ambusher can Move (else Sprint) to this turn with a shot at some Klingon: in cover first, then the shortest
// walk. Returns { kind, position } or null.
function ambushPosition(state, ambusher) {
  const hasShot = (position) =>
    getOpponents(state, ambusher).some((enemy) => ambusher.weaponIds.some((weaponId) => previewAttack(state, ambusher.id, enemy.id, weaponId, position).available))
  for (const kind of ['move', 'sprint']) {
    const tiles = [...getReachable(state, ambusher, kind).values()].filter((entry) => entry.steps > 0 && hasShot(entry.position))
    tiles.sort((a, b) => Number(canTakeCover(state.map, b.position)) - Number(canTakeCover(state.map, a.position)) || a.steps - b.steps)
    if (tiles.length) return { kind, position: tiles[0].position }
  }
  return null
}

// The Ambush for an AI-run party, while the party is unspotted. It is aimed at the Klingon the AI would attack first if the
// ambusher has a shot at it, else the nearest one they have a shot at. With no shot yet, the party sets it up: the turn
// goes to the ambusher (while they still have a turn), who moves to a tile with a shot.
function ambushStep(state, self, ai) {
  const ambusher = getAmbusher(state)
  const chance = previewAmbush(state, null).chance
  const willTry = ai === 'random' ? seededRandomInt(deriveSeed(state.seed ^ AMBUSH_SALT, 0))() < 0.5 : chance >= AMBUSH_MIN_CHANCE
  if (!ambusher || !willTry) return null
  const percent = `${Math.round(chance * 100)}%`
  const targets = getAmbushTargets(state)
  if (!targets.length) {
    if (isTurnFinished(state, ambusher.id) || !getTurnGroup(state).includes(ambusher.id)) return null
    const spot = ambushPosition(state, ambusher)
    if (!spot) return null
    if (ambusher.id !== self.id) {
      return { type: 'selectCombatant', combatantId: ambusher.id, decision: `Switch to ${ambusher.character.name}`, reason: `${ambusher.character.name} sets up an ambush (${percent} chance) before anyone attacks.` }
    }
    const verb = spot.kind === 'sprint' ? 'Sprint' : 'Move'
    return { type: spot.kind, destination: spot.position, decision: `${verb} into ambush position`, reason: `Getting a shot at a Klingon to ambush it (${percent} chance).` }
  }
  const step = normalStep(state, self, ai)
  const planned = targets.find((enemy) => enemy.id === step.targetId)
  const nearest = [...targets].sort((a, b) => tileDistance(ambusher.position, a.position) - tileDistance(ambusher.position, b.position))[0]
  const preview = previewAmbush(state, (planned ?? nearest).id)
  return {
    type: 'ambush',
    targetId: preview.target.id,
    decision: `Ambush ${preview.target.character.name}`,
    reason: ai === 'random' ? `Random coin flip: ambush (${percent} chance).` : `${preview.ambusher.character.name} has a ${percent} chance to ambush (tries at ${AMBUSH_MIN_CHANCE * 100}% or better).`,
  }
}

// partyAmbush: false skips the opening ambush (to compare fights with and without it).
export function chooseAIStep(state, { partyAI = 'classic', enemyAI = 'classic', partyAmbush = true } = {}) {
  const self = getActiveCombatant(state)
  const ai = self.side === 'player' ? partyAI : enemyAI
  if (self.side === 'player' && partyAmbush && canAmbush(state)) {
    const ambush = ambushStep(state, self, ai)
    if (ambush) return ambush
  }
  return normalStep(state, self, ai)
}

// The Avoid Injury decision for a party member when the AI plays the party (combat/injuryPolicy.js).
function injuryDecisionStep(state) {
  const { targetId, injury, option } = state.incomingInjury
  const target = state.combatants[targetId]
  const avoid = chooseAvoidInjury({ state, target, injury, option })
  return {
    type: 'injuryDecision',
    avoid,
    reason: avoid
      ? `Auto Combat policy: avoid whenever possible (${option.cost} Stress instead of a Severity ${injury.severity} Injury and Defeat${option.overflow ? '; the track fills and a complication follows' : ''}).`
      : 'Auto Combat policy: cannot avoid.',
  }
}

// The attribute a newly Fatigued party member shuts down when the AI plays the party (combat/injuryPolicy.js).
function fatigueChoiceStep(state) {
  const { attributeId, reason } = chooseFatigueAttribute({ combatant: state.combatants[state.pendingFatigue.combatantId] })
  return { type: 'chooseFatigueAttribute', attribute: attributeId, reason }
}

// The Counterattack decision for a party defender when the AI plays the party (combat/injuryPolicy.js).
function counterattackStep(state) {
  const offer = state.pendingCounterattack
  const defender = state.combatants[offer.defenderId]
  return { type: 'counterattackDecision', ...chooseCounterattack({ state, defender, attacker: state.combatants[offer.attackerId], offer }) }
}

// One AI step for whoever is acting. A rejected step (state unchanged) ends the turn instead of stalling.
// options: { partyAI, enemyAI, partyAmbush, partyAuto } (AI ids from PARTY_AIS / ENEMY_AIS). An incoming Injury, a
// Fatigue attribute choice or a Counterattack on a party member waits for the player (state unchanged) unless partyAuto:
// the AI plays the party.
export function stepAI(state, options = {}) {
  if (!state || state.outcome) return state
  if (state.incomingInjury) return options.partyAuto ? combatReducer(state, injuryDecisionStep(state)) : state
  if (state.pendingFatigue) return options.partyAuto ? combatReducer(state, fatigueChoiceStep(state)) : state
  if (state.pendingCounterattack) return options.partyAuto ? combatReducer(state, counterattackStep(state)) : state
  const action = chooseAIStep(state, options)
  const next = combatReducer(state, action)
  if (next !== state) return next
  return combatReducer(state, { type: 'endTurn', decision: 'End turn', reason: `The ${action.type} step was not allowed; ending turn.` })
}

// The screen's reducer: the normal combat reducer plus { type: 'aiStep' }.
export const autoCombatReducer = (state, action) =>
  action.type === 'aiStep' ? stepAI(state, { partyAI: action.partyAI, enemyAI: action.enemyAI, partyAuto: action.partyAuto }) : combatReducer(state, action)

// Runs a whole fight with every combatant AI-controlled, without any UI. Same inputs + seed -> same result.
// map: a parsed map file.
export function runAutoCombat({ encounterId, map, players, seed, partyAI, enemyAI, partyAmbush = true, maxSteps = 5000 }) {
  let state = createCombat({ encounterId, map, players, seed })
  let steps = 0
  while (!state.outcome && steps < maxSteps) {
    state = stepAI(state, { partyAI, enemyAI, partyAmbush, partyAuto: true })
    steps += 1
  }
  return { state, steps, outcome: state.outcome ?? 'unfinished', rounds: state.round }
}

// Plain-text combat log in chronological order (for copying out of the debug panel).
export function formatCombatLog(state) {
  return state.log
    .map((entry) => {
      if (entry.kind === 'round') return `\n${entry.lines.join('\n')}`
      if (entry.kind === 'turn') return `\n${entry.lines.join('\n')}`
      return entry.lines.join('\n')
    })
    .join('\n')
    .trim()
}
