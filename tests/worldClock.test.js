import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createWorldTickCadence, takeWorldTick, WORLD_TICK_MS } from '../src/exploration/worldClock.js'

describe('world clock cadence', () => {
  it('caps high-refresh animation frames while preserving elapsed real time', () => {
    const cadence = createWorldTickCadence(0)
    assert.equal(takeWorldTick(cadence, 8), null)
    const first = takeWorldTick(cadence, WORLD_TICK_MS)
    assert.ok(Math.abs(first - WORLD_TICK_MS / 1000) < 1e-9)
    assert.equal(takeWorldTick(cadence, WORLD_TICK_MS + 8), null)
    const second = takeWorldTick(cadence, WORLD_TICK_MS * 2)
    assert.ok(Math.abs(second - WORLD_TICK_MS / 1000) < 1e-9)
  })

  it('passes a delayed frame as one elapsed step for the reducer to clamp consistently', () => {
    const cadence = createWorldTickCadence(100)
    assert.equal(takeWorldTick(cadence, 1100), 1)
  })
})
