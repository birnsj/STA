// One tactical AI for every AI-controlled combatant: enemies always, and player characters during Auto Combat.
// It only returns ordinary combat actions and only reads the real combat state (the character's own Attributes, Disciplines,
// weapons, movement, range, cover, Momentum and Threat), so it plays by exactly the rules a human player does.
// nextAIStep is called once per step; the caller applies the action and calls it again on the new state.
//
// Profiles:
// Cover is automatic next to a cover object (no Take Cover action), so "taking cover" always means moving there.
// Both profiles have one Major and one Minor action a turn (Book p.288; actions.json). Neither uses Guard, First Aid,
// Direct or challenge objects yet.
// - enemy: designer spec v1 enemy AI. Nearest target; attack if a shot is available (with the Minor action free, first
//   moving into cover if a covered tile keeps the shot, else aiming); otherwise move to the best reachable firing position
//   (lower Difficulty, covered preferred, fewer steps); otherwise close the distance. Prefers Deadly.
// - player (Auto Combat spec): best available shot across all enemies (lowest Difficulty, exposed, a hit that would
//   Defeat (no Avoid Injury possible), nearest);
//   with the Minor action free, when exposed to fire, move next to cover if a shot is still available from there,
//   otherwise Aim when it can still change the result; after attacking, move into cover with the Minor action if
//   possible; with no shot and no move left, Assist the ally with the best shot; Stun unless the encounter allows Deadly.
// Threat (designer decision, Oct 2026: enemies spend it): the enemy profile buys bonus d20s for a doubtful shot, an
// Extra Minor to Aim after moving into cover, and a Second Major for another shot after attacking, all paid in Threat
// (Book p.265, p.324). When it does so is AI tuning (thresholds below). The party profile buys nothing.
import { tileKey } from './battleMap.js'
import { canTakeCover } from './coverSystem.js'
import { getReachableTiles } from './movementSystem.js'
import { tileDistance } from './rangeSystem.js'
import { getCombatantWeapon } from './weaponSystem.js'
import {
  actionsLeft,
  ADAPTATION_MOMENTUM_SPENDS,
  canAfford,
  canAimReroll,
  canAssistReroll,
  canMove,
  canSprint,
  evaluateAttack,
  EXTRA_ACTIONS,
  extraMinorBlock,
  getActiveCombatant,
  getAssistableAllies,
  getBlockers,
  getCombatantList,
  getHitChance,
  getOpponents,
  getReachable,
  injuryFor,
  isActive,
  previewAttack,
  secondMajorBlock,
  statusText,
} from './combatState.js'
import { getEncounter } from './encounters.js'
import { bonusDiceCost, MAX_BONUS_DICE } from '../rules/missionResources.js'
import { getAvoidOption, npcCategoryOf } from '../rules/personalCondition.js'
import { staDieOdds, TASK_DICE } from '../rules/taskResolver.js'

// AI tuning (implementation detail, not rules): how much a covered firing position is worth in Difficulty steps x10,
// and the lowest chance a single rerolled die must have of succeeding before Momentum is spent on it.
const COVER_PREFERENCE = 2
const MOMENTUM_REROLL_MIN_CHANCE = 0.3
// The smallest rise in an ally's chance to hit that is worth the Major action on Assist.
const MIN_ASSIST_GAIN = 0.05
// Enemy Threat spending (AI tuning): bonus d20s are bought while the chance to hit is below DICE_TARGET_CHANCE and each
// die adds at least MIN_DIE_GAIN; a Second Major is bought when the second shot (at +1 Difficulty) hits at least
// SECOND_SHOT_MIN_CHANCE. While a Notable or Major NPC is still fighting, AVOID_RESERVE Threat is kept for its Avoid
// Injury (it costs the Injury's Severity; 4 is a Type-2 Phaser's).
const DICE_TARGET_CHANCE = 0.75
const MIN_DIE_GAIN = 0.05
const SECOND_SHOT_MIN_CHANCE = 0.4
const AVOID_RESERVE = 4

