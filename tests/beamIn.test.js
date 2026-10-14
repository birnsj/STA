// The transporter (exploration/partyControl.js startBeamIn / finishBeamIn, the explorationState 'startBeamIn' action):
// characters beam in beside the lead, can't act until the beam has played, and each arrival is logged.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import brigFile from '../maps/Deck 10 Brig.json'
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { MODE } from '../src/exploration/combatLink.js'
import { isClear, RADIUS } from '../src/exploration/navigation.js'
import { parseMapFile } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const character = (id) => makeCharacter({ id, name: id[0].toUpperCase() + id.slice(1) })
const start = () => createExplorationState(parseMapFile({ ...brigFile, objectPlacements: {} }, 'Deck 10 Brig'), ['alpha', 'bravo'].map(character), 3, { enemiesActive: false })
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

describe('beam in', () => {
  it('puts a new character on a clear spot beside the lead, unable to act until the beam has played', () => {
    let state = explorationReducer(start(), { type: 'startBeamIn', characters: [character('delta')] })
    const { party } = state
    const delta = party.members.delta
    assert.deepEqual(party.memberIds, ['alpha', 'bravo', 'delta'])
    assert.equal(delta.arriving, true)
    assert.ok(isClear(party.map, delta.position))
    assert.ok(distance(delta.position, party.members[party.leaderId].position) < 4)
    party.memberIds.filter((id) => id !== 'delta').forEach((id) => assert.ok(distance(party.members[id].position, delta.position) >= RADIUS * 2))
    assert.ok(state.missionLog.entries.some((entry) => entry.kind === 'beam' && entry.text === 'Delta beamed in.'))
    state = explorationReducer(state, { type: 'select', id: 'delta' })
    assert.ok(!state.party.selectedIds.includes('delta'))
    state = explorationReducer(state, { type: 'finishBeamIn', ids: ['delta'] })
    state = explorationReducer(state, { type: 'select', id: 'delta' })
    assert.deepEqual(state.party.selectedIds, ['delta'])
  })

  it('brings back someone who beamed out, as they left, and takes them off the departed list', () => {
    let state = explorationReducer(start(), { type: 'beamOut', ids: ['bravo'] })
    const condition = state.party.members.bravo.condition
    state = explorationReducer(state, { type: 'startBeamIn', characters: [state.party.members.bravo.character] })
    assert.deepEqual(state.party.memberIds, ['alpha', 'bravo'])
    assert.deepEqual(state.party.departedIds, [])
    assert.deepEqual(state.party.members.bravo.condition, condition)
  })

  it('several at once land on separate spots', () => {
    const state = explorationReducer(start(), { type: 'startBeamIn', characters: ['delta', 'echo', 'foxtrot'].map(character) })
    const [d, e, f] = ['delta', 'echo', 'foxtrot'].map((id) => state.party.members[id].position)
    assert.ok(distance(d, e) >= RADIUS * 2 && distance(d, f) >= RADIUS * 2 && distance(e, f) >= RADIUS * 2)
  })

  it('ignores anyone already on the mission, and does nothing during a fight', () => {
    const state = start()
    assert.equal(explorationReducer(state, { type: 'startBeamIn', characters: [character('alpha')] }), state)
    const fighting = { ...state, mode: MODE.COMBAT }
    assert.equal(explorationReducer(fighting, { type: 'startBeamIn', characters: [character('delta')] }), fighting)
  })
})
