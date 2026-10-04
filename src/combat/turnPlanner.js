// Turn Planner: alternative Auto Combat AIs for the party (chosen in the Auto Combat test dropdown).
// Instead of a fixed checklist, it lists every plan for the AP left (stay, or move to any reachable tile, combined with
// Attack, Aim + Attack, Attack twice, Attack then move, Assist...), scores each and takes the first action of the best one.
// It replans after every action, so dice results and fallen enemies are always taken into account.
//
// Score = expected Hits dealt - dangerWeight x expected Hits taken back at the end position + a little for closing in.
// Expected values come from the same rules the attack uses (previewAttack / getHitChance); nothing is rolled here.
// Enemies are judged by the enemy AI's own habits: each walks then shoots, and targets the nearest party member.
// The profiles below only change weights and add optional terms. All of it is AI tuning (implementation detail), not rules.
import { tileKey } from './battleMap.js'
import { canTakeCover } from './coverSystem.js'
import { findPath, getMovementTiles, getReachableTiles, getSprintTiles } from './movementSystem.js'
import { RANGE_BANDS, tileDistance } from './rangeSystem.js'
import { getWeapon } from './weaponSystem.js'
import {
  canAfford,
  canAim,
  canMove,
  canSprint,
  getAssistableAllies,
  getBlockers,
  getCombatantList,
  getOpponents,
  getReachable,
  isActive,
  MAX_HITS,
  previewAttack,
} from './combatState.js'
import { bestShot, cancelThreatStep, expectedChance, injuryModesFor, momentumHitStep, pendingStep, shotSummary } from './combatAI.js'
import { TASK_DICE } from '../rules/taskResolver.js'

const BASE_PROFILE = {
  // A Hit that removes a combatant is worth 1 + killBonus (it also ends everything that combatant would have done).
  killBonus: 1,
  // How much a Hit taken counts against a Hit dealt.
  dangerWeight: 0.8,
  // Per tile closer to the nearest enemy (walking distance), so a turn with no shot still advances.
  approachWeight: 0.04,
  // Per tile walked, so equal plans prefer the shorter move.
  stepCost: 0.005,
  // Shots below this chance to hit are not considered at all.
  minShotChance: 0,
  // Multiplies the value of an assist die.
  assistWeight: 1,
  // Squad: extra value for hitting a target that is already hurt or that teammates can also shoot (focus fire).
  focusWeight: 0,
  // Squad: cost per tile beyond COHESION_RANGE from the nearest teammate.
  cohesionWeight: 0,
  // Lookahead: weight of the best shot this character will have next turn from where it ends, after the enemies close in.
  nextTurnWeight: 0,
}

// Every planner AI runs out of patience after patienceRounds(Daring) whole rounds without attacking. It then plays like
// Aggressive (any shot, little regard for danger, closing in) until it attacks again, so two sides holding cover can never
// wait each other out. Bolder characters lose patience sooner: Daring 7-8 -> 3 rounds, 9-10 -> 2, 11+ -> 1.
// Designer request (Oct 2026) to tie this to Daring; the bands are AI tuning, not a book rule.
const IMPATIENT = { minShotChance: 0, dangerWeight: 0.2, approachWeight: 0.1 }
export const patienceRounds = (daring) => Math.min(3, Math.max(1, 3 - Math.floor((daring - 7) / 2)))

export const PLANNER_PROFILES = {
  planner: BASE_PROFILE,
  aggressive: { ...BASE_PROFILE, killBonus: 1.5, dangerWeight: 0.2, approachWeight: 0.1 },
  cautious: { ...BASE_PROFILE, dangerWeight: 1.6, approachWeight: 0.01, minShotChance: 0.4 },
  squad: { ...BASE_PROFILE, assistWeight: 1.5, focusWeight: 0.5, cohesionWeight: 0.05 },
  lookahead: { ...BASE_PROFILE, nextTurnWeight: 0.5 },
}

// How likely an enemy is to shoot this character: it picks the nearest party member.
const NEAREST_TARGET_ODDS = 1
const OTHER_TARGET_ODDS = 0.3
const COHESION_RANGE = 3
// Lookahead only re-judges the best few plans, to keep each step fast.
const LOOKAHEAD_PLANS = 8

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const pct = (chance) => `${Math.round(chance * 100)}%`
const maxRangeTiles = (weapon) => RANGE_BANDS.find((band) => band.id === weapon.maximumRange)?.maxTiles ?? Infinity
const teammates = (state, self) => getCombatantList(state).filter((other) => other.side === self.side && other.id !== self.id && isActive(other))

