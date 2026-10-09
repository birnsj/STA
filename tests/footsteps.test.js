// Footsteps NPCs can hear (designer decision, 2026-10-09). Book (Core p.331): a guards' alertness track worsens from
// noisy or attention-grabbing actions; opposed stealth (p.256) is the mover's Control + Security against the searcher's
// Insight + Security (p.92). Prototype: a hearing meter per NPC (awareness.json footsteps).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import awarenessData from '../src/data/adaptation/exploration/awareness.json' with { type: 'json' }
import { createNpc, createWorld, footstepNoise, STATE, tickWorld } from '../src/exploration/awareness.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const STEPS = awarenessData.footsteps

function openMap() {
  return createBlankMap({ name: 'Footstep Test Room', width: 20, height: 9 })
}

// A wall column at x = 6, rows 0-8.
function walledMap() {
  const map = openMap()
  const wall = map.tiles[0][0]
  for (let y = 0; y < map.height; y++) map.tiles[y][6] = wall
  return map
}

// Facing away (west) from the party, which comes from the east: footsteps only, never sight.
const guard = (character = null) => createNpc({ id: 'guard', position: [4, 4], facing: 180, disposition: 'hostile' }, character)
const member = (x, gait = {}, character = null) => ({ id: 'alpha', position: { x, y: 4 }, moving: true, running: false, sneaking: false, character, condition: null, ...gait })
const partyOf = (...members) => ({ memberIds: members.map((m) => m.id), members: Object.fromEntries(members.map((m) => [m.id, m])) })

function tickFor(world, party, seconds) {
  let next = world
  for (let t = 0; t < seconds; t += 0.02) next = tickWorld(next, party, 0.02)
  return next
}

describe('who can be heard (Prototype)', () => {
  const map = openMap()
  it(`walking carries ${STEPS.walk.radius} tiles, running ${STEPS.run.radius}, sneaking is silent`, () => {
    assert.ok(footstepNoise(map, guard(), member(4 + STEPS.walk.radius - 0.5)))
    assert.equal(footstepNoise(map, guard(), member(4 + STEPS.walk.radius + 0.5)), null)
    assert.ok(footstepNoise(map, guard(), member(4 + STEPS.run.radius - 0.5, { running: true })))
    assert.equal(footstepNoise(map, guard(), member(4 + STEPS.run.radius + 0.5, { running: true })), null)
    assert.equal(footstepNoise(map, guard(), member(5, { sneaking: true })), null)
    assert.equal(footstepNoise(map, guard(), member(5, { moving: false })), null)
  })

  it('walls block footsteps', () => {
    assert.equal(footstepNoise(walledMap(), guard(), member(8, { running: true })), null)
  })

  it("the mover's Control + Security shrinks the radius, the listener's Insight + Security grows it", () => {
    const quiet = makeCharacter({ attributes: { control: 12 }, disciplines: { security: 4 } })
    const sharp = makeCharacter({ attributes: { insight: 12 }, disciplines: { security: 4 } })
    const base = footstepNoise(map, guard(), member(5, { running: true })).radius
    assert.ok(footstepNoise(map, guard(), member(5, { running: true }, quiet)).radius < base)
    assert.ok(footstepNoise(map, guard(sharp), member(5, { running: true })).radius > base)
  })

  it("never beyond the NPC's hearing range", () => {
    const sharp = makeCharacter({ attributes: { insight: 12 }, disciplines: { security: 5 } })
    assert.ok(footstepNoise(map, guard(sharp), member(5, { running: true })).radius <= awarenessData.perceptionDefaults.hearingRange)
  })
})

describe('the hearing meter (Prototype)', () => {
  it('hearing makes the NPC Suspicious; a full meter sends it to check where the steps were', () => {
    const map = openMap()
    const party = partyOf(member(7))
    const started = tickFor(createWorld(map, [guard()]), party, 0.1)
    assert.equal(started.npcs.guard.state, STATE.SUSPICIOUS)
    assert.equal(started.npcs.guard.investigation, null)

    const full = tickFor(started, party, 1 / STEPS.walk.rate)
    assert.ok(full.events.some((event) => event.type === 'FOOTSTEPS_HEARD'))
    assert.ok(full.npcs.guard.investigation, 'investigates')
    assert.deepEqual(full.npcs.guard.investigation.position, { x: 7, y: 4 })
  })

  it('drains when the footsteps stop', () => {
    const map = openMap()
    const heard = tickFor(createWorld(map, [guard()]), partyOf(member(7)), 0.5)
    const quiet = tickFor(heard, partyOf(member(7, { moving: false })), 1)
    assert.ok(quiet.npcs.guard.hearing.level < heard.npcs.guard.hearing.level)
  })

  it('sneaking past never fills it', () => {
    const world = tickFor(createWorld(openMap(), [guard()]), partyOf(member(5, { sneaking: true })), 5)
    assert.equal(world.npcs.guard.hearing.level, 0)
    assert.equal(world.npcs.guard.state, STATE.UNAWARE)
  })
})
