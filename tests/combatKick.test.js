// Kick (prototype adaptation: an Unarmed Strike that can knock the target prone for 2 Momentum) and Prone (Book Core p.288:
// Being Prone; Stand is a Minor action). Numbers: actions.json "prone", weapons.json unarmedAttacks.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { combatReducer, createCombat, previewAttack } from '../src/combat/combatState.js'
import { applyAttackThrow } from '../src/combat/combatInjuries.js'
import { getMovementBlock } from '../src/combat/combatMovement.js'
import { isProne, proneAttackEffects, standUpStep } from '../src/combat/combatProne.js'
import { knockdownAfterHit, unarmedVariantFor } from '../src/combat/combatUnarmed.js'
import { getRangeBand } from '../src/combat/rangeSystem.js'
import { getWeapon } from '../src/combat/weaponSystem.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

function fight({ momentum = 3 } = {}) {
  const map = createBlankMap({ name: 'Kick Test Room', width: 16, height: 12 })
  map.markers.playerStarts = [{ x: 2, y: 5 }]
  map.markers.enemySpawns = [{ x: 3, y: 5 }]
  const created = createCombat({ map, players: [makeCharacter({ id: 'alpha', name: 'Alpha' })], seed: 5, initiativeOptions: { firstSide: 'player' } })
  const enemy = Object.values(created.combatants).find((combatant) => combatant.side === 'enemy')
  // A full character (Stress track) so a hit is avoided, not Defeated: a knockdown needs the target still up.
  const state = {
    ...created,
    resources: { ...created.resources, momentum },
    combatants: { ...created.combatants, [enemy.id]: { ...enemy, character: { ...enemy.character, npcRules: 'main' } } },
  }
  return { state, alpha: state.combatants.alpha, enemy: state.combatants[enemy.id] }
}

// A won, unopposed Kick, ready to resolve.
function wonKick(state, alpha, enemy, variant = 'kick') {
  const preview = previewAttack(state, alpha.id, enemy.id, 'unarmedStrike')
  return {
    ...state,
    pending: {
      attackerId: alpha.id,
      targetId: enemy.id,
      weaponId: 'unarmedStrike',
      injuryMode: 'stun',
      variant,
      band: preview.band,
      distance: preview.distance,
      baseDifficulty: preview.baseDifficulty,
      rangeModifier: 0,
      task: { ...preview.task, difficulty: 0 },
      opposition: null,
      dice: [1, 1],
      assist: null,
      aimed: false,
      targetUnaware: false,
      aimRerolls: 0,
      assistRerolls: 0,
      rerolls: [],
    },
  }
}

describe('Kick', () => {
  it('is only the Unarmed Strike on Stun with a known variant', () => {
    assert.equal(unarmedVariantFor({ variant: 'kick', weaponId: 'unarmedStrike', injuryMode: 'stun' })?.id, 'kick')
    assert.equal(unarmedVariantFor({ variant: 'kick', weaponId: 'phaserType2', injuryMode: 'stun' }), null)
    assert.equal(unarmedVariantFor({ variant: 'nonsense', weaponId: 'unarmedStrike', injuryMode: 'stun' }), null)
    assert.equal(unarmedVariantFor({ weaponId: 'unarmedStrike', injuryMode: 'stun' }), null)
  })

  it('a hit that leaves the target up spends 2 Momentum and knocks it prone', () => {
    const { state, alpha, enemy } = fight({ momentum: 3 })
    const next = combatReducer(wonKick(state, alpha, enemy), { type: 'resolveAttack' })
    assert.equal(next.result.passed, true)
    assert.equal(isProne(next.combatants[enemy.id]), true)
    // The pool: what it held, plus the roll's saved Momentum, less the 2 the knockdown costs.
    assert.equal(next.resources.momentum, Math.min(6, 3 + next.result.momentumSaved) - 2)
    assert.ok(next.combatants[enemy.id].blastReact?.key, 'the figure plays the fall, hold and get-up')
    assert.ok(next.log.some((entry) => /knocked prone/.test(JSON.stringify(entry))))
  })

  it('a Punch never knocks anyone down', () => {
    const { state, alpha, enemy } = fight({ momentum: 6 })
    const next = combatReducer(wonKick(state, alpha, enemy, 'punch'), { type: 'resolveAttack' })
    assert.equal(next.result.passed, true)
    assert.equal(isProne(next.combatants[enemy.id]), false)
  })

  it('a pool too small leaves the target standing and says why', () => {
    const { state, alpha, enemy } = fight({ momentum: 1 })
    const knock = knockdownAfterHit(state, alpha, enemy.id, 'kick')
    assert.equal(knock.knocked, false)
    assert.equal(isProne(knock.state.combatants[enemy.id]), false)
    assert.match(knock.lines[0], /costs 2 Momentum/)
  })

  it('an enemy pays in Threat, and a target already prone is not knocked again', () => {
    const { state, enemy, alpha } = fight()
    const asEnemy = knockdownAfterHit({ ...state, resources: { ...state.resources, threat: 2, momentum: 0 } }, enemy, alpha.id, 'kick')
    assert.equal(asEnemy.knocked, true)
    assert.equal(asEnemy.state.resources.threat, 0)
    const again = knockdownAfterHit(asEnemy.state, enemy, alpha.id, 'kick')
    assert.equal(again.knocked, false)
  })
})