// What one Hit on a combatant is worth to this profile.
function createValuer(state, self, profile) {
  const allies = teammates(state, self)
  const cache = new Map()
  return (target) => {
    if (cache.has(target.id)) return cache.get(target.id)
    let value = 1 + (target.hits >= MAX_HITS - 1 ? profile.killBonus : 0)
    if (profile.focusWeight && target.side !== self.side) {
      const sharers = allies.filter((ally) => bestShot(state, ally, target)).length
      value *= 1 + profile.focusWeight * (target.hits / MAX_HITS + (allies.length ? sharers / allies.length : 0))
    }
    cache.set(target.id, value)
    return value
  }
}

// The best attack from a position (current one by default), judged by chance to hit x value of the Hit.
function bestAttack(state, self, valueOf, profile, fromPosition, { aimed = false } = {}) {
  const judged = aimed ? { ...state, turn: { ...state.turn, aimReroll: true } } : state
  let best = null
  for (const target of getOpponents(state, self)) {
    const shot = bestShot(state, self, target, fromPosition)
    if (!shot) continue
    const chance = expectedChance(judged, self.id, shot)
    if (chance < profile.minShotChance) continue
    const value = chance * valueOf(target)
    if (!best || value > best.value) best = { target, shot, chance, value }
  }
  return best
}

// The ally whose best shot this round an assist die would improve most (where they stand, or from a tile they can reach).
function bestAssist(state, self, valueOf, profile) {
  if (!canAfford(state, self, 'assist')) return null
  let best = null
  for (const ally of getAssistableAllies(state, self)) {
    const assisted = { ...state, assists: { ...state.assists, [ally.id]: self.id } }
    const positions = [undefined, ...[...getReachable(state, ally).values()].filter((entry) => entry.steps > 0).map((entry) => entry.position)]
    for (const position of positions) {
      for (const target of getOpponents(state, ally)) {
        const shot = bestShot(state, ally, target, position)
        if (!shot) continue
        const gain = expectedChance(assisted, ally.id, shot) - expectedChance(state, ally.id, shot)
        const value = gain * valueOf(target) * profile.assistWeight
        if (!best || value > best.value) best = { ally, target, shot, gain, value }
      }
    }
  }
  return best && best.value > 0 ? best : null
}

// Expected Hits this character takes next round if it ends its turn at position, and walking distance to the nearest enemy.
function createDangerMap(state, self, valueOf) {
  const opponents = getOpponents(state, self).map((opponent) => {
    const tiles = [...getReachableTiles(state.map, opponent.position, getMovementTiles(opponent.character), getBlockers(state, opponent)).values()].map(
      (entry) => entry.position,
    )
    const weapons = opponent.weaponIds.map(getWeapon).filter((weapon) => injuryModesFor(state, opponent, weapon).length)
    const walk = getReachableTiles(state.map, opponent.position, state.map.width * state.map.height)
    return { opponent, tiles, weapons, walk }
  })
  const allies = teammates(state, self)
  const cache = new Map()

  const danger = (position) => {
    const key = tileKey(position)
    if (cache.has(key)) return cache.get(key)
    const covered = canTakeCover(state.map, position)
    const placed = { ...state, combatants: { ...state.combatants, [self.id]: { ...self, position, inCover: covered } } }
    let total = 0
    for (const { opponent, tiles, weapons } of opponents) {
      let chance = 0
      for (const weapon of weapons) {
        const reach = maxRangeTiles(weapon)
        for (const tile of tiles) {
          if (tileDistance(tile, position) > reach) continue
          const shot = previewAttack(placed, opponent.id, self.id, weapon.id, tile)
          if (!shot.available || shot.task.difficulty > TASK_DICE) continue
          chance = Math.max(chance, expectedChance(placed, opponent.id, shot))
        }
      }
      if (!chance) continue
      const mine = tileDistance(opponent.position, position)
      const isNearest = allies.every((ally) => tileDistance(opponent.position, ally.position) >= mine)
      total += chance * (isNearest ? NEAREST_TARGET_ODDS : OTHER_TARGET_ODDS) * valueOf(self)
    }
    const result = { danger: total, covered }
    cache.set(key, result)
    return result
  }

  const distance = (position) => Math.min(Infinity, ...opponents.map(({ walk }) => walk.get(tileKey(position))?.steps ?? Infinity))
  return { danger, distance, opponents }
}

