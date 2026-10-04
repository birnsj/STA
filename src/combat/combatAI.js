// One tactical AI for every AI-controlled combatant: enemies always, and player characters during Auto Combat.
// It only returns ordinary combat actions and only reads the real combat state (the character's own Attributes, Disciplines,
// weapons, movement, range, cover, Momentum and Threat), so it plays by exactly the rules a human player does.
// nextAIStep is called once per step; the caller applies the action and calls it again on the new state.
//
// Profiles:
// Cover is automatic next to a cover object (no Take Cover action), so "taking cover" always means moving there.
// Both profiles spend 2 AP a turn, 1 per action (actions.json).
// - enemy: designer spec v1 enemy AI. Nearest target; attack if a shot is available (with 2 AP, first moving into cover if
//   a covered tile keeps the shot, else aiming); otherwise move to the best reachable firing position (lower Difficulty,
//   covered preferred, fewer steps); otherwise close the distance. Prefers Deadly.
// - player (Auto Combat spec): best available shot across all enemies (lowest Difficulty, exposed, most Hits, nearest);
//   with 2 AP, when exposed to fire, move next to cover if a shot is still available from there, otherwise Aim when it
//   can still change the result; after attacking with AP left, move into cover if possible, else attack again; with no
//   shot and no move left, Assist the ally with the best shot; Stun unless the encounter allows Deadly; spends Momentum
//   (see pendingStep etc.).
import { tileKey } from './battleMap.js'
import { canTakeCover } from './coverSystem.js'
import { getReachableTiles } from './movementSystem.js'
import { tileDistance } from './rangeSystem.js'
import { getWeapon } from './weaponSystem.js'
import {
  canAfford,
  canAimReroll,
  canMove,
  canSprint,
  evaluateAttack,
  getActiveCombatant,
  getAssistableAllies,
  getBlockers,
  getEncounter,
  getHitChance,
  getOpponents,
  getReachable,
  isActive,
  MAX_HITS,
  previewAttack,
} from './combatState.js'
import { TASK_DICE } from '../rules/taskResolver.js'

// AI tuning (implementation detail, not rules): how much a covered firing position is worth in Difficulty steps x10,
// and the lowest chance a single rerolled die must have of succeeding before Momentum is spent on it.
const COVER_PREFERENCE = 2
const MOMENTUM_REROLL_MIN_CHANCE = 0.3
// The smallest rise in an ally's chance to hit that is worth an AP on Assist.
const MIN_ASSIST_GAIN = 0.05

