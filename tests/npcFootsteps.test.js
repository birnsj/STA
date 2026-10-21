// Whether the away team hears an NPC or enemy walking in exploration (awareness.js partyHearsWalker). Presentation uses
// the same answer to play the footstep. Prototype: walking is heard within the walk radius, and a wall blocks it.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { partyHearsWalker } from '../src/exploration/awareness.js'
import { createBlankMap } from '../src/maps/mapFormat.js'

const map = createBlankMap({ name: 'Footstep Room', width: 16, height: 12 })
const up = (x, y) => ({ id: `p-${x}`, position: { x, y }, condition: {} })
const down = (x, y) => ({ id: `p-${x}`, position: { x, y }, condition: { defeated: true } })
const walker = (x, y, moving = true) => ({ id: 'guard', position: { x, y }, moving })

describe('party hears a walking NPC or enemy', () => {
  it('hears a walker within the walk radius, and not one further away or standing still', () => {
    assert.equal(partyHearsWalker(map, [up(2, 2)], walker(4, 2)), true)
    assert.equal(partyHearsWalker(map, [up(2, 2)], walker(8, 2)), false)
    assert.equal(partyHearsWalker(map, [up(2, 2)], walker(4, 2, false)), false)
    assert.equal(partyHearsWalker(undefined, [up(2, 2)], walker(4, 2)), false)
  })

  it('a wall between them blocks the sound, and a defeated party member does not hear it', () => {
    const walled = { ...map, sightBlockers: { '3,2': true } }
    assert.equal(partyHearsWalker(walled, [up(2, 2)], walker(4, 2)), false)
    assert.equal(partyHearsWalker(map, [down(2, 2)], walker(4, 2)), false)
    assert.equal(partyHearsWalker(map, [down(2, 2), up(4, 3)], walker(4, 2)), true)
  })
})
