// Away team size and spawn placements (exploration/awayTeam.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { FIRETEAM_A_SIZE, MAX_AWAY_TEAM, maxAwayTeamSize, placeAwayTeam, splitFireteams } from '../src/exploration/awayTeam.js'
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

  it('splits pick order into Fireteam A (4) and B (the rest)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    assert.deepEqual(splitFireteams(ids), { teamA: ids.slice(0, FIRETEAM_A_SIZE), teamB: ids.slice(FIRETEAM_A_SIZE) })
    assert.deepEqual(splitFireteams(ids.slice(0, 3)), { teamA: ['a', 'b', 'c'], teamB: [] })
  })

  it('starts with Fireteam A selected and B following the lead', () => {
    const map = {
      ...createBlankMap({ name: 'Starts', width: 16, height: 16 }),
      markers: { playerStarts: [{ x: 4, y: 4 }], enemySpawns: [] },
    }
    const characters = Array.from({ length: 8 }, (_, i) => makeCharacter({ id: `c${i}`, name: `Officer ${i}` }))
    const party = createPartyState(map, characters)
    assert.deepEqual(party.selectedIds, party.memberIds.slice(0, FIRETEAM_A_SIZE))
    assert.equal(party.leaderId, party.memberIds[0])
    party.memberIds.slice(FIRETEAM_A_SIZE).forEach((id) => {
      assert.equal(party.members[id].order?.type, 'follow')
      assert.equal(party.members[id].order.leaderId, party.leaderId)
    })
  })

  it('hitches Fireteam B when A moves; a B-only selection moves alone', () => {
    const map = {
      ...createBlankMap({ name: 'Starts', width: 24, height: 24 }),
      markers: { playerStarts: [{ x: 10, y: 10 }], enemySpawns: [] },
    }
    const characters = Array.from({ length: 8 }, (_, i) => makeCharacter({ id: `c${i}`, name: `Officer ${i}` }))
    let party = createPartyState(map, characters)
    const [lead, , , , b0] = party.memberIds
    party = partyReducer(party, { type: 'moveTo', target: { x: 14, y: 12 }, fresh: true })
    party.memberIds.slice(FIRETEAM_A_SIZE).forEach((id) => {
      assert.equal(party.members[id].order?.type, 'follow')
      assert.equal(party.members[id].order.leaderId, lead)
    })
    party = partyReducer(party, { type: 'select', id: b0 })
    party = partyReducer(party, { type: 'moveTo', target: { x: 8, y: 8 }, fresh: true })
    assert.equal(party.members[b0].order?.type, 'point')
    assert.equal(party.members[lead].order?.type, 'point')
  })
})
