// Right-drag box selection in exploration (designer decision, 2026-10-09). Prototype only: the books have no map
// selection.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createPartyState, partyReducer } from '../src/exploration/partyControl.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

function testMap() {
  const map = createBlankMap({ name: 'Box Select Test Room', width: 12, height: 10 })
  map.markers.playerStarts = [
    { x: 3, y: 3 },
    { x: 4, y: 4 },
    { x: 5, y: 5 },
  ]
  return map
}
const team = () => ['alpha', 'beta', 'gamma'].map((id) => makeCharacter({ id, name: id }))
const box = (state, ids, additive = false) => partyReducer(state, { type: 'selectBox', ids, additive })

describe('box selection (Prototype)', () => {
  it('the characters in the box replace the selection, and the first in team order leads', () => {
    const party = partyReducer(createPartyState(testMap(), team()), { type: 'select', id: 'alpha' })
    const next = box(party, ['gamma', 'beta'])
    assert.deepEqual(next.selectedIds, ['beta', 'gamma'])
    assert.equal(next.leaderId, 'beta')
  })

  it('the lead stays the lead when still in the box', () => {
    const party = partyReducer(createPartyState(testMap(), team()), { type: 'select', id: 'gamma' })
    assert.equal(box(party, ['beta', 'gamma']).leaderId, 'gamma')
  })

  it('additive (Ctrl) adds the boxed characters to the selection', () => {
    const party = partyReducer(createPartyState(testMap(), team()), { type: 'select', id: 'alpha' })
    const next = box(party, ['gamma'], true)
    assert.deepEqual(next.selectedIds, ['alpha', 'gamma'])
    assert.equal(next.leaderId, 'alpha')
  })

  it('an empty box, or one holding only Defeated characters, changes nothing', () => {
    const party = partyReducer(createPartyState(testMap(), team()), { type: 'select', id: 'alpha' })
    assert.equal(box(party, []), party)
    const downed = { ...party, members: { ...party.members, beta: { ...party.members.beta, condition: { stress: 0, injuries: [], defeated: true } } } }
    assert.equal(box(downed, ['beta']), downed)
    assert.deepEqual(box(downed, ['beta', 'gamma']).selectedIds, ['gamma'])
  })
})
