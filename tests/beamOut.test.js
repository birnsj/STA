// Beaming out of a mission (exploration/partyControl.js startBeamOut / beamOut, the explorationState 'beamOut' action):
// those characters leave the away team, the rest carry on, and each departure is logged.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import brigFile from '../maps/Deck 10 Brig.json'
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { getNpcs } from '../src/exploration/awareness.js'
import { MODE, startCombat } from '../src/exploration/combatLink.js'
import { parseMapFile } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const team = () => ['alpha', 'bravo', 'charlie'].map((id) => makeCharacter({ id, name: id[0].toUpperCase() + id.slice(1) }))
const start = () => createExplorationState(parseMapFile({ ...brigFile, objectPlacements: {} }, 'Deck 10 Brig'), team(), 3, { enemiesActive: false })

describe('beam out', () => {
  it('locking on stops the character and takes them out of the selection; they cannot be selected meanwhile', () => {
    let state = explorationReducer(start(), { type: 'moveTo', target: { x: 5, y: 5 }, fresh: true })
    state = explorationReducer(state, { type: 'startBeamOut', ids: ['alpha'] })
    assert.equal(state.party.members.alpha.beaming, true)
    assert.equal(state.party.members.alpha.order, null)
    assert.ok(!state.party.selectedIds.includes('alpha'))
    assert.notEqual(state.party.leaderId, 'alpha')
    assert.ok(state.party.memberIds.includes('alpha'))
    state = explorationReducer(state, { type: 'select', id: 'alpha' })
    assert.ok(!state.party.selectedIds.includes('alpha'))
  })

  it('beaming out removes only that character, keeps them nameable and logs it', () => {
    let state = explorationReducer(start(), { type: 'startBeamOut', ids: ['bravo'] })
    state = explorationReducer(state, { type: 'beamOut', ids: ['bravo'] })
    assert.deepEqual(state.party.memberIds, ['alpha', 'charlie'])
    assert.deepEqual(state.party.departedIds, ['bravo'])
    assert.equal(state.party.members.bravo.character.name, 'Bravo')
    assert.ok(state.missionLog.entries.some((entry) => entry.kind === 'beam' && entry.text === 'Bravo beamed out.'))
    state = explorationReducer(state, { type: 'tick', seconds: 0.05 })
    assert.ok(state.party.members.bravo, 'a tick keeps the departed in members')
  })

  it('anyone following a character who beams out stops where they are', () => {
    let state = explorationReducer(start(), { type: 'moveTo', target: { x: 6, y: 6 }, fresh: true })
    const leaderId = state.party.leaderId
    const follower = state.party.memberIds.find((id) => state.party.members[id].order?.type === 'follow')
    assert.ok(follower)
    state = explorationReducer(state, { type: 'startBeamOut', ids: [leaderId] })
    state = explorationReducer(state, { type: 'beamOut', ids: [leaderId] })
    assert.equal(state.party.members[follower].order, null)
    assert.notEqual(state.party.leaderId, leaderId)
  })

  it('with everyone beamed out the away team is empty', () => {
    const ids = start().party.memberIds
    let state = explorationReducer(start(), { type: 'startBeamOut', ids })
    assert.deepEqual(state.party.selectedIds, [])
    state = explorationReducer(state, { type: 'beamOut', ids })
    assert.deepEqual(state.party.memberIds, [])
    assert.deepEqual(state.party.departedIds, ids)
  })

  it('a fight breaking out before the beam completes keeps them on the mission', () => {
    let state = explorationReducer(start(), { type: 'startBeamOut', ids: ['alpha'] })
    state = explorationReducer({ ...state, mode: MODE.COMBAT }, { type: 'beamOut', ids: ['alpha'] })
    assert.ok(state.party.memberIds.includes('alpha'))
    assert.equal(state.party.members.alpha.beaming, false)
  })

  it('starting combat immediately invalidates every pending beam-out', () => {
    let state = explorationReducer(start(), { type: 'startBeamOut', ids: ['alpha', 'bravo'] })
    const npc = getNpcs(state.world).find((candidate) => candidate.character)
    assert.ok(npc)
    state = startCombat(state, { triggerNpcId: npc.id, triggerTargetId: 'charlie' })
    assert.equal(state.mode, MODE.COMBAT)
    assert.equal(state.party.members.alpha.beaming, false)
    assert.equal(state.party.members.bravo.beaming, false)
  })

  it('ignores the old beam timer after that combat has already ended', () => {
    let state = explorationReducer(start(), { type: 'startBeamOut', ids: ['alpha'] })
    const npc = getNpcs(state.world).find((candidate) => candidate.character)
    state = startCombat(state, { triggerNpcId: npc.id, triggerTargetId: 'charlie' })
    state = { ...state, mode: MODE.EXPLORATION, combat: null }
    state = explorationReducer(state, { type: 'beamOut', ids: ['alpha'] })
    assert.ok(state.party.memberIds.includes('alpha'))
    assert.equal(state.party.members.alpha.beaming, false)
  })
})
