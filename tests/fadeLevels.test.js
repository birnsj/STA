// Wall fading shared by the map canvas and the blocks drawn over figures (presentation only, no book rule).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FADED_OPACITY, mergeAreas } from '../src/components/maps/canvasTiles.js'
import { FADE_MS, fadeLevels, retarget, settle } from '../src/components/maps/fadeLevels.js'

const empty = { target: new Set(), changes: new Map() }

describe('wall fade levels', () => {
  it('a block fading in eases from solid to see-through, then the plain Set is used', () => {
    const fade = retarget(empty, new Set(['1,2']), 0)
    assert.equal(fadeLevels(fade, 0).has('1,2'), false, 'still solid at the start')
    const half = fadeLevels(fade, FADE_MS / 2).get('1,2')
    assert.ok(Math.abs(half - (1 + FADED_OPACITY) / 2) < 1e-9)
    const done = settle(fade, FADE_MS)
    assert.equal(fadeLevels(done, FADE_MS), done.target)
  })

  it('a block fading out stays in the levels until it is solid', () => {
    const faded = settle(retarget(empty, new Set(['1,2']), 0), FADE_MS)
    const out = retarget(faded, new Set(), 1000)
    assert.ok(fadeLevels(out, 1000 + FADE_MS / 2).has('1,2'))
    assert.equal(fadeLevels(out, 1000 + FADE_MS).has('1,2'), false)
  })

  it('reversing mid-fade starts from the current level, and without animation it jumps', () => {
    const fade = retarget(empty, new Set(['1,2']), 0)
    const back = retarget(fade, new Set(), FADE_MS / 2)
    assert.ok(Math.abs(fadeLevels(back, FADE_MS / 2).get('1,2') - (1 + FADED_OPACITY) / 2) < 1e-9)
    assert.equal(retarget(empty, new Set(['1,2']), 0, false).changes.size, 0)
  })

  it('overlapping repaint areas merge into one, and far-apart ones stay separate', () => {
    const wall = (x) => ({ x, y: 0, width: 64, height: 128 })
    assert.deepEqual(mergeAreas([wall(0), wall(32), wall(64)]), [{ x: 0, y: 0, width: 128, height: 128 }])
    assert.equal(mergeAreas([wall(0), wall(1000)]).length, 2)
  })
})
