// Away team size and spawn placements (exploration/awayTeam.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { MAX_AWAY_TEAM, maxAwayTeamSize, placeAwayTeam } from '../src/exploration/awayTeam.js'
import { createPartyState, partyReducer } from '../src/exploration/partyControl.js'
import { makeCharacter } from './support/characters.js'

describe('awayTeam', () => {
  it('caps the away team at 8 when the map has player starts', () => {
    const map = {
      ...createBlankMap({ name: 'Starts', width: 12, height: 12 }),
      markers: { playerStarts: [{ x: 2, y: 2 }, { x: 3, y: 2 }], enemySpawns: [] },
    }
    assert.equal(maxAwayTeamSize(map), MAX_AWAY_TEAM)
    assert.equal(maxAwayTeamSize(createBlankMap({ name: 'Empty', width: 8, height: 8 })), 0)
  })

  it('places more members than starts on free tiles nearby', () => {
    const map = {
      ...createBlankMap({ name: 'Starts', width: 16, height: 16 }),
      markers: { playerStarts: [{ x: 4, y: 4 }, { x: 5, y: 4 }], enemySpawns: [] },
    }
    const characters = Array.from({ length: 8 }, (_, i) => makeCharacter({ id: `c${i}`, name: `Officer ${i}` }))
    const placements = placeAwayTeam(map, characters)
    assert.equal(placements.length, 8)
    const keys = new Set(placements.map(({ position }) => `${position.x},${position.y}`))
    assert.equal(keys.size, 8)
    assert.ok(placements.some(({ position }) => position.x === 4 && position.y === 4))
    assert.ok(placements.some(({ position }) => position.x === 5 && position.y === 4))
  })

  it('createPartyState keeps all eight members', () => {
    const map = {
      ...createBlankMap({ name: 'Starts', width: 16, height: 16 }),
      markers: { playerStarts: [{ x: 4, y: 4 }], enemySpawns: [] },
    }
    const characters = Array.from({ length: 8 }, (_, i) => makeCharacter({ id: `c${i}`, name: `Officer ${i}` }))
    const party = createPartyState(map, characters)
    assert.equal(party.memberIds.length, 8)
  })

  it('starts with the whole away team selected, standing still and facing their start', () => {
    const map = {
      ...createBlankMap({ name: 'Starts', width: 16, height: 16 }),
      markers: { playerStarts: [{ x: 4, y: 4, facing: 90 }], enemySpawns: [] },
    }
    const characters = Array.from({ length: 8 }, (_, i) => makeCharacter({ id: `c${i}`, name: `Officer ${i}` }))
    const party = createPartyState(map, characters)
    assert.deepEqual(party.selectedIds, party.memberIds)
    assert.equal(party.leaderId, party.memberIds[0])
    party.memberIds.forEach((id) => {
      assert.equal(party.members[id].order, null)
      assert.equal(party.members[id].moving, false)
      assert.ok(Math.abs(party.members[id].heading - Math.PI / 2) < 1e-6)
    })
  })

  it('moves the whole selected away team; a single selection moves alone', () => {
    const map = {
      ...createBlankMap({ name: 'Starts', width: 24, height: 24 }),
      markers: { playerStarts: [{ x: 10, y: 10 }], enemySpawns: [] },
    }
    const characters = Array.from({ length: 8 }, (_, i) => makeCharacter({ id: `c${i}`, name: `Officer ${i}` }))
    let party = createPartyState(map, characters)
    const [lead, second] = party.memberIds
    party = partyReducer(party, { type: 'moveTo', target: { x: 14, y: 12 }, fresh: true })
    assert.equal(party.members[lead].order?.type, 'point')
    party.memberIds.slice(1).forEach((id) => {
      assert.equal(party.members[id].order?.type, 'follow')
      assert.equal(party.members[id].order.leaderId, lead)
    })
    party = partyReducer(party, { type: 'select', id: second })
    party = partyReducer(party, { type: 'moveTo', target: { x: 8, y: 8 }, fresh: true })
    assert.equal(party.members[second].order?.type, 'point')
    assert.equal(party.members[lead].order?.type, 'point')
    party.memberIds.slice(2).forEach((id) => {
      assert.equal(party.members[id].order?.type, 'follow')
      assert.equal(party.members[id].order.leaderId, lead)
    })
  })
})
