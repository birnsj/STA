import assert from 'node:assert/strict'
import { test } from 'node:test'
import { frameColumn, gaitDelay, restColumn, startTiming, steadyGait } from '../src/components/maps/spriteTiming.js'

const loop = { name: 'idle', start: 0, frames: 8, seconds: 2.4, play: 'loop' }
const once = { name: 'attack', start: 0, frames: 12, seconds: 0.6, play: 'once' }
const hold = { name: 'fallBack', start: 12, frames: 12, seconds: 0.6, play: 'hold' }

test('a loop steps through its frames on the page clock, offset by its phase', () => {
  const started = startTiming(loop, { seed: 'a', phase: 0 }, 0)
  assert.equal(frameColumn(loop, started, {}, 0), 0)
  assert.equal(frameColumn(loop, started, {}, 300), 1)
  assert.equal(frameColumn(loop, started, {}, 2399), 7)
  assert.equal(frameColumn(loop, started, {}, 2400), 0)
  const half = startTiming(loop, { seed: 'b', phase: 0.5 }, 0)
  assert.equal(frameColumn(loop, half, {}, 0), 4)
})

test('a one-shot plays from when it began and holds its last frame', () => {
  const started = startTiming(once, { seed: 'c', playKey: 1 }, 1000)
  assert.equal(frameColumn(once, started, {}, 1000), 0)
  assert.equal(frameColumn(once, started, {}, 1300), 6)
  assert.equal(frameColumn(once, started, {}, 5000), 11)
  // The same play asked for again later keeps its start.
  assert.deepEqual(startTiming(once, { seed: 'c', playKey: 1 }, 1200), started)
})

test('played backwards a hold ends on its first frame; settled it rests on its last', () => {
  const started = startTiming(hold, { seed: 'd', playKey: 2, reverse: true }, 0)
  assert.equal(frameColumn(hold, started, { reverse: true }, 0), 23)
  assert.equal(frameColumn(hold, started, { reverse: true }, 600), 12)
  assert.equal(frameColumn(hold, startTiming(hold, { seed: 'd', settled: true }, 0), {}, 0), 23)
  assert.equal(restColumn(once), 6)
})

test('a new gait shows after it has held, at once when setting off', () => {
  let track = steadyGait(null, 'idle', 0)
  track = steadyGait(track, 'walk', 10)
  assert.equal(track.steady, 'walk')
  track = steadyGait(track, 'run', 20)
  assert.equal(track.steady, 'walk')
  track = steadyGait(track, 'walk', 100)
  track = steadyGait(track, 'run', 120)
  assert.equal(steadyGait(track, 'run', 120 + gaitDelay('walk', 'run') - 1).steady, 'walk')
  assert.equal(steadyGait(track, 'run', 120 + gaitDelay('walk', 'run')).steady, 'run')
})