const PROFILES = {
  enemy: { targeting: 'nearest', minorAction: 'coverThenAim', coverAfterAttack: false, assists: false, spendsThreat: true },
  player: { targeting: 'bestShot', minorAction: 'tactical', coverAfterAttack: true, assists: true, spendsThreat: false },
}

// Threat this combatant's side may spend now, after the reserve for Avoid Injury.
function spendableThreat(state, self) {
  const needsReserve = getCombatantList(state).some(
    (combatant) => combatant.side === self.side && isActive(combatant) && ['notable', 'major'].includes(npcCategoryOf(combatant.character)),
  )
  return Math.max(0, state.resources.threat - (needsReserve ? AVOID_RESERVE : 0))
}

// Bonus d20s to buy with Threat for this shot: { bonusDice, chance, cost } (bonusDice 0 = none).
function threatDice(state, self, shot) {
  let best = { bonusDice: 0, chance: getHitChance(state, self.id, shot), cost: 0 }
  if (!PROFILES[self.side].spendsThreat) return best
  const budget = spendableThreat(state, self)
  for (let bonusDice = 1; bonusDice <= MAX_BONUS_DICE && best.chance < DICE_TARGET_CHANCE; bonusDice++) {
    const cost = bonusDiceCost(bonusDice)
    if (cost > budget) break
    const chance = getHitChance(state, self.id, shot, { bonusDice })
    if (chance - best.chance < MIN_DIE_GAIN) break
    best = { bonusDice, chance, cost }
  }
  return best
}

// After moving into cover the Minor action is gone: buy an Extra Minor with Threat to Aim before the shot.
function extraMinorStep(state, self, target, shot) {
  const { turn } = state
  if (!PROFILES[self.side].spendsThreat || turn.minor > 0 || turn.major <= 0 || turn.attacks || turn.aimed) return null
  if (extraMinorBlock(state, self) || spendableThreat(state, self) < EXTRA_ACTIONS.extraMinorCost) return null
  if (getHitChance(state, self.id, shot) >= 1) return null
  return {
    type: 'buyExtraMinor',
    targetId: target.id,
    weaponId: shot.weapon.id,
    decision: 'Spend Threat: extra minor action',
    reason: `${EXTRA_ACTIONS.extraMinorCost} Threat to Aim at ${target.character.name} (${shotSummary(shot)}).`,
  }
}

