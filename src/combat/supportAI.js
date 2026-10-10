// Support actions for every party AI in Auto Combat (designer request, Oct 2026): Scan, Persuade, Intimidate, First Aid,
// Guard and Direct. Each option is judged in the same units as an attack (a hit = 1, taking a combatant out of the fight or
// bringing one back = REMOVAL_VALUE) from the same previews the buttons use, and supportStep takes the best one only when
// it beats this character's own best attack. Party only: enemies keep their own AI. All weights are AI tuning, not rules.
import { canMove, getReachable } from './combatMovement.js'
import { canAfford, canAim, getCombatantList, getOpponents, isActive } from './combatSelectors.js'
import { getHitChance } from './combatAttacks.js'
import { directBlock, getDirectableAllies, getFirstAidOptions, getGuardTargets, previewFirstAid, previewGuard, previewScan } from './combatTasks.js'
import { previewSocial, SOCIAL_KINDS, socialChance } from './combatSocial.js'
import { bestShot, hitDefeats } from './combatAI.js'
import { tileDistance } from './rangeSystem.js'
import { freshTurn } from './turnActions.js'
import { remainingStress, wouldDieAtSceneEnd } from '../rules/personalCondition.js'
import { staTaskChance, TASK_DICE } from '../rules/taskResolver.js'

// A combatant out of the fight (Defeated or surrendered), against 1 for an ordinary hit.
const REMOVAL_VALUE = 2
// A Defeated ally back in the fight (still injured, and only from their next turn).
const REVIVE_VALUE = 1.5
// A won Persuade / Intimidate that only costs the enemy Stress: a step toward surrender.
const STRESS_VALUE = 0.4
// A scan pays off only from later shots, while the enemies keep shooting meanwhile: its gain is counted at this share.
const SCAN_WEIGHT = 0.75
// A hit the party avoids counts for less than one it lands (a party member can usually avoid the Injury with Stress,
// and guarding never ends the fight).
const GUARD_WEIGHT = 0.5
// How likely an enemy is to shoot the guarded character: the enemy AI shoots its nearest party member.
const NEAREST_TARGET_ODDS = 1
const OTHER_TARGET_ODDS = 0.3
// Treating an Injury: its penalty goes; a dying ally's Deadly Injury treated keeps them alive (wouldDieAtSceneEnd).
const TREAT_VALUE = 0.4
const TREAT_DYING_VALUE = 1
// Direct spends 1 Momentum from the group pool.
const DIRECT_MOMENTUM_COST = 0.3
// Below this a support action is never worth the Major action.
const MIN_SUPPORT_VALUE = 0.15
// A shot from a tile the character must first walk to is worth a little less than one from here.
const MOVE_DISCOUNT = 0.9

const pct = (chance) => `${Math.round(chance * 100)}%`
const party = (state, self) => getCombatantList(state).filter((other) => other.side === self.side && isActive(other))
const taskChance = (preview) => staTaskChance({ task: preview.task, difficulty: preview.task.difficulty, assistTask: preview.assist?.task ?? null })
const hitValue = (state, attacker, target, shot) => (hitDefeats(state, attacker, target, shot) ? REMOVAL_VALUE : 1)

// This combatant's best attack value: from here (after Aim, with the Minor action free), else from a tile it can walk to.
export function ownAttackValue(state, self) {
  if (!canAfford(state, self, 'attack')) return 0
  const valueFrom = (position) => {
    const judged = position === undefined && canAim(state, self) ? { ...state, turn: { ...state.turn, aimReroll: true } } : state
    return Math.max(
      0,
      ...getOpponents(state, self).map((target) => {
        const shot = bestShot(state, self, target, position)
        return shot ? getHitChance(judged, self.id, shot) * hitValue(state, self, target, shot) : 0
      }),
    )
  }
  const here = valueFrom(undefined)
  if (here > 0 || !canMove(state, self) || state.turn.minor <= 0) return here
  const tiles = [...getReachable(state, self).values()].filter((entry) => entry.steps > 0)
  return MOVE_DISCOUNT * Math.max(0, ...tiles.map((entry) => valueFrom(entry.position)))
}