// Lookahead: the best shot from position next turn, once each enemy has walked toward its nearest party member.
function nextTurnShot(state, self, position, opponents, valueOf, profile) {
  const covered = canTakeCover(state.map, position)
  const party = [{ ...self, position }, ...teammates(state, self)]
  const combatants = { ...state.combatants, [self.id]: { ...self, position, inCover: covered } }
  for (const { opponent, tiles } of opponents) {
    const nearest = party.reduce((a, b) => (tileDistance(opponent.position, a.position) <= tileDistance(opponent.position, b.position) ? a : b))
    const goal = tiles.reduce((a, b) => (tileDistance(a, nearest.position) <= tileDistance(b, nearest.position) ? a : b), opponent.position)
    combatants[opponent.id] = { ...opponent, position: goal, inCover: canTakeCover(state.map, goal) }
  }
  const predicted = { ...state, combatants }
  return bestAttack(predicted, predicted.combatants[self.id], valueOf, profile)
}

function attackAction(state, self, attack) {
  return { type: 'attack', targetId: attack.target.id, weaponId: attack.shot.weapon.id, injuryMode: injuryModesFor(state, self, attack.shot.weapon)[0] }
}

const attackText = (attack) => `Attack ${attack.target.character.name} (${pct(attack.chance)}, ${shotSummary(attack.shot)})`
const assistText = (assist) => `Assist ${assist.ally.character.name} (+${pct(assist.gain)} on ${assist.target.character.name})`