// After attacking: buy a Second Major with Threat for another shot, when that shot (at +1 Difficulty) is worth it.
function secondMajorStep(state, self, target) {
  if (!PROFILES[self.side].spendsThreat || !state.turn.attacks || state.turn.major > 0) return null
  if (secondMajorBlock(state, self) || spendableThreat(state, self) < EXTRA_ACTIONS.secondMajorCost) return null
  const bought = { ...state, turn: { ...state.turn, major: 1, secondMajor: true } }
  const shot = bestShot(bought, self, target)
  if (!shot) return null
  const chance = getHitChance(bought, self.id, shot)
  if (chance < SECOND_SHOT_MIN_CHANCE) return null
  return {
    type: 'buySecondMajor',
    decision: 'Spend Threat: second major action',
    reason: `${EXTRA_ACTIONS.secondMajorCost} Threat for another shot at ${target.character.name}: ${shotSummary(shot)}, ${Math.round(chance * 100)}% to hit.`,
  }
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

// Injury modes this combatant's AI may use with a weapon, in preference order.
// Enemies prefer Deadly (Klingon disruptors have nothing else). Player characters use Stun, and Deadly only if the encounter sets
// autoCombat.playerInjuryMode to "deadly".
export function injuryModesFor(state, self, weapon) {
  if (self.side === 'enemy') return weapon.injuryModes.includes('deadly') ? ['deadly'] : weapon.injuryModes
  const allowDeadly = getEncounter(state.encounterId).autoCombat?.playerInjuryMode === 'deadly'
  const preference = allowDeadly ? ['deadly', 'stun'] : ['stun']
  return preference.filter((mode) => weapon.injuryModes.includes(mode))
}

// AI tuning (not a rule): a shot needing more successes than dice rolled can only pass on critical successes, so the AI
// doesn't count it as usable and looks for a better position instead.
export function bestShot(state, self, target, fromPosition) {
  const shots = self.weaponIds
    .filter((weaponId) => injuryModesFor(state, self, getCombatantWeapon(self, weaponId)).length)
    .map((weaponId) => previewAttack(state, self.id, target.id, weaponId, fromPosition))
    .filter((shot) => shot.available && shot.task.difficulty <= TASK_DICE)
  return shots.sort((a, b) => a.task.difficulty - b.task.difficulty || b.task.targetNumber - a.task.targetNumber)[0] ?? null
}

// Whether a hit with this shot would Defeat the target: the same Injury and Avoid Injury rules the resolver uses (a Minor
// NPC always; a main character without the Stress left to avoid it; an NPC without the Threat).
export function hitDefeats(state, self, target, shot) {
  const injury = injuryFor(state, self, target, shot.weapon, injuryModesFor(state, self, shot.weapon)[0])
  return !getAvoidOption(target.character, target.condition, injury, { threat: state.resources.threat, avoidedThisScene: state.avoidedThisScene }).possible
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
      Number(hitDefeats(state, self, b.target, b.shot)) - Number(hitDefeats(state, self, a.target, a.shot)) ||
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
  const dice = threatDice(state, self, shot)
  const bought = dice.bonusDice
    ? `; buys ${plural(dice.bonusDice, 'bonus d20')} for ${dice.cost} Threat (${Math.round(dice.chance * 100)}% to hit)`
    : ''
  return {
    type: 'attack',
    targetId: target.id,
    weaponId: shot.weapon.id,
    injuryMode: injuryModesFor(state, self, shot.weapon)[0],
    ...(dice.bonusDice ? { purchase: { bonusDice: dice.bonusDice, momentum: 0 } } : {}),
    decision: `Target ${target.character.name}`,
    reason: `${shotSummary(shot)}; target ${target.inCover ? 'in cover (it rolls to raise the Difficulty)' : 'exposed'}, ${statusText(target)}${hitDefeats(state, self, target, shot) ? '; a hit Defeats' : ''}${bought}.`,
  }
}

export function pendingStep(state, self) {
  const { pending } = state
  const { targetNumber, difficulty } = pending.task
  const { successes, success } = evaluateAttack(pending)
  const failed = pending.dice.map((value, index) => ({ value, index })).filter((die) => die.value > targetNumber)
  const worst = failed.sort((a, b) => b.value - a.value)[0]
  if (!success && worst) {
    const aimDie = failed.find((die) => canAimReroll(pending, die.index))
    if (aimDie) return { type: 'reroll', source: 'aim', dieIndex: aimDie.index, decision: 'Aim reroll', reason: `Attack failing; rerolling the failed ${aimDie.value}.` }
    if (canAssistReroll(pending)) return { type: 'reroll', source: 'assist', dieIndex: worst.index, decision: 'Student of War reroll', reason: `Attack failing; rerolling the failed ${worst.value}.` }
    // Only when one new die could pass (a success, or a critical when 2 are missing) with a fair chance.
    const [, single, critical] = staDieOdds(pending.task)
    const needed = difficulty - successes
    const chance = needed <= 1 ? single + critical : needed === 2 ? critical : 0
    if (ADAPTATION_MOMENTUM_SPENDS && self.side === 'player' && state.resources.momentum > 0 && chance >= MOMENTUM_REROLL_MIN_CHANCE) {
      return {
        type: 'reroll',
        source: 'momentum',
        dieIndex: worst.index,
        decision: 'Momentum reroll',
        reason: `A new die would hit ${Math.round(chance * 100)}% of the time (TN ${targetNumber}, ${plural(needed, 'success')} missing).`,
      }
    }
  }
  return { type: 'resolveAttack', decision: 'Resolve attack', reason: `${self.character.name} resolves the attack.` }
}

// The AI never spends Momentum to cancel Threat (AI tuning; the spend is an adaptation, off by default). Kept as a step
// so the planners' order of checks stays the same.
export function cancelThreatStep() {
  return null
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

// After attacking with the Minor action left: Move into the nearest cover.
function coverAfterAttackStep(state, self) {
  if (self.inCover || !canMove(state, self)) return null
  const covered = [...getReachable(state, self).values()]
    .filter((entry) => entry.steps > 0 && canTakeCover(state.map, entry.position))
    .sort((a, b) => a.steps - b.steps)[0]
  if (!covered) return null
  return { type: 'move', destination: covered.position, decision: 'Move into cover', reason: `Attack made; ${plural(covered.steps, 'tile')} away is next to cover.` }
}

// Chance a shot hits, the target's opposed roll (cover, or defending in melee) included.
export const expectedChance = (state, attackerId, shot) => getHitChance(state, attackerId, shot)

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

// Player profile preparation before shooting (with the Minor action still free), or null to attack straight away.
function tacticalMinor(state, self, target, shot) {
  const threats = self.inCover ? [] : threatsTo(state, self)
  const planned = { targetId: target.id, weaponId: shot.weapon.id }
  if (threats.length) {
    const move = moveIntoCoverWithShot(state, self, target, shot, `Exposed to fire from ${threats.map((threat) => threat.character.name).join(', ')}`)
    if (move) return move
  }
  if (getHitChance(state, self.id, shot) < 1) {
    return { type: 'aim', ...planned, decision: 'Aim', reason: `Shot is not certain (${shotSummary(shot)}); Aim allows one reroll.` }
  }
  return null
}

export function nextAIStep(state) {
  const self = getActiveCombatant(state)
  const profile = PROFILES[self.side]
  if (state.pending) return pendingStep(state, self)

  if (!actionsLeft(state.turn)) return { type: 'endTurn', decision: 'End turn', reason: 'No actions left.' }
  const cancel = cancelThreatStep(state, self)
  if (cancel) return cancel

  const nearest = nearestTarget(state, self)
  if (!nearest) return { type: 'endTurn', decision: 'End turn', reason: 'No targets left.' }
  const choice = profile.targeting === 'nearest' ? { target: nearest, shot: bestShot(state, self, nearest) } : bestShotTarget(state, self)

  if (choice?.shot) {
    const { target, shot } = choice
    const assist = assistStep(state, self, expectedChance(state, self.id, shot))
    if (assist) return assist
    // With the Minor action still free, it goes on preparing the shot (cover or Aim) before the attack (the Major action).
    if (state.turn.minor > 0 && state.turn.major > 0 && !state.turn.attacks) {
      if (profile.minorAction === 'coverThenAim') {
        const planned = { targetId: target.id, weaponId: shot.weapon.id }
        const move = moveIntoCoverWithShot(state, self, target, shot, `${target.character.name} is in range (${shot.band.name})`)
        if (move) return move
        return { type: 'aim', ...planned, decision: 'Aim', reason: `${target.character.name} is in range (${shot.band.name}); aiming before firing.` }
      }
      const minor = tacticalMinor(state, self, target, shot)
      if (minor) return minor
    }
    const extraMinor = extraMinorStep(state, self, target, shot)
    if (extraMinor) return extraMinor
    const secondMajor = secondMajorStep(state, self, target)
    if (secondMajor) return secondMajor
    // After attacking with the Minor action left, the player profile gets into cover; there is no second attack.
    if (state.turn.attacks && profile.coverAfterAttack) {
      const cover = coverAfterAttackStep(state, self)
      if (cover) return cover
    }
    if (canAfford(state, self, 'attack')) return attackAction(state, self, target, shot)
    return { type: 'endTurn', decision: 'End turn', reason: 'Major action used; nothing useful left for the Minor action.' }
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