// Scan: the party's extra chance to hit this enemy once it carries the scan trait, for each member with a shot now.
function scanOptions(state, self) {
  return getOpponents(state, self).flatMap((target) => {
    const preview = previewScan(state, self.id, target.id)
    if (!preview.available) return []
    const scanned = { ...state, scanned: { ...state.scanned, [target.id]: true } }
    const gain = party(state, self).reduce((total, member) => {
      const before = bestShot(state, member, target)
      const after = bestShot(scanned, member, target)
      if (!after) return total
      const chance = getHitChance(scanned, member.id, after) - (before ? getHitChance(state, member.id, before) : 0)
      return total + Math.max(0, chance) * hitValue(state, member, target, after)
    }, 0)
    const chance = taskChance(preview)
    return [
      {
        value: chance * gain * SCAN_WEIGHT,
        action: { type: 'scan', targetId: target.id, decision: `Scan ${target.character.name}` },
        reason: `${pct(chance)} to scan; Weak Point Located would add ${gain.toFixed(2)} expected hits a round across the party.`,
      },
    ]
  })
}

// Persuade / Intimidate: a win makes an enemy with no Stress left surrender, else it only costs it Stress.
function socialOptions(state, self) {
  return getOpponents(state, self).flatMap((target) =>
    SOCIAL_KINDS.map((kind) => {
      const preview = previewSocial(state, self.id, target.id, kind)
      if (!preview.available) return null
      const chance = socialChance(preview, TASK_DICE)
      const surrenders = remainingStress(target.character, target.condition) <= 0
      const verb = kind === 'persuade' ? 'Persuade' : 'Intimidate'
      return {
        value: chance * (surrenders ? REMOVAL_VALUE : STRESS_VALUE),
        action: { type: kind, targetId: target.id, decision: `${verb} ${target.character.name}` },
        reason: `${pct(chance)} to win; ${surrenders ? 'it has no Stress left, so a win makes it surrender' : 'a win costs it Stress'}.`,
      }
    }).filter(Boolean),
  )
}

// First Aid on an ally within Reach: revive a Defeated ally, or treat an Injury (a dying ally's Deadly one first).
function firstAidOptions(state, self) {
  return getFirstAidOptions(state, self).flatMap((option) => {
    const preview = previewFirstAid(state, self.id, option.target.id, option.mode)
    if (!preview.available) return []
    const chance = taskChance(preview)
    const dying = option.injury && option.injury.type === 'deadly' && wouldDieAtSceneEnd(option.target.condition)
    const worth = option.mode === 'revive' ? REVIVE_VALUE : dying ? TREAT_DYING_VALUE : TREAT_VALUE
    return [
      {
        value: chance * worth,
        action: { type: 'firstAid', targetId: option.target.id, mode: option.mode, decision: option.label },
        reason: `${pct(chance)} to succeed${dying ? '; without it they die at the end of the scene' : ''}.`,
      },
    ]
  })
}

// With the Minor action free: walk next to a Defeated ally who isn't within Reach, to revive them with the Major action.
function reachDownedAllyOption(state, self) {
  if (!canMove(state, self) || state.turn.minor <= 0 || !canAfford(state, self, 'firstAid')) return null
  const downed = getCombatantList(state).filter((other) => other.side === self.side && other.id !== self.id && !isActive(other))
  const tiles = [...getReachable(state, self).values()].filter((entry) => entry.steps > 0)
  let best = null
  for (const ally of downed) {
    const entry = tiles.filter((tile) => Math.max(Math.abs(tile.position.x - ally.position.x), Math.abs(tile.position.y - ally.position.y)) <= 1).sort((a, b) => a.steps - b.steps)[0]
    if (!entry) continue
    const moved = { ...state, combatants: { ...state.combatants, [self.id]: { ...self, position: entry.position } } }
    const preview = previewFirstAid(moved, self.id, ally.id, 'revive')
    if (!preview.available) continue
    const chance = taskChance(preview)
    const value = MOVE_DISCOUNT * chance * REVIVE_VALUE
    if (!best || value > best.value) {
      best = {
        value,
        action: { type: 'move', destination: entry.position, decision: `Move next to ${ally.character.name}` },
        reason: `To revive ${ally.character.name} with First Aid (${pct(chance)}) after moving ${entry.steps} tile${entry.steps === 1 ? '' : 's'}.`,
      }
    }
  }
  return best
}

