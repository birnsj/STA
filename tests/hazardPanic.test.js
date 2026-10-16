// Presentation-only hazard panic (world/hazardPanic.js): Fitness bands while overlay is active.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hazardPanic } from '../src/world/hazardPanic.js'

const character = (id, fitness) => ({ id, attributes: { fitness } })

describe('hazardPanic', () => {
  it('is false when the overlay is off', () => {
    assert.equal(hazardPanic(character('a', 7), false), false)
    assert.equal(hazardPanic(character('a', 7), null), false)
  })

  it('Fitness ≤ 9 always panics while the overlay is on', () => {
    assert.equal(hazardPanic(character('a', 7), true), true)
    assert.equal(hazardPanic(character('b', 9), true), true)
  })

  it('Fitness ≥ 12 never panics', () => {
    assert.equal(hazardPanic(character('c', 12), true), false)
    assert.equal(hazardPanic(character('d', 14), true), false)
  })

  it('Fitness 10–11 is stable per character id (~50%)', () => {
    const result = hazardPanic(character('fitness-mid', 10), true)
    assert.equal(typeof result, 'boolean')
    assert.equal(hazardPanic(character('fitness-mid', 10), true), result)
    assert.equal(hazardPanic(character('fitness-mid', 11), true), result)
  })
})
