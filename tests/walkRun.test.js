// Walk or run in exploration by how far the move order's point is from the lead character (designer decision,
// 2026-10-09). Prototype only: the books have no real-time movement.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import partyData from '../src/data/adaptation/exploration/partyControl.json' with { type: 'json' }
import awarenessData from '../src/data/adaptation/exploration/awareness.json' with { type: 'json' }
import { perceive } from '../src/exploration/awareness.js'
import { createPartyState, partyReducer } from '../src/exploration/partyControl.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const MOVE = partyData.movement

// A long open room: the team starts at its west end, facing along it.
function testMap() {
  const map = createBlankMap({ name: 'Walk Run Test Room', width: 30, height: 10 })
  map.markers.playerStarts = [
    { x: 3, y: 4 },
    { x: 2, y: 5 },
  ]
  return map
}
const team = () => [makeCharacter({ id: 'alpha', name: 'Alpha' }), makeCharacter({ id: 'beta', name: 'Beta' })]

function run(state, seconds) {
  let next = state
  for (let t = 0; t < seconds; t += 0.02) next = partyReducer(next, { type: 'tick', seconds: 0.02 })
  return next
}
const moveTo = (state, target) => partyReducer(state, { type: 'moveTo', target, fresh: true })

describe('walk or run by distance (Prototype)', () => {
  it(`a point more than ${MOVE.runDistance} tiles from the lead character is a run; nearer is a walk`, () => {
    const party = createPartyState(testMap(), team())
    const lead = party.members.alpha.position
    assert.equal(moveTo(party, { x: lead.x + MOVE.runDistance + 0.5, y: lead.y }).members.alpha.order.run, true)
    assert.equal(moveTo(party, { x: lead.x + MOVE.runDistance - 0.5, y: lead.y }).members.alpha.order.run, false)
  })

  it('a runner covers ground at run speed and shows as running; a walker does not', () => {
    const party = createPartyState(testMap(), team())
    const start = party.members.alpha.position.x
    const ran = run(moveTo(party, { x: 26, y: 4 }), 1)
    assert.equal(ran.members.alpha.running, true)
    assert.ok(Math.abs(ran.members.alpha.position.x - start - MOVE.runSpeed) < 0.3, `ran ${ran.members.alpha.position.x - start} tiles in 1 s`)

    const walked = run(moveTo(party, { x: start + 3, y: 4 }), 0.5)
    assert.equal(walked.members.alpha.moving, true)
    assert.equal(walked.members.alpha.running, false)
  })

  it('followers of a running leader run too and keep up', () => {
    const party = createPartyState(testMap(), team())
    const ran = run(moveTo(party, { x: 26, y: 4 }), 1.5)
    assert.equal(ran.members.beta.order.type, 'follow')
    assert.equal(ran.members.beta.running, true)
    assert.ok(ran.members.alpha.position.x - ran.members.beta.position.x < 3, 'the follower stays close behind')
  })

  it('a follower hurrying to catch up a walking leader is not running', () => {
    const party = createPartyState(testMap(), team())
    const walked = run(moveTo(party, { x: 6.5, y: 4 }), 0.3)
    assert.equal(walked.members.alpha.order.run, false)
    assert.equal(walked.members.beta.running, false)
  })

  it('arriving and stopping ends the run', () => {
    const party = createPartyState(testMap(), team())
    const stopped = run(moveTo(party, { x: 12, y: 4 }), 5)
    assert.equal(stopped.members.alpha.moving, false)
    assert.equal(stopped.members.alpha.running, false)
  })
})

describe('running is easier to notice (Prototype)', () => {
  const npc = { position: { x: 2, y: 3 }, heading: 0, perception: awarenessData.perceptionDefaults }
  const map = createBlankMap({ name: 'Sight Test', width: 12, height: 7 })
  const at = { x: 6, y: 3 }

  it(`a running character builds awareness at ${awarenessData.vision.runningMultiplier}x instead of ${awarenessData.vision.movingMultiplier}x`, () => {
    const still = perceive(map, npc, { position: at, moving: false }).rate
    const walking = perceive(map, npc, { position: at, moving: true, running: false }).rate
    const running = perceive(map, npc, { position: at, moving: true, running: true }).rate
    assert.equal(walking / still, awarenessData.vision.movingMultiplier)
    assert.equal(running / still, awarenessData.vision.runningMultiplier)
  })
})
