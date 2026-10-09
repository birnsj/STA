// Turn order. Book (Core p.277): after the first character, the sides alternate one character at a time.
// Prototype (designer decision, 2026-10-09): the sides alternate from the start of the fight, the party first, each side
// in its own Daring, then Control order; the larger side's extra combatants act after the smaller side has run out.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildInitiativeOrder } from '../src/combat/initiativeSystem.js'
import { seededRandomInt } from '../src/rules/seededRandom.js'

const combatant = (id, side, daring, control = 9) => ({ id, side, character: { attributes: { daring, control } } })

const party = [combatant('p-low', 'player', 8), combatant('p-high', 'player', 11), combatant('p-mid', 'player', 10, 12), combatant('p-mid2', 'player', 10, 9)]
const enemies = [combatant('e-low', 'enemy', 7), combatant('e-high', 'enemy', 12)]

describe('initiative alternates between the sides (Prototype)', () => {
  it('party first, alternating, each side by Daring then Control; the extra party members go last', () => {
    const order = buildInitiativeOrder([...party, ...enemies], seededRandomInt(1), { firstSide: 'player' })
    assert.deepEqual(order, ['p-high', 'e-high', 'p-mid', 'e-low', 'p-mid2', 'p-low'])
  })

  it('the enemy can take the first slot (a failed ambush)', () => {
    const order = buildInitiativeOrder([...party, ...enemies], seededRandomInt(1), { firstSide: 'enemy' })
    assert.deepEqual(order, ['e-high', 'p-high', 'e-low', 'p-mid', 'p-mid2', 'p-low'])
  })

  it('a bigger enemy side alternates the same way', () => {
    const order = buildInitiativeOrder([party[1], ...enemies, combatant('e-mid', 'enemy', 9)], seededRandomInt(1), { firstSide: 'player' })
    assert.deepEqual(order, ['p-high', 'e-high', 'e-mid', 'e-low'])
  })
})
