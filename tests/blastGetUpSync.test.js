import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clearGetUp,
  exploreGetUpComplete,
  getUpPlaybackComplete,
  markGetUpPlaying,
  shownGetUpPose,
  startExploreGetUp,
  startGetUpWait,
} from '../src/components/maps/blastGetUpSync.js'
import { advancePose, initialPose, poseInput, settlePose, shownPose } from '../src/components/combat/unitPose.js'
import { blastDownHoldMs, getSpriteAnimation, getUpAnimation } from '../src/rules/appearance.js'

const standing = { id: 'k1', condition: { defeated: false }, surrendered: false }
const getUp = getUpAnimation()

function finishToGetUpWait(at = 0) {
  const injury = { id: 'blast-1', type: 'stun', severity: 2, source: { weaponId: 'explosion:g', blastRadius: 2 } }
  const blasted = { ...standing, blastReact: { injury } }
  let track = advancePose(initialPose(poseInput(standing)), poseInput(blasted), at)
  while (track.staggerFall || track.staggerDown) {
    track = settlePose(track, track.oneShotUntil)
  }
  return track
}

test('get-up wait always wants getUp (FigureView keeps fall until assign)', () => {
  const track = finishToGetUpWait(0)
  assert.equal(track.gettingUp, getUp)
  assert.equal(track.getUpPlaying, false)
  assert.equal(shownPose(track).animation, getUp)
  assert.equal(shownPose(track).standingUp, true)
  assert.deepEqual(shownGetUpPose(track).animation, getUp)
})

test('get-up completes only when displayed progress reaches the last frame', () => {
  let track = finishToGetUpWait(0)
  track = markGetUpPlaying(track)
  assert.equal(getUpPlaybackComplete(track, { displayedName: 'fallBlastBack', progress: 1 }), false)
  assert.equal(getUpPlaybackComplete(track, { displayedName: getUp, progress: 0.99 }), false)
  assert.equal(getUpPlaybackComplete(track, { displayedName: getUp, progress: 1 }), true)
  assert.equal(shownPose(settlePose(track, 1e9)).animation, getUp)
  assert.equal(shownPose(clearGetUp(track)).animation, 'idle')
})

test('delayed getup longer than a former timer still requires displayed completion', () => {
  let track = finishToGetUpWait(0)
  const oldTimerEnd = 50_000 + getSpriteAnimation(getUp).seconds * 1000
  assert.equal(settlePose(track, oldTimerEnd).gettingUp, getUp)
  track = markGetUpPlaying(track)
  assert.equal(getUpPlaybackComplete(track, { displayedName: getUp, progress: 0.5 }), false)
  assert.equal(getUpPlaybackComplete(track, { displayedName: getUp, progress: 1 }), true)
})

test('markGetUpPlaying is idempotent (no repeated restarts)', () => {
  const wait = startGetUpWait({ playKey: 3 })
  const playing = markGetUpPlaying(wait)
  assert.equal(playing.getUpPlaying, true)
  assert.equal(markGetUpPlaying(playing).playKey, playing.playKey)
})

test('multiple characters thrown by one explosion each keep an independent get-up wait', () => {
  const injuryA = { id: 'blast-a', type: 'stun', severity: 1, source: { weaponId: 'explosion:g', blastRadius: 2 } }
  const injuryB = { id: 'blast-b', type: 'stun', severity: 1, source: { weaponId: 'explosion:g', blastRadius: 2 } }
  const finish = (id, injury) => {
    const actor = { ...standing, id, blastReact: { injury } }
    let track = advancePose(initialPose(poseInput(actor)), poseInput(actor), 0)
    while (track.staggerFall || track.staggerDown) track = settlePose(track, track.oneShotUntil)
    return track
  }
  let trackA = finish('a', injuryA)
  let trackB = finish('b', injuryB)
  assert.equal(trackA.gettingUp, getUp)
  assert.equal(trackB.gettingUp, getUp)
  trackA = markGetUpPlaying(trackA)
  assert.equal(trackB.getUpPlaying, false)
  assert.equal(getUpPlaybackComplete(trackA, { displayedName: getUp, progress: 1 }), true)
  assert.equal(getUpPlaybackComplete(trackB, { displayedName: getUp, progress: 1 }), false)
})

test('defeated character never stands up after a blast', () => {
  const injury = {
    id: 'blast-down',
    type: 'deadly',
    severity: 3,
    source: { weaponId: 'explosion:g', blastRadius: 2 },
  }
  const downed = {
    ...standing,
    condition: { defeated: true, injuries: [injury] },
    blastReact: { injury, from: { x: 1, y: 1 }, land: { x: 2, y: 1 } },
  }
  const track = advancePose(initialPose(poseInput(standing)), poseInput(downed), 0)
  assert.equal(track.down, true)
  assert.equal(track.gettingUp, null)
  assert.equal(track.staggerFall, null)
  for (let t = 0; t < 20_000; t += 500) {
    const settled = settlePose(track, t)
    assert.equal(settled.gettingUp, null)
    assert.ok(String(shownPose(settled).animation).startsWith('fall'))
  }
})

test('exploration getUp helpers: start immediately, complete on displayed playback', () => {
  const up = startExploreGetUp({ playKey: 'u1', now: null })
  assert.equal(up.phase, 'up')
  assert.equal(up.animation, getUp)
  assert.equal(up.startedAt, null)
  assert.equal(exploreGetUpComplete(up, { displayedName: getUp, progress: 1 }), false)
  const playing = { ...up, startedAt: 1000 }
  assert.equal(exploreGetUpComplete(playing, { displayedName: 'fallBlastBack', progress: 1 }), false)
  assert.equal(exploreGetUpComplete(playing, { displayedName: getUp, progress: 0.5 }), false)
  assert.equal(exploreGetUpComplete(playing, { displayedName: getUp, progress: 1 }), true)
})

test('blast prone hold duration still uses blastDownHoldMs before get-up', () => {
  const injury = { id: 'blast-hold', type: 'stun', severity: 2, source: { weaponId: 'explosion:g', blastRadius: 2 } }
  const blasted = { ...standing, blastReact: { injury } }
  let track = advancePose(initialPose(poseInput(standing)), poseInput(blasted), 0)
  const fallEnd = track.oneShotUntil
  track = settlePose(track, fallEnd)
  assert.equal(track.staggerDown, 'fallBlastBack')
  assert.equal(track.oneShotUntil, fallEnd + blastDownHoldMs())
  track = settlePose(track, track.oneShotUntil)
  assert.equal(track.gettingUp, getUp)
  assert.equal(track.oneShotUntil, null)
  assert.equal(shownPose(track).animation, getUp)
})
