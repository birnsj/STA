// Objectives that move by themselves (exploration/missionObjectives.js): a map objective's activeWhen / completeWhen
// flag conditions, the map file round trip, and the Deck 10 Brig's authored objectives.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import brigFile from '../maps/Deck 10 Brig.json'
import { objectivePosition } from '../src/exploration/challengeObjects.js'
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { objectiveStatus } from '../src/exploration/missionFlags.js'
import { updateObjectives } from '../src/exploration/missionObjectives.js'
import { parseMapFile, serializeMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const brigMap = () => parseMapFile(brigFile, 'Deck 10 Brig')
const brig = () => createExplorationState(brigMap(), [makeCharacter({ id: 'alpha', name: 'Alpha' })], 3, { enemiesActive: false })
const withFlags = (state, flags) => ({ ...state, scenario: { ...state.scenario, flags: { ...state.scenario.flags, ...flags } } })
const status = (state, id) => objectiveStatus(state.scenario.flags, id)
const logTexts = (state) => (state.missionLog?.entries ?? []).map((entry) => entry.text)

describe('objectives with conditions', () => {
  it('start inactive, and the map file keeps their conditions', () => {
    const state = brig()
    assert.equal(status(state, 'okaforClearance'), null)
    const again = parseMapFile(serializeMap(brigMap()), 'Deck 10 Brig')
    assert.deepEqual(
      again.objectives.find((objective) => objective.id === 'klingonGuards').completeWhen.map((condition) => condition.flag),
      ['defeated.guardA', 'defeated.guardB', 'defeated.guardC'],
    )
  })

  it('meeting Lt. Okafor starts the clearance objective; her clearance completes it, with log entries', () => {
    let state = updateObjectives(withFlags(brig(), { engineerMet: true }))
    assert.equal(status(state, 'okaforClearance'), 'active')
    state = explorationReducer(withFlags(state, { sectionAccessGranted: true }), { type: 'tick', seconds: 0.1 })
    assert.equal(status(state, 'okaforClearance'), 'complete')
    assert.ok(logTexts(state).includes("Objective complete: Get Lt. Okafor's clearance."))
  })

  it('an opened bulkhead completes the way in and starts the guards in one update', () => {
    const state = updateObjectives(withFlags(brig(), { stationPowerRestored: true, eastSectionOpen: true }))
    assert.equal(status(state, 'enterEastSection'), 'complete')
    assert.equal(status(state, 'klingonGuards'), 'active')
  })

  it('the guards objective completes once all three are down or surrendered, never before', () => {
    const two = updateObjectives(withFlags(brig(), { eastSectionOpen: true, 'defeated.guardA': true, 'defeated.guardB': true }))
    assert.equal(status(two, 'klingonGuards'), 'active')
    assert.equal(status(updateObjectives(withFlags(two, { 'defeated.guardC': true })), 'klingonGuards'), 'complete')
  })

  it('a linked objective is marked on its challenge object, wherever the map puts it', () => {
    const map = brigMap()
    assert.deepEqual(objectivePosition(map, map.objectives[0]), { x: 23, y: 23 })
    const moved = { ...map, objectPlacements: { powerJunction01: { x: 20, y: 22 } } }
    assert.deepEqual(objectivePosition(moved, moved.objectives[0]), { x: 20, y: 22 })
    assert.deepEqual(objectivePosition(map, { ...map.objectives[0], objectId: null }), map.objectives[0].position)
  })

  it('never moves an objective back', () => {
    const done = withFlags(brig(), { 'objective.okaforClearance': 'complete' })
    assert.equal(status(updateObjectives(done), 'okaforClearance'), 'complete')
  })
})