export function plannerStep(state, self, profileId = 'planner') {
  const chosen = PLANNER_PROFILES[profileId] ?? BASE_PROFILE
  const patience = patienceRounds(self.character.attributes.daring)
  const impatient = state.round - (state.stats.byCombatant[self.id]?.lastAttackRound ?? 0) > patience
  const profile = impatient
    ? { ...chosen, ...IMPATIENT, dangerWeight: Math.min(chosen.dangerWeight, IMPATIENT.dangerWeight), approachWeight: Math.max(chosen.approachWeight, IMPATIENT.approachWeight) }
    : chosen
  if (state.pending) return pendingStep(state, self)
  const extraHit = momentumHitStep(state, self)
  if (extraHit) return extraHit
  if (!state.turn.ap) return { type: 'endTurn', decision: 'End turn', reason: 'No AP left.' }
  if (!getOpponents(state, self).length) return { type: 'endTurn', decision: 'End turn', reason: 'No targets left.' }
  const cancel = cancelThreatStep(state, self)
  if (cancel) return cancel

  const { ap } = state.turn
  const here = self.position
  const valueOf = createValuer(state, self, profile)
  const map = createDangerMap(state, self, valueOf)
  const startDistance = map.distance(here)
  const allies = teammates(state, self)
  const tiles = canMove(state, self) ? [...getReachable(state, self).values()].filter((entry) => entry.steps > 0) : []
  const attack = canAfford(state, self, 'attack') ? bestAttack(state, self, valueOf, profile) : null
  const assist = bestAssist(state, self, valueOf, profile)
  const plans = []
  const add = (first, steps, offence, end = { position: here, steps: 0 }) => plans.push({ first, steps, offence, end })
  const moveTo = (entry, extra = {}) => ({ type: 'move', destination: entry.position, ...extra })

  add({ type: 'endTurn' }, ['End turn'], 0)
  if (attack) {
    add(attackAction(state, self, attack), [attackText(attack)], attack.value)
    if (ap >= 2) {
      add(attackAction(state, self, attack), [attackText(attack), 'Attack again'], attack.value * 2)
      if (assist) add(attackAction(state, self, attack), [attackText(attack), assistText(assist)], attack.value + assist.value)
      for (const entry of tiles) add(attackAction(state, self, attack), [attackText(attack), `Move ${plural(entry.steps, 'tile')}`], attack.value, entry)
      const aimed = canAim(state, self) ? bestAttack(state, self, valueOf, profile, undefined, { aimed: true }) : null
      if (aimed) add({ type: 'aim', targetId: aimed.target.id, weaponId: aimed.shot.weapon.id }, ['Aim', attackText(aimed)], aimed.value)
    }
  }
  if (assist) {
    add({ type: 'assist', allyId: assist.ally.id }, [assistText(assist)], assist.value)
    if (ap >= 2) {
      if (attack) add({ type: 'assist', allyId: assist.ally.id }, [assistText(assist), attackText(attack)], assist.value + attack.value)
      for (const entry of tiles) add({ type: 'assist', allyId: assist.ally.id }, [assistText(assist), `Move ${plural(entry.steps, 'tile')}`], assist.value, entry)
    }
  }
  for (const entry of tiles) {
    add(moveTo(entry), [`Move ${plural(entry.steps, 'tile')}`], 0, entry)
    if (ap < 2) continue
    const from = canAfford(state, self, 'attack') ? bestAttack(state, self, valueOf, profile, entry.position) : null
    if (from) add(moveTo(entry, { targetId: from.target.id, weaponId: from.shot.weapon.id }), [`Move ${plural(entry.steps, 'tile')}`, attackText(from)], from.value, entry)
    if (assist) add(moveTo(entry), [`Move ${plural(entry.steps, 'tile')}`, assistText(assist)], assist.value, entry)
  }

  // Sprint (half movement, once per turn): alone, with an attack before or after, or after a Move to go further.
  const sprintTiles = canSprint(state, self) ? [...getReachable(state, self, 'sprint').values()].filter((entry) => entry.steps > 0) : []
  const sprintTo = (entry, extra = {}) => ({ type: 'sprint', destination: entry.position, ...extra })
  for (const entry of sprintTiles) {
    const label = `Sprint ${plural(entry.steps, 'tile')}`
    add(sprintTo(entry), [label], 0, entry)
    if (ap < 2) continue
    const from = canAfford(state, self, 'attack') ? bestAttack(state, self, valueOf, profile, entry.position) : null
    if (from) add(sprintTo(entry, { targetId: from.target.id, weaponId: from.shot.weapon.id }), [label, attackText(from)], from.value, entry)
    if (attack) add(attackAction(state, self, attack), [attackText(attack), label], attack.value, entry)
  }
  // Move + Sprint: tiles only both together reach. The first step is a Move as far along the route as it can stop
  // (allies can be passed but not stopped on); the planner replans before the Sprint.
  if (ap >= 2 && tiles.length && sprintTiles.length) {
    const moveTiles = getMovementTiles(self.character)
    const blockers = getBlockers(state, self)
    const far = getReachableTiles(state.map, here, moveTiles + getSprintTiles(self.character), blockers)
    for (const entry of far.values()) {
      if (entry.steps <= moveTiles) continue
      const path = findPath(state.map, here, entry.position, entry.steps, blockers)
      const stop = path && path.slice(1, moveTiles + 1).reverse().find((position) => !blockers.occupiedKeys.has(tileKey(position)))
      if (!stop) continue
      add(moveTo({ position: stop }), [`Move ${plural(path.indexOf(stop), 'tile')}`, `Sprint to ${plural(entry.steps, 'tile')} away`], 0, entry)
    }
  }

  for (const plan of plans) {
    const end = plan.end.position
    const { danger, covered } = map.danger(end)
    plan.danger = danger
    plan.covered = covered
    plan.score = plan.offence - profile.dangerWeight * danger + profile.approachWeight * (startDistance - map.distance(end)) - profile.stepCost * plan.end.steps
    if (profile.cohesionWeight && allies.length) {
      const nearestAlly = Math.min(...allies.map((ally) => tileDistance(ally.position, end)))
      plan.score -= profile.cohesionWeight * Math.max(0, nearestAlly - COHESION_RANGE)
    }
  }
  plans.sort((a, b) => b.score - a.score)
  if (profile.nextTurnWeight) {
    for (const plan of plans.slice(0, LOOKAHEAD_PLANS)) {
      plan.nextTurn = nextTurnShot(state, self, plan.end.position, map.opponents, valueOf, profile)?.value ?? 0
      plan.score += profile.nextTurnWeight * plan.nextTurn
    }
    plans.sort((a, b) => b.score - a.score)
  }

  const best = plans[0]
  const runnerUp = plans.find((plan) => plan.first.type !== best.first.type)
  const ending = best.end.steps ? `ends ${best.covered ? 'in cover' : 'exposed'}` : `stays ${best.covered ? 'in cover' : 'put'}`
  const lookahead = best.nextTurn !== undefined ? ` Next turn's shot from there: ${best.nextTurn.toFixed(2)}.` : ''
  return {
    ...best.first,
    decision: `Plan: ${best.steps.join(' > ')}`,
    reason:
      (impatient ? `Out of patience (Daring ${self.character.attributes.daring}: ${plural(patience, 'round')} without attacking): taking any shot and closing in. ` : '') +
      `Best of ${plans.length} plans (score ${best.score.toFixed(2)}): expected ${best.offence.toFixed(2)} Hits dealt, ` +
      `${best.danger.toFixed(2)} Hits risked next round; ${ending}.${lookahead}` +
      (runnerUp ? ` Next best: ${runnerUp.steps.join(' > ')} (${runnerUp.score.toFixed(2)}).` : ''),
  }
}