describe('high-roll impact throw', () => {
  it('throws one tile at 3 Momentum and two at 4 or more', () => {
    const { state, alpha, enemy } = fight()
    const one = applyAttackThrow(state, alpha.id, enemy.id, 3)
    assert.deepEqual(one.combatants[enemy.id].position, { x: 4, y: 5 })
    assert.deepEqual(one.combatants[enemy.id].blastReact.from, { x: 3, y: 5 })
    const two = applyAttackThrow(state, alpha.id, enemy.id, 4)
    assert.deepEqual(two.combatants[enemy.id].position, { x: 5, y: 5 })
  })

  it('does not throw a low hit and stops before another standing combatant', () => {
    const { state, alpha, enemy } = fight()
    assert.equal(applyAttackThrow(state, alpha.id, enemy.id, 2), state)
    const blocker = { ...alpha, id: 'blocker', position: { x: 4, y: 5 } }
    const blocked = { ...state, combatants: { ...state.combatants, blocker } }
    assert.deepEqual(applyAttackThrow(blocked, alpha.id, enemy.id, 4).combatants[enemy.id].position, enemy.position)
  })
})

describe('Prone (Core p.288)', () => {
  const rifle = getWeapon('phaserType2')
  const prone = { prone: true }

  it('ranged attacks from Medium range or further are +1 Difficulty; closer ones gain 2 bonus Momentum', () => {
    assert.deepEqual(proneAttackEffects(prone, rifle, getRangeBand(6)).difficultyLines, [{ label: 'Target prone', change: 1 }])
    assert.equal(proneAttackEffects(prone, rifle, getRangeBand(6)).bonusMomentum, 0)
    assert.equal(proneAttackEffects(prone, rifle, getRangeBand(3)).bonusMomentum, 2)
    assert.equal(proneAttackEffects(prone, rifle, getRangeBand(3)).difficultyLines.length, 0)
  })

  it('melee attacks gain 2 bonus Momentum, and a standing target changes nothing', () => {
    const fist = getWeapon('unarmedStrike')
    assert.equal(proneAttackEffects(prone, fist, getRangeBand(1)).bonusMomentum, 2)
    assert.deepEqual(proneAttackEffects({}, fist, getRangeBand(1)), { difficultyLines: [], bonusMomentum: 0 })
  })

  it('the preview carries the bonus Momentum into the attack', () => {
    const { state, alpha, enemy } = fight()
    const down = { ...state, combatants: { ...state.combatants, [enemy.id]: { ...enemy, prone: true } } }
    assert.equal(previewAttack(state, alpha.id, enemy.id, 'unarmedStrike').bonusMomentum ?? 0, 0)
    assert.equal(previewAttack(down, alpha.id, enemy.id, 'unarmedStrike').bonusMomentum, 2)
  })

  it('a prone character cannot Sprint', () => {
    const { state, alpha } = fight()
    assert.equal(getMovementBlock(state, alpha, 'sprint'), null)
    assert.match(getMovementBlock({ ...state, combatants: { ...state.combatants, alpha: { ...alpha, prone: true } } }, { ...alpha, prone: true }, 'sprint'), /Prone/)
  })

  it('Stand is a Minor action that clears it, and is only possible while prone', () => {
    const { state, alpha } = fight()
    assert.equal(combatReducer(state, { type: 'stand' }), state, 'standing already: nothing happens')
    const down = { ...state, combatants: { ...state.combatants, alpha: { ...alpha, prone: true } } }
    const next = combatReducer(down, { type: 'stand' })
    assert.equal(isProne(next.combatants.alpha), false)
    assert.equal(next.turn.minor, down.turn.minor - 1)
    assert.equal(next.turn.major, down.turn.major)
  })

  it('the AI stands up first while prone', () => {
    const { state, alpha } = fight()
    assert.equal(standUpStep(state, alpha), null)
    const down = { ...state, combatants: { ...state.combatants, alpha: { ...alpha, prone: true } } }
    assert.equal(standUpStep(down, down.combatants.alpha).type, 'stand')
  })
})
