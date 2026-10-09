// Sneaking in exploration (designer decision, 2026-10-09). Book (Captain's Log p.74): Control is used for remaining
// stealthy. Prototype: speed and detection come from each character's Control + Security (sneak.json).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import awarenessData from '../src/data/adaptation/exploration/awareness.json' with { type: 'json' }
import partyData from '../src/data/adaptation/exploration/partyControl.json' with { type: 'json' }
import sneakData from '../src/data/adaptation/exploration/sneak.json' with { type: 'json' }
import { perceive } from '../src/exploration/awareness.js'
import { createPartyState, partyReducer } from '../src/exploration/partyControl.js'
import { sneakDetectionMultiplier, sneakSkill, sneakSpeed } from '../src/exploration/sneak.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

function testMap() {
  const map = createBlankMap({ name: 'Sneak Test Room', width: 30, height: 10 })
  map.markers.playerStarts = [
    { x: 3, y: 4 },
    { x: 2, y: 5 },
  ]
  return map
}
// Skill 11 (the reference) and 16.
const average = () => makeCharacter({ id: 'alpha', name: 'Alpha', attributes: { control: 9 }, disciplines: { security: 2 } })
const expert = () => makeCharacter({ id: 'beta', name: 'Beta', attributes: { control: 12 }, disciplines: { security: 4 } })

function run(state, seconds) {
  let next = state
  for (let t = 0; t < seconds; t += 0.02) next = partyReducer(next, { type: 'tick', seconds: 0.02 })
  return next
}
const toggle = (state) => partyReducer(state, { type: 'toggleSneak' })
const select = (state, id) => partyReducer(state, { type: 'select', id })

describe('sneak toggle (Prototype)', () => {
  it('turns sneak on for the selected characters only, and off again when they all sneak', () => {
    const party = select(createPartyState(testMap(), [average(), expert()]), 'alpha')
    const on = toggle(party)
    assert.equal(on.members.alpha.sneaking, true)
    assert.equal(on.members.beta.sneaking, false)
    assert.equal(toggle(on).members.alpha.sneaking, false)
  })

  it('with a mixed selection, turns sneak on for everyone selected', () => {
    const party = toggle(select(createPartyState(testMap(), [average(), expert()]), 'alpha'))
    const both = toggle(partyReducer(party, { type: 'toggleSelect', id: 'beta' }))
    assert.equal(both.members.alpha.sneaking, true)
    assert.equal(both.members.beta.sneaking, true)
  })
})

describe('sneak speed from Control + Security (Prototype)', () => {
  it('skill is Control + Security; a higher skill sneaks faster, within the limits', () => {
    assert.equal(sneakSkill(average()), 11)
    assert.equal(sneakSpeed(average()), sneakData.speed.baseSpeed)
    assert.ok(sneakSpeed(expert()) > sneakSpeed(average()))
    assert.ok(sneakSpeed(makeCharacter({ attributes: { control: 12 }, disciplines: { security: 5 } })) <= sneakData.speed.max)
    assert.ok(sneakSpeed(makeCharacter({ attributes: { control: 7 }, disciplines: { security: 0 } })) >= sneakData.speed.min)
  })

  it('a sneaking character moves at their sneak speed, never runs, even on a long move order', () => {
    const party = toggle(select(createPartyState(testMap(), [average(), expert()]), 'alpha'))
    const start = party.members.alpha.position.x
    const moved = run(partyReducer(party, { type: 'moveTo', target: { x: 26, y: 4 }, fresh: true }), 1)
    assert.equal(moved.members.alpha.running, false)
    assert.equal(moved.members.alpha.moving, true)
    const covered = moved.members.alpha.position.x - start
    assert.ok(Math.abs(covered - sneakSpeed(average())) < 0.3, `sneaked ${covered} tiles in 1 s`)
    assert.ok(covered < partyData.movement.walkSpeed)
  })
})

describe('sneaking is harder to notice (Prototype)', () => {
  const npc = { position: { x: 2, y: 3 }, heading: 0, perception: awarenessData.perceptionDefaults }
  const map = createBlankMap({ name: 'Sight Test', width: 12, height: 7 })
  const at = { x: 6, y: 3 }
  const rateFor = (member) => perceive(map, npc, { position: at, ...member }).rate

  it("replaces the moving multiplier with the sneak one, scaled by the character's skill", () => {
    const still = rateFor({ moving: false })
    const sneakingMove = rateFor({ moving: true, sneaking: true, character: average() })
    assert.equal(sneakingMove / still, sneakData.detection.movingMultiplier)
    assert.ok(sneakingMove < rateFor({ moving: true }))
    assert.ok(rateFor({ moving: true, sneaking: true, character: expert() }) < sneakingMove)
    assert.equal(rateFor({ moving: false, sneaking: true, character: average() }) / still, sneakData.detection.stillMultiplier)
  })

  it('the skill factor stays within its limits', () => {
    const best = makeCharacter({ attributes: { control: 12 }, disciplines: { security: 5 } })
    const worst = makeCharacter({ attributes: { control: 7 }, disciplines: { security: 0 } })
    const { movingMultiplier, minFactor, maxFactor } = sneakData.detection
    assert.ok(sneakDetectionMultiplier(best, true) >= movingMultiplier * minFactor - 1e-9)
    assert.ok(sneakDetectionMultiplier(worst, true) <= movingMultiplier * maxFactor + 1e-9)
  })

  it('inside close range a sneaking character is still identified at once', () => {
    assert.equal(perceive(map, npc, { position: { x: 3.5, y: 3 }, moving: true, sneaking: true, character: expert() }).immediate, true)
  })
})
