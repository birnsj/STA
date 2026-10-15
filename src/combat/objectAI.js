// Shooting destructible objects in Auto Combat (designer decision, 2026-10-12: both sides may, and avoid blasts that
// would catch their own side). A shot is weighed like an attack: its chance to land times what the blast it sets off
// (chain reactions included) would do to the opponents it reaches. The weights are AI tuning, not rules.
import { blastActors, previewObjectAttack, standingObjects } from './combatEnvironment.js'
import { avoidOptionFor } from './combatInjuries.js'
import { canAfford, getOpponents, isActive } from './combatSelectors.js'
import { ownAttackValue } from './supportAI.js'
import { damageObject, injuryFromHit } from '../world/environment.js'
import { staTaskChance } from '../rules/taskResolver.js'

// An opponent the blast would Defeat (they couldn't avoid it), against 1 for an ordinary hit; one who could avoid it pays
// Stress instead, worth this much.
const REMOVAL_VALUE = 2
const AVOIDABLE_VALUE = 0.5
// A shot that only damages the object counts for its share of the Structure left, discounted for the shots still to come.
const PARTIAL_DISCOUNT = 0.5

const pct = (chance) => `${Math.round(chance * 100)}%`

// What destroying this object now would do: { value, caught: names of opponents hit, alliesCaught } (null: no blast).
function blastValue(state, self, record) {
  const result = damageObject(state.environment, state.map, record.id, record.structure, blastActors(state))
  if (!result.hits.length) return null
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
  return { value, caught, alliesCaught }
}

// Every object shot worth taking now, best first: [{ value, action, reason }]. A blast that would catch anyone on the
// shooter's side (the shooter included) is never worth it.
export function objectShotOptions(state, self) {
  if (state.pending || !state.environment || !canAfford(state, self, 'attack')) return []
  return standingObjects(state)
    .flatMap((record) => {
      const blast = blastValue(state, self, record)
      if (!blast || blast.alliesCaught || !blast.value) return []
      return self.weaponIds.flatMap((weaponId) => {
        const preview = previewObjectAttack(state, self.id, record.id, weaponId)
        if (!preview.available) return []
        const chance = staTaskChance({ task: preview.task, difficulty: preview.task.difficulty })
        const share = preview.damage >= record.structure ? 1 : PARTIAL_DISCOUNT * (preview.damage / record.structure)
        return [
          {
            value: chance * share * blast.value,
            action: { type: 'attackObject', objectId: record.id, weaponId, decision: `Fire at the ${record.name}` },
            reason: `${pct(chance)} to hit; ${share === 1 ? 'it would explode' : `${preview.damage} of its ${record.structure} Structure`}, catching ${blast.caught.join(', ')}.`,
          },
        ]
      })
    })
    .sort((a, b) => b.value - a.value)
}

// The best object shot when it beats this combatant's own best attack, else null. Not after Aim (the Aim would be wasted).
export function objectShotStep(state, self) {
  if (state.turn.aimed) return null
  const best = objectShotOptions(state, self)[0]
  if (!best) return null
  const own = ownAttackValue(state, self)
  if (best.value <= own) return null
  const versus = own ? `its own best attack is worth ${own.toFixed(2)}` : 'no shot of its own'
  return { ...best.action, reason: `${best.reason} Worth ${best.value.toFixed(2)}; ${versus}.` }
}
