import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getFacing } from '../src/combat/combatSelectors.js'

const unit = (id, side, position, extra = {}) => ({ id, side, position, condition: { defeated: false }, character: { name: id }, ...extra })
const battle = (...units) => ({ order: units.map((u) => u.id), combatants: Object.fromEntries(units.map((u) => [u.id, u])) })

describe('combat facing', () => {
  const enemy = unit('klingon', 'enemy', { x: 5, y: 0 })

  it('keeps the stored facing out of cover', () => {
    const ensign = unit('ensign', 'player', { x: 0, y: 0 }, { facing: { x: 0, y: 1 } })
    assert.deepEqual(getFacing(battle(ensign, enemy), ensign), { x: 0, y: 1 })
  })

  it('faces the nearest enemy in cover, whatever it last faced', () => {
    const far = unit('far', 'enemy', { x: 0, y: -9 })
    const ensign = unit('ensign', 'player', { x: 0, y: 0 }, { facing: { x: 0, y: 1 }, inCover: true })
    assert.deepEqual(getFacing(battle(ensign, enemy, far), ensign), { x: 1, y: 0 })
  })

  it('keeps the stored facing in cover with no enemy left, and when Defeated', () => {
    const ensign = unit('ensign', 'player', { x: 0, y: 0 }, { facing: { x: 0, y: 1 }, inCover: true })
    assert.deepEqual(getFacing(battle(ensign, { ...enemy, fled: true }), ensign), { x: 0, y: 1 })
    const down = { ...ensign, condition: { defeated: true } }
    assert.deepEqual(getFacing(battle(down, enemy), down), { x: 0, y: 1 })
  })
})
