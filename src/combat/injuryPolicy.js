// Avoid Injury and Fatigue decisions for characters the player isn't deciding for: enemies, and party members under
// autocombat. Kept apart from the rules (rules/personalCondition.js says what is possible and what it costs) so the
// choice can be tuned without touching combat resolution.
import { FATIGUE_ATTRIBUTES } from '../rules/personalCondition.js'
import { getAttackTaskSpec, getWeapon } from './weaponSystem.js'

// Prototype policy (implementation detail, not tuned): avoid whenever the rules allow it. A Defeat takes the character
// out of the fight, which costs more than any Stress or Threat it could save for later.
//
// option: getAvoidOption's { possible, kind, cost }. Returns true to avoid.
export function chooseAvoidInjury({ option }) {
  return Boolean(option?.possible)
}

// Book p.290 Counterattack. Prototype policy (implementation detail, not tuned): always counterattack when it can be
// paid for; enemies use Deadly when the weapon has it, the party Stun when it has it (a party Deadly adds Threat).
// offer: combatCounterattack.js's { injuryModes, cost }. Returns { accept, injuryMode, reason }.
export function chooseCounterattack({ defender, offer }) {
  const preferred = defender.side === 'enemy' ? 'deadly' : 'stun'
  const injuryMode = offer.injuryModes.includes(preferred) ? preferred : offer.injuryModes[0]
  const pool = defender.side === 'enemy' ? 'Threat' : 'Momentum'
  return { accept: true, injuryMode, reason: `Policy: always counterattack when affordable (${offer.cost} ${pool}).` }
}

// Book p.278: a Fatigued character selects one attribute to shut down. Prototype policy (implementation detail, not
// tuned): keep every attribute the combatant's weapons attack with, and shut down the lowest of the rest (ties: the
// first in the usual attribute order). combatant: { character, weaponIds }. Returns { attributeId, reason }.
export function chooseFatigueAttribute({ combatant }) {
  const attackAttributes = new Set(combatant.weaponIds.map((weaponId) => getWeapon(weaponId)).filter(Boolean).map((weapon) => getAttackTaskSpec(weapon)?.attribute))
  const candidates = FATIGUE_ATTRIBUTES.filter((attributeId) => !attackAttributes.has(attributeId))
  const pool = candidates.length ? candidates : FATIGUE_ATTRIBUTES
  const attributeId = pool.reduce((lowest, attributeId) => (combatant.character.attributes[attributeId] < combatant.character.attributes[lowest] ? attributeId : lowest))
  return { attributeId, reason: 'Auto Combat policy: shut down the lowest attribute not used for attacks.' }
}
