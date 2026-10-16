// Moving an away team of 8 (partyControl.js): form up and tick must not throw.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { createPartyState, getFollowTargets, partyReducer } from '../src/exploration/partyControl.js'
import { makeCharacter } from './support/characters.js'

describe('party move with 8', () => {
  it('moveTo and ticks with eight selected members', () => {
    const map = {
      ...createBlankMap({ name: 'Starts', width: 24, height: 24 }),
      markers: { playerStarts: [{ x: 10, y: 10 }, { x: 11, y: 10 }], enemySpawns: [] },
    }
    const characters = Array.from({ length: 8 }, (_, i) => makeCharacter({ id: `c${i}`, name: `Officer ${i}` }))
    let party = createPartyState(map, characters)
    assert.equal(party.memberIds.length, 8)
    party = partyReducer(party, { type: 'regroup' })
    assert.equal(party.selectedIds.length, 8)
    party = partyReducer(party, { type: 'moveTo', target: { x: 14, y: 12 }, fresh: true })
    const targets = getFollowTargets(party)
    assert.equal(Object.keys(targets).length, 7)
    for (const id of Object.keys(targets)) {
      assert.ok(targets[id] && Number.isFinite(targets[id].x) && Number.isFinite(targets[id].y), id)
    }
    for (let i = 0; i < 180; i += 1) {
      party = partyReducer(party, { type: 'tick', seconds: 1 / 60 })
    }
    assert.equal(party.memberIds.length, 8)
  })
})