// Guard yourself or an ally within Reach: how much it lowers the chance of each opponent who can shoot them now, weighted
// by how likely that opponent is to pick them.
function guardOptions(state, self) {
  const members = party(state, self)
  return getGuardTargets(state, self).flatMap((ally) => {
    const preview = previewGuard(state, self.id, ally.id)
    if (!preview.available) return []
    const guarded = { ...state, combatants: { ...state.combatants, [ally.id]: { ...ally, guard: { byId: self.id, round: state.round } } } }
    const saved = getOpponents(state, ally).reduce((total, opponent) => {
      const before = bestShot(state, opponent, ally)
      if (!before) return total
      const after = bestShot(guarded, opponent, ally)
      const distance = tileDistance(opponent.position, ally.position)
      const odds = members.every((member) => tileDistance(opponent.position, member.position) >= distance) ? NEAREST_TARGET_ODDS : OTHER_TARGET_ODDS
      return total + odds * (getHitChance(state, opponent.id, before) - (after ? getHitChance(guarded, opponent.id, after) : 0))
    }, 0)
    const chance = taskChance(preview)
    const who = ally.id === self.id ? 'itself' : ally.character.name
    return [
      {
        value: chance * saved * GUARD_WEIGHT,
        action: { type: 'guard', targetId: ally.id, decision: ally.id === self.id ? 'Guard' : `Guard ${ally.character.name}` },
        reason: `${pct(chance)} to Guard ${who}; lowers the enemies' expected hits on them by ${saved.toFixed(2)}.`,
      },
    ]
  })
}

// Direct (the character in authority, 1 Momentum): an ally takes a Major action now, assisted by the commander. Judged on
// that ally's best attack from where they stand (a directed ally has no Minor action to move).
function directOptions(state, self) {
  if (directBlock(state, self)) return []
  return getDirectableAllies(state, self).flatMap((ally) => {
    const directed = { ...state, directed: { commanderId: self.id, allyId: ally.id, commanderTurn: state.turn }, turn: { ...freshTurn(), major: 1, minor: 0 } }
    const options = getOpponents(directed, ally)
      .map((target) => ({ target, shot: bestShot(directed, ally, target) }))
      .filter((option) => option.shot)
      .map((option) => ({ ...option, chance: getHitChance(directed, ally.id, option.shot) }))
      .map((option) => ({ ...option, value: option.chance * hitValue(directed, ally, option.target, option.shot) }))
      .sort((a, b) => b.value - a.value)
    const best = options[0]
    if (!best) return []
    return [
      {
        value: best.value - DIRECT_MOMENTUM_COST,
        action: { type: 'direct', allyId: ally.id, decision: `Direct ${ally.character.name}` },
        reason: `1 Momentum: ${ally.character.name} shoots ${best.target.character.name} now with ${self.character.name}'s assist (${pct(best.chance)}).`,
      },
    ]
  })
}

// Every support option for this combatant now, best first: [{ value, action, reason }].
export function supportOptions(state, self) {
  if (self.side !== 'player' || state.pending || state.turn.major <= 0) return []
  const options = [...scanOptions(state, self), ...socialOptions(state, self), ...firstAidOptions(state, self), ...guardOptions(state, self), ...directOptions(state, self)]
  const walk = reachDownedAllyOption(state, self)
  if (walk) options.push(walk)
  return options.sort((a, b) => b.value - a.value)
}

// The best support action when it beats this character's own attack, else null. Not after Aim (the Aim would be wasted).
export function supportStep(state, self) {
  if (self.side !== 'player' || state.pending || state.turn.major <= 0 || state.turn.aimed) return null
  const best = supportOptions(state, self)[0]
  if (!best || best.value < MIN_SUPPORT_VALUE) return null
  const own = ownAttackValue(state, self)
  if (best.value <= own) return null
  const versus = own ? `its own best attack is worth ${own.toFixed(2)}` : 'no shot of its own'
  return { ...best.action, reason: `${best.reason} Worth ${best.value.toFixed(2)}; ${versus}.` }
}
