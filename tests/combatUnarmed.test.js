// Punch: the Unarmed Strike as a contextual ring button on an adjacent enemy (combat/combatUnarmed.js; weapons.json
// unarmedAttacks). Book Core p.243: Unarmed Strike = Melee, Stun, Severity 2. Offered only in Reach.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { combatReducer, createCombat } from '../src/combat/combatState.js'
import { offeredUnarmedAttacks, previewUnarmedAttack } from '../src/combat/combatUnarmed.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

function fight(enemyAt) {
  const map = createBlankMap({ name: 'Unarmed Test Room', width: 16, height: 12 })
  map.markers.playerStarts = [{ x: 2, y: 5 }]
  map.markers.enemySpawns = [enemyAt]
  const state = createCombat({ map, players: [makeCharacter({ id: 'alpha', name: 'Alpha' })], seed: 11, initiativeOptions: { firstSide: 'player' } })
  const enemy = Object.values(state.combatants).find((combatant) => combatant.side === 'enemy')
  return { state, enemy }
}

describe('Punch', () => {
  it('is offered against an enemy in Reach, and not against one further away', () => {
    const near = fight({ x: 3, y: 5 })
    assert.deepEqual(offeredUnarmedAttacks(near.state, 'alpha', near.enemy.id, 'phaserType2').map((entry) => entry.attack.id), ['punch', 'kick'])
    const far = fight({ x: 6, y: 5 })
    assert.deepEqual(offeredUnarmedAttacks(far.state, 'alpha', far.enemy.id, 'phaserType2'), [])
  })

  it('is not offered while the Unarmed Strike is already the weapon in hand (its Stun button does the same)', () => {
    const { state, enemy } = fight({ x: 3, y: 5 })
    assert.deepEqual(offeredUnarmedAttacks(state, 'alpha', enemy.id, 'unarmedStrike'), [])
  })

  it('is the Unarmed Strike: Stun, severity 2, a Major action', () => {
    const { state, enemy } = fight({ x: 3, y: 5 })
    const punch = previewUnarmedAttack(state, 'alpha', enemy.id, 'punch', 'phaserType2')
    assert.ok(punch.available, punch.reason)
    assert.equal(punch.preview.weapon.id, 'unarmedStrike')
    assert.equal(punch.preview.weapon.severity, 2)
    const next = combatReducer(state, { type: 'attack', targetId: enemy.id, weaponId: 'unarmedStrike', injuryMode: 'stun', purchase: { bonusDice: 0, momentum: 0 } })
    assert.equal(next.pending.weaponId, 'unarmedStrike')
    assert.equal(next.pending.injuryMode, 'stun')
    assert.equal(next.turn.major, state.turn.major - 1)
  })

  it('is unavailable once the Major action is spent', () => {
    const { state, enemy } = fight({ x: 3, y: 5 })
    const spent = { ...state, turn: { ...state.turn, major: 0 } }
    const punch = previewUnarmedAttack(spent, 'alpha', enemy.id, 'punch', 'phaserType2')
    assert.equal(punch.offered, true)
    assert.equal(punch.available, false)
    assert.match(punch.reason, /Major action/)
  })
})
