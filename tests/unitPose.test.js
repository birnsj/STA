import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getSpriteAnimation } from '../src/rules/appearance.js'
import { advancePose, initialPose, poseInput, poseWakeAt, settlePose, shownPose } from '../src/components/combat/unitPose.js'

const standing = { id: 'k1', condition: { defeated: false }, surrendered: false }
const downed = { ...standing, condition: { defeated: true } }
const shot = (key, weaponId = 'phaserType2', actorId = 'k1') => ({ key, type: 'resolve', actorId, weaponId })

test('a board appearing mid-fight shows the downed lying and does not replay the current strike', () => {
  const track = initialPose(poseInput(downed, { lastAction: shot(4) }))
  assert.equal(shownPose(track).settled, true)
  const standingTrack = initialPose(poseInput(standing, { lastAction: shot(4) }))
  assert.equal(advancePose(standingTrack, poseInput(standing, { lastAction: shot(4) }), 0), standingTrack)
  assert.equal(shownPose(standingTrack).animation, 'idle')
})

test('a strike plays once, for its animation length at the playback speed, then back to the loop', () => {
  let track = initialPose(poseInput(standing))
  track = advancePose(track, poseInput(standing, { lastAction: shot(1), speed: 2 }), 1000)
  assert.equal(shownPose(track).animation, 'attack')
  const ends = 1000 + (getSpriteAnimation('attack').seconds * 1000) / 2
  assert.equal(poseWakeAt(track), ends)
  assert.equal(settlePose(track, ends - 1), track)
  assert.equal(shownPose(settlePose(track, ends)).animation, 'idle')
  const melee = advancePose(initialPose(poseInput(standing)), poseInput(standing, { lastAction: shot(2, 'dkTahg') }), 0)
  assert.equal(shownPose(melee).animation, 'melee')
  const others = advancePose(initialPose(poseInput(standing)), poseInput(standing, { lastAction: shot(3, 'phaserType2', 'k2') }), 0)
  assert.equal(shownPose(others).animation, 'idle')
})

test('a fall from a shot waits for the shot to land, then plays from its first frame', () => {
  let track = initialPose(poseInput(standing))
  track = advancePose(track, poseInput(downed, { hitDelayMs: 400 }), 1000)
  assert.equal(shownPose(track, { inCover: true }).animation, 'cover')
  assert.equal(poseWakeAt(track), 1400)
  const landed = settlePose(track, 1400)
  const pose = shownPose(landed)
  assert.equal(pose.animation, track.fall)
  assert.equal(pose.settled, false)
  assert.ok(pose.playKey > track.playKey)
  const instant = advancePose(initialPose(poseInput(standing)), poseInput(downed), 0)
  assert.equal(shownPose(instant).animation, instant.fall)
})

test('getting up plays the fall backwards once; surrender raises the hands; walking runs', () => {
  const down = initialPose(poseInput(downed))
  const up = advancePose(down, poseInput(standing), 0)
  assert.deepEqual([shownPose(up).animation, shownPose(up).reverse], [down.fall, true])
  assert.equal(shownPose(settlePose(up, poseWakeAt(up))).animation, 'idle')
  const hands = advancePose(initialPose(poseInput(standing)), poseInput({ ...standing, surrendered: true }), 0)
  assert.deepEqual([shownPose(hands).animation, shownPose(hands).settled], ['surrender', false])
  assert.equal(shownPose(initialPose(poseInput(standing)), { isWalking: true }).animation, 'run')
})
