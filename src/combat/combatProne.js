// Prone (Book Core p.288, Being Prone; numbers in actions.json "prone"). A combatant is prone while `combatant.prone` is
// true (absent = standing): set by a Kick's knockdown (combatUnarmed.js), cleared by the Stand minor action
// (actions/StandAction.js). A Defeated character is prone by the book too (p.291), but that is already shown by
// condition.defeated and isn't tracked here.
import actionData from '../data/adaptation/combat/actions.json'
import { canAfford } from './combatSelectors.js'
import { getBandIndex } from './rangeSystem.js'

const PRONE = actionData.prone

export const isProne = (combatant) => Boolean(combatant?.prone)

// What the target being prone does to an attack made from this range band: { difficultyLines, bonusMomentum }.
// Book: ranged attacks from Medium or further are +1 Difficulty; melee attacks, and ranged attacks at Close range, gain 2
// bonus Momentum. (Implementation pick: a ranged attack from Reach counts as Close.)
export function proneAttackEffects(target, weapon, band) {
  if (!isProne(target)) return { difficultyLines: [], bonusMomentum: 0 }
  const index = getBandIndex(band.id)
  const ranged = weapon.type !== 'melee'
  if (ranged && index >= getBandIndex(PRONE.rangedFromBand)) return { difficultyLines: [{ label: 'Target prone', change: PRONE.rangedDifficulty }], bonusMomentum: 0 }
  if (!ranged || index <= getBandIndex(PRONE.bonusMomentumToBand)) return { difficultyLines: [], bonusMomentum: PRONE.bonusMomentum }
  return { difficultyLines: [], bonusMomentum: 0 }
}

// Protection a prone target gains in Cover (Book p.288), for getProtection.
export const proneCoverProtection = (combatant) => (isProne(combatant) && combatant.inCover ? PRONE.coverProtection : 0)

// The AI's first step while prone: get up with the Minor action before planning anything else (prototype pick: the AI
// never stays prone on purpose, as the book's Drop Prone is not built).
export const standUpStep = (state, self) =>
  isProne(self) && canAfford(state, self, 'stand') ? { type: 'stand', decision: 'Stand', reason: 'Prone: getting up first.' } : null

// Why this combatant can't take a movement-related major action (Sprint) now, or null.
export const proneMovementBlock = (combatant, kind) => (isProne(combatant) && kind === 'sprint' ? 'Prone: stand up before sprinting.' : null)