const PROFILES = {
  enemy: { targeting: 'nearest', minorAction: 'coverThenAim', coverAfterAttack: false, assists: false },
  player: { targeting: 'bestShot', minorAction: 'tactical', coverAfterAttack: true, assists: true },
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const dieChance = (targetNumber) => Math.min(20, Math.max(0, targetNumber)) / 20

// Chance that at least `needed` of TASK_DICE dice succeed (binomial).
function passChance(targetNumber, needed) {
  if (needed <= 0) return 1
  const p = dieChance(targetNumber)
  const choose = (n, k) => (k === 0 || k === n ? 1 : choose(n - 1, k - 1) + choose(n - 1, k))
  let chance = 0
  for (let k = needed; k <= TASK_DICE; k++) chance += choose(TASK_DICE, k) * p ** k * (1 - p) ** (TASK_DICE - k)
  return chance
}

// Injury modes this combatant's AI may use with a weapon, in preference order.
// Enemies prefer Deadly (Klingon disruptors have nothing else). Player characters use Stun, and Deadly only if the encounter sets
// autoCombat.playerInjuryMode to "deadly".
export function injuryModesFor(state, self, weapon) {
  if (self.side === 'enemy') return weapon.injuryModes.includes('deadly') ? ['deadly'] : weapon.injuryModes
  const allowDeadly = getEncounter(state.encounterId).autoCombat?.playerInjuryMode === 'deadly'
  const preference = allowDeadly ? ['deadly', 'stun'] : ['stun']
  return preference.filter((mode) => weapon.injuryModes.includes(mode))
}

// A shot needing more successes than dice rolled cannot pass, so it does not count as usable.
export function bestShot(state, self, target, fromPosition) {
  const shots = self.weaponIds
    .filter((weaponId) => injuryModesFor(state, self, getWeapon(weaponId)).length)
    .map((weaponId) => previewAttack(state, self.id, target.id, weaponId, fromPosition))
    .filter((shot) => shot.available && shot.task.difficulty <= TASK_DICE)
  return shots.sort((a, b) => a.task.difficulty - b.task.difficulty || b.task.targetNumber - a.task.targetNumber)[0] ?? null
}

const byDistanceFrom = (position) => (a, b) => tileDistance(position, a.position) - tileDistance(position, b.position)

function nearestTarget(state, self) {
  return [...getOpponents(state, self)].sort(byDistanceFrom(self.position))[0] ?? null
}

// Player profile: the opponent offering the best shot right now, or null if nobody can be shot from here.
function bestShotTarget(state, self) {
  const options = getOpponents(state, self)
    .map((target) => ({ target, shot: bestShot(state, self, target) }))
    .filter((option) => option.shot)
  options.sort(
    (a, b) =>
      a.shot.task.difficulty - b.shot.task.difficulty ||
      Number(a.target.inCover) - Number(b.target.inCover) ||
      b.target.hits - a.target.hits ||
      tileDistance(self.position, a.target.position) - tileDistance(self.position, b.target.position),
  )
  return options[0] ?? null
}

// Exposed = at least one active opponent could shoot this combatant from where they stand now.
function threatsTo(state, self) {
  return getOpponents(state, self).filter((opponent) =>
    opponent.weaponIds.some((weaponId) => {
      const shot = previewAttack(state, opponent.id, self.id, weaponId)
      return shot.available && shot.task.difficulty <= TASK_DICE
    }),
  )
}

export const shotSummary = (shot) => `${shot.band.name} range, Difficulty ${shot.task.difficulty} with ${shot.weapon.name} (TN ${shot.task.targetNumber})`

function attackAction(state, self, target, shot) {
  return {
    type: 'attack',
    targetId: target.id,
    weaponId: shot.weapon.id,
    injuryMode: injuryModesFor(state, self, shot.weapon)[0],
    decision: `Target ${target.character.name}`,
    reason: `${shotSummary(shot)}; target ${target.inCover ? 'in cover (it rolls to raise the Difficulty)' : 'exposed'}, ${plural(target.hits, 'Hit')}.`,
  }
}

export function pendingStep(state, self) {
  const { pending } = state
  const { targetNumber, difficulty } = pending.task
  const { successes, passed } = evaluateAttack(pending)
  const failed = pending.dice.map((value, index) => ({ value, index })).filter((die) => die.value > targetNumber)
  const worst = failed.sort((a, b) => b.value - a.value)[0]
  if (!passed && worst) {
    const aimDie = failed.find((die) => canAimReroll(pending, die.index))
    if (aimDie) return { type: 'reroll', source: 'aim', dieIndex: aimDie.index, decision: 'Aim reroll', reason: `Attack failing; rerolling the failed ${aimDie.value}.` }
    // Only when one more success would pass and the new die has a fair chance of giving it.
    const chance = dieChance(targetNumber)
    if (self.side === 'player' && state.momentum && successes + 1 >= difficulty && chance >= MOMENTUM_REROLL_MIN_CHANCE) {
      return {
        type: 'reroll',
        source: 'momentum',
        dieIndex: worst.index,
        decision: 'Momentum reroll',
        reason: `One more success would hit; a new die succeeds ${Math.round(chance * 100)}% of the time (TN ${targetNumber}).`,
      }
    }
  }
  return { type: 'resolveAttack', decision: 'Resolve attack', reason: `${self.character.name} resolves the attack.` }
}

// After a hit: +1 Hit from Momentum only when it removes the target from the fight.
export function momentumHitStep(state, self) {
  const { result } = state
  if (self.side !== 'player' || !state.momentum || !result || result.kind === 'ambush' || result.closed || result.attackerId !== self.id || !result.passed || result.extraHit) return null
  const target = state.combatants[result.targetId]
  if (!isActive(target) || target.hits !== MAX_HITS - 1) return null
  return { type: 'spendMomentumHit', decision: 'Spend Momentum: +1 Hit', reason: `${target.character.name} has ${plural(target.hits, 'Hit')}; one more removes them from the fight.` }
}

// Threat adds +1 Difficulty to the party's next attack, which with two dice costs far more than a single reroll is worth,
// so Momentum cancels it whenever this character still has an attack to make.
export function cancelThreatStep(state, self) {
  if (self.side !== 'player' || !state.momentum || !state.threat || !state.turn.ap) return null
  return { type: 'cancelThreat', decision: 'Spend Momentum: cancel Threat', reason: 'Threat would add +1 Difficulty to the next attack.' }
}

// Best reachable tile to shoot one of the targets from (lower Difficulty, covered preferred, fewer steps); else close the distance.
// kind: 'move' or 'sprint' (the same choice at Sprint range).
function moveStep(state, self, targets, kind = 'move') {
  const reachable = [...getReachable(state, self, kind).values()].filter((entry) => entry.steps > 0)
  const verb = kind === 'sprint' ? 'Sprint' : 'Move'
  const firing = targets
    .flatMap((target) => reachable.map((entry) => ({ target, entry, shot: bestShot(state, self, target, entry.position), covered: canTakeCover(state.map, entry.position) })))
    .filter((option) => option.shot)
    .map((option) => ({ ...option, score: option.shot.task.difficulty * 10 - (option.covered ? COVER_PREFERENCE : 0) + option.entry.steps }))
    .sort((a, b) => a.score - b.score)
  if (firing.length) {
    const { target, entry, shot, covered } = firing[0]
    return {
      type: kind,
      destination: entry.position,
      targetId: target.id,
      weaponId: shot.weapon.id,
      decision: `${verb} to a ${covered ? 'covered' : 'exposed'} firing position on ${target.character.name}`,
      reason: `No shot from here; ${plural(entry.steps, 'tile')} away a shot is ${shotSummary(shot)}.`,
    }
  }
  const target = [...targets].sort(byDistanceFrom(self.position))[0]
  if (!target) return null
  // No firing position this turn: step to the reachable tile with the shortest walking distance to the target.
  const toward = getReachableTiles(state.map, target.position, state.map.width * state.map.height, { blockedKeys: getBlockers(state, self).blockedKeys })
  const closest = reachable
    .map((entry) => ({ entry, remaining: toward.get(tileKey(entry.position))?.steps ?? Infinity }))
    .sort((a, b) => a.remaining - b.remaining || a.entry.steps - b.entry.steps)[0]
  if (!closest || closest.remaining === Infinity) return null
  return {
    type: kind,
    destination: closest.entry.position,
    targetId: target.id,
    decision: `${kind === 'sprint' ? 'Sprint to close' : 'Close'} on ${target.character.name}`,
    reason: 'No firing position within reach this turn.',
  }
}

// Cover is automatic next to a cover object, so getting into cover means moving there. Nearest such tile that still has a
// shot at the target no worse than the current one, or null.
function moveIntoCoverWithShot(state, self, target, shot, why) {
  if (self.inCover || !canMove(state, self)) return null
  const covered = [...getReachable(state, self).values()]
    .filter((entry) => entry.steps > 0 && canTakeCover(state.map, entry.position))
    .map((entry) => ({ entry, shot: bestShot(state, self, target, entry.position) }))
    .filter((option) => option.shot && option.shot.task.difficulty <= shot.task.difficulty)
    .sort((a, b) => a.entry.steps - b.entry.steps || a.shot.task.difficulty - b.shot.task.difficulty)[0]
  if (!covered) return null
  return {
    type: 'move',
    destination: covered.entry.position,
    targetId: target.id,
    weaponId: shot.weapon.id,
    decision: 'Move into cover',
    reason: `${why}; ${plural(covered.entry.steps, 'tile')} away is next to cover and still has a shot (${shotSummary(covered.shot)}).`,
  }
}

// After attacking with AP left: Move into the nearest cover.
function coverAfterAttackStep(state, self) {
  if (self.inCover || !canMove(state, self)) return null
  const covered = [...getReachable(state, self).values()]
    .filter((entry) => entry.steps > 0 && canTakeCover(state.map, entry.position))
    .sort((a, b) => a.steps - b.steps)[0]
  if (!covered) return null
  return { type: 'move', destination: covered.position, decision: 'Move into cover', reason: `Attack made; ${plural(covered.steps, 'tile')} away is next to cover.` }
}

// Chance a shot hits, counting a target in cover as one Difficulty harder (its cover roll usually raises it).
export function expectedChance(state, attackerId, shot) {
  const task = shot.targetInCover ? { ...shot.task, difficulty: shot.task.difficulty + 1 } : shot.task
  return getHitChance(state, attackerId, { ...shot, task })
}

// Assist the ally (who can still attack this round) whose chance to hit it raises most, judged on their best shot from
// where they stand, else from a firing position they can walk to. Chosen only when that gain beats ownChance, the
// chance of this character's own attack (0 = no shot). An assist die only adds a success the ally still needs, so it
// mostly pays at Difficulty 2+. Only party members share a turn, so only the player profile assists.
function assistStep(state, self, ownChance) {
  if (!PROFILES[self.side].assists || !canAfford(state, self, 'assist')) return null
  const assisted = (allyId) => ({ ...state, assists: { ...state.assists, [allyId]: self.id } })
  const options = getAssistableAllies(state, self)
    .map((ally) => {
      const here = bestShotTarget(state, ally)
      const move = here ? null : moveStep(state, ally, getOpponents(state, ally))
      const shot = here?.shot ?? (move?.weaponId ? previewAttack(state, ally.id, move.targetId, move.weaponId, move.destination) : null)
      if (!shot) return null
      return { ally, shot, gain: expectedChance(assisted(ally.id), ally.id, shot) - expectedChance(state, ally.id, shot) }
    })
    .filter(Boolean)
    .sort((a, b) => b.gain - a.gain)
  const best = options[0]
  if (!best || best.gain < MIN_ASSIST_GAIN || best.gain <= ownChance) return null
  const name = best.ally.character.name
  const own = ownChance ? `its own shot hits ${Math.round(ownChance * 100)}%` : 'no shot of its own'
  return {
    type: 'assist',
    allyId: best.ally.id,
    decision: `Assist ${name}`,
    reason: `${own}; +1d20 raises ${name}'s chance by ${Math.round(best.gain * 100)}% (${shotSummary(best.shot)}${best.shot.targetInCover ? ', target in cover' : ''}).`,
  }
}

// Player profile preparation before shooting (with AP for both), or null to attack straight away.
function tacticalMinor(state, self, target, shot) {
  const threats = self.inCover ? [] : threatsTo(state, self)
  const planned = { targetId: target.id, weaponId: shot.weapon.id }
  if (threats.length) {
    const move = moveIntoCoverWithShot(state, self, target, shot, `Exposed to fire from ${threats.map((threat) => threat.character.name).join(', ')}`)
    if (move) return move
  }
  if (passChance(shot.task.targetNumber, shot.task.difficulty) < 1) {
    return { type: 'aim', ...planned, decision: 'Aim', reason: `Shot is not certain (${shotSummary(shot)}); Aim allows one reroll.` }
  }
  return null
}

export function nextAIStep(state) {
  const self = getActiveCombatant(state)
  const profile = PROFILES[self.side]
  if (state.pending) return pendingStep(state, self)
  const extraHit = momentumHitStep(state, self)
  if (extraHit) return extraHit

  if (!state.turn.ap) return { type: 'endTurn', decision: 'End turn', reason: 'No AP left.' }
  const cancel = cancelThreatStep(state, self)
  if (cancel) return cancel

  const nearest = nearestTarget(state, self)
  if (!nearest) return { type: 'endTurn', decision: 'End turn', reason: 'No targets left.' }
  const choice = profile.targeting === 'nearest' ? { target: nearest, shot: bestShot(state, self, nearest) } : bestShotTarget(state, self)

  if (choice?.shot) {
    const { target, shot } = choice
    const assist = assistStep(state, self, expectedChance(state, self.id, shot))
    if (assist) return assist
    // With AP for both, one goes on preparing the shot (cover or Aim) and the last on the attack.
    if (state.turn.ap > 1 && !state.turn.attacks) {
      if (profile.minorAction === 'coverThenAim') {
        const planned = { targetId: target.id, weaponId: shot.weapon.id }
        const move = moveIntoCoverWithShot(state, self, target, shot, `${target.character.name} is in range (${shot.band.name})`)
        if (move) return move
        return { type: 'aim', ...planned, decision: 'Aim', reason: `${target.character.name} is in range (${shot.band.name}); aiming before firing.` }
      }
      const minor = tacticalMinor(state, self, target, shot)
      if (minor) return minor
    }
    // After attacking with AP left, the player profile first gets into cover; otherwise it attacks again.
    if (state.turn.attacks && profile.coverAfterAttack) {
      const cover = coverAfterAttackStep(state, self)
      if (cover) return cover
    }
    return attackAction(state, self, target, shot)
  }
  // No shot from here: walk to a firing position, else close the distance; with no move left, Assist an ally instead,
  // else Sprint (still unused this turn) on the same terms.
  const targets = profile.targeting === 'nearest' ? [nearest] : getOpponents(state, self)
  const move = canMove(state, self) ? moveStep(state, self, targets) : null
  if (move) return move
  const assist = assistStep(state, self, 0)
  if (assist) return assist
  const sprint = canSprint(state, self) ? moveStep(state, self, targets, 'sprint') : null
  if (sprint) return sprint
  return { type: 'endTurn', decision: 'End turn', reason: `No shot at ${nearest.character.name} this turn.` }
}
