// Shooting destructible objects in Auto Combat (designer decision, 2026-10-12: both sides may, and avoid blasts that
// would catch their own side). A shot is weighed like an attack: its chance to land times what the blast it sets off
// (chain reactions included) would do to the opponents it reaches, plus the lingering hazard it leaves under them. With
// the Minor action free, a combatant may first walk to a tile with a line of fire, never one inside the blast. The
// weights are AI tuning, not rules.
import { blastActors, previewObjectAttack, standingObjects } from './combatEnvironment.js'
import { avoidOptionFor } from './combatInjuries.js'
import { canMove } from './combatMovement.js'
import { canAfford, getOpponents, isActive } from './combatSelectors.js'
import { safeReachable } from './hazardAvoidance.js'
import { ownAttackValue } from './supportAI.js'
import { blastReaches, damageObject, hazardAt, injuryFromHit } from '../world/environment.js'
import { staTaskChance } from '../rules/taskResolver.js'

// An opponent the blast would Defeat (they couldn't avoid it), against 1 for an ordinary hit; one who could avoid it pays
// Stress instead, worth this much.
const REMOVAL_VALUE = 2
const AVOIDABLE_VALUE = 0.5
// An opponent left standing in the hazard the blast leaves (hurt next round unless they spend their move getting out),
// per point of the hazard's Severity; one of the shooter's own side standing in it counts the same against.
const HAZARD_VALUE = 0.15
// A shot that only damages the object counts for its share of the Structure left, discounted for the shots still to come.
const PARTIAL_DISCOUNT = 0.5
// A shot from a tile the shooter must first walk to is worth a little less than one from here (as supportAI.js).
const MOVE_DISCOUNT = 0.9
// Below this a shot isn't worth the Major action, even with no attack of one's own (better to close in).
const MIN_SHOT_VALUE = 0.15

const pct = (chance) => `${Math.round(chance * 100)}%`
const chebyshev = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

// What destroying this object now would do: { value, caught: names of opponents hit, alliesCaught, explosions,
// environment } (null: no blast). The shooter is left out of the blast here; where they stand is checked per tile.
function blastValue(state, self, record) {
  const actors = blastActors(state).filter((actor) => actor.id !== self.id)
  const result = damageObject(state.environment, state.map, record.id, record.structure, actors)
  if (!result.explosions.length) return null
  const opponents = new Set(getOpponents(state, self).map((opponent) => opponent.id))
  let value = 0
  let alliesCaught = 0
  const caught = []
  result.hits.forEach((hit) => {
    const target = state.combatants[hit.targetId]
    if (!target || !isActive(target)) return
    if (target.side === self.side) {
      alliesCaught += 1
      return
    }
    if (!opponents.has(target.id)) return
    const injury = injuryFromHit(target.character, hit, 'ai-preview')
    value += avoidOptionFor(state, target, injury).possible ? AVOIDABLE_VALUE : REMOVAL_VALUE
    caught.push(target.character.name)
  })
  // Fire or gas newly under someone: worth something against an opponent, as much against an ally.
  let burning = 0
  actors.forEach(({ id, position }) => {
    const after = hazardAt(result.environment, position)
    if (!after || after.severity <= (hazardAt(state.environment, position)?.severity ?? 0)) return
    const sign = opponents.has(id) ? 1 : state.combatants[id]?.side === self.side ? -1 : 0
    burning += sign * HAZARD_VALUE * after.severity
    if (sign > 0 && !caught.includes(state.combatants[id].character.name)) caught.push(`${state.combatants[id].character.name} (in the hazard)`)
  })
  return { value: value + burning, caught, alliesCaught, explosions: result.explosions, environment: result.environment }
}

// Would the shooter, standing here, be caught by any explosion in the chain?
const insideBlast = (state, blast, position) =>
  blast.explosions.some((explosion) => chebyshev(explosion.position, position) <= explosion.radius && blastReaches(state.map, state.environment, explosion.position, position))

// The shot at this object from one tile: { value, weaponId, chance, share } or null.
function shotFrom(state, self, record, blast, position) {
  if (insideBlast(state, blast, position)) return null
  let best = null
  self.weaponIds.forEach((weaponId) => {
    const preview = previewObjectAttack(state, self.id, record.id, weaponId, position)
    if (!preview.available) return
    const chance = staTaskChance({ task: preview.task, difficulty: preview.task.difficulty })
    const share = preview.damage >= record.structure ? 1 : PARTIAL_DISCOUNT * (preview.damage / record.structure)
    const value = chance * share * blast.value
    if (!best || value > best.value) best = { value, weaponId, chance, share, damage: preview.damage }
  })
  return best
}

const shotReason = (record, shot, blast) =>
  `${pct(shot.chance)} to hit; ${shot.share === 1 ? 'it would explode' : `${shot.damage} of its ${record.structure} Structure`}, catching ${blast.caught.join(', ')}.`

// Every object shot worth taking now, from where this combatant stands, best first: [{ value, action, reason }]. A
// blast that would catch anyone on the shooter's side (the shooter included) is never worth it.
export function objectShotOptions(state, self) {
  if (state.pending || !state.environment || !canAfford(state, self, 'attack')) return []
  return standingObjects(state)
    .flatMap((record) => {
      const blast = blastValue(state, self, record)
      if (!blast || blast.alliesCaught || blast.value <= 0) return []
      const shot = shotFrom(state, self, record, blast, self.position)
      if (!shot) return []
      return [
        {
          value: shot.value,
          action: { type: 'attackObject', objectId: record.id, weaponId: shot.weaponId, decision: `Fire at the ${record.name}` },
          reason: shotReason(record, shot, blast),
        },
      ]
    })
    .sort((a, b) => b.value - a.value)
}

// With the Minor action free: the best tile to walk to for a shot at an object that has none from here. Returns
// { value, action, reason } or null.
function moveForShotOption(state, self) {
  if (state.pending || !state.environment || !canAfford(state, self, 'attack') || !canMove(state, self) || state.turn.minor <= 0) return null
  const blasts = standingObjects(state)
    .map((record) => ({ record, blast: blastValue(state, self, record) }))
    .filter(({ blast }) => blast && !blast.alliesCaught && blast.value > 0)
  if (!blasts.length) return null
  const tiles = safeReachable(state, self)
  let best = null
  blasts.forEach(({ record, blast }) => {
    tiles.forEach((entry) => {
      const shot = shotFrom(state, self, record, blast, entry.position)
      if (!shot) return
      const value = MOVE_DISCOUNT * shot.value
      if (!best || value > best.value || (value === best.value && entry.steps < best.steps)) {
        best = {
          value,
          steps: entry.steps,
          action: { type: 'move', destination: entry.position, decision: `Move for a shot at the ${record.name}` },
          reason: `From there: ${shotReason(record, shot, blast)}`,
        }
      }
    })
  })
  return best
}

// The best object shot (or the move that sets one up) when it beats this combatant's own best attack, else null. Not
// after Aim (the Aim would be wasted).
export function objectShotStep(state, self) {
  if (state.turn.aimed) return null
  const here = objectShotOptions(state, self)[0] ?? null
  const move = here ? null : moveForShotOption(state, self)
  const best = here ?? move
  if (!best || best.value < MIN_SHOT_VALUE) return null
  const own = ownAttackValue(state, self)
  if (best.value <= own) return null
  const versus = own ? `its own best attack is worth ${own.toFixed(2)}` : 'no shot of its own'
  return { ...best.action, reason: `${best.reason} Worth ${best.value.toFixed(2)}; ${versus}.` }
}
