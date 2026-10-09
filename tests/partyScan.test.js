// Scan from a character's radial menu in exploration (designer decision, 2026-10-09): Reason + Science
// (partyActions.json); every scan reports the location and environment, a success also reveals NPCs in tricorder range
// as life signs and counts the enemies among them.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import scanData from '../src/data/adaptation/exploration/scan.json' with { type: 'json' }
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { getEntityKnowledge, KNOWLEDGE } from '../src/exploration/partyKnowledge.js'
import { canScan, compassPoint, scanCooldown, scanRadius } from '../src/exploration/partyScan.js'
import { partyReducer } from '../src/exploration/partyControl.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

// The party at the west end, one NPC eight tiles east: inside a science tricorder's range. No tick runs, so the party
// has perceived nothing before the scan.
function testMap() {
  const map = createBlankMap({ name: 'Scan Test Room', width: 16, height: 12 })
  map.markers.playerStarts = [
    { x: 2, y: 5 },
    { x: 2, y: 7 },
  ]
  map.markers.enemySpawns = [{ x: 10, y: 6 }]
  return map
}

const scientist = (id, equipment) => makeCharacter({ id, name: id, attributes: { reason: 12 }, disciplines: { science: 5 }, equipment })
const team = () => [scientist('alpha', [{ itemId: 'scienceTricorder' }]), scientist('beta', [])]
const start = (seed) => createExplorationState(testMap(), team(), seed, { enemiesActive: false })
const npcIdOf = (state) => Object.keys(state.world.npcs)[0]

describe('Scan (Prototype)', () => {
  it('reaches 15 tiles with a standard tricorder, 40 with a science one; nothing to scan with, no scan', () => {
    const state = start(1)
    assert.equal(scanRadius(state.party.members.alpha.character), 40)
    assert.equal(scanRadius(scientist('gamma', [{ itemId: 'standardTricorder' }])), 15)
    assert.equal(scanRadius(state.party.members.beta.character), 0)
    assert.equal(canScan(state, 'beta').possible, false)
    assert.equal(explorationReducer(state, { type: 'scan', memberId: 'beta' }), state)
  })

  it('a success reveals the NPC in range as a life sign (not identified), through no line of sight; a failure reveals nothing', () => {
    const outcomes = { success: null, failure: null }
    for (let seed = 0; seed < 200 && !(outcomes.success && outcomes.failure); seed++) {
      const next = explorationReducer(start(seed), { type: 'scan', memberId: 'alpha' })
      outcomes[next.lastScan.success ? 'success' : 'failure'] ??= next
    }
    const { success, failure } = outcomes
    assert.ok(success && failure, 'found both a success and a failure')
    const seen = getEntityKnowledge(success.partyKnowledge, npcIdOf(success))
    assert.equal(seen.state === KNOWLEDGE.VISIBLE || seen.state === KNOWLEDGE.KNOWN, true)
    assert.equal(seen.identified, false)
    assert.equal(success.lastScan.found, 1)
    assert.equal(success.lastScan.enemies, 1)
    assert.deepEqual(success.lastScan.enemyContacts, [{ direction: 'E', distance: 8 }])
    assert.deepEqual(failure.lastScan.enemyContacts, [])
    assert.equal(getEntityKnowledge(failure.partyKnowledge, npcIdOf(failure)).state, KNOWLEDGE.UNKNOWN)
    assert.equal(failure.lastScan.found, 0)
    assert.equal(failure.lastScan.enemies, 0)
    // The location and environment are reported either way.
    assert.equal(failure.lastScan.location.mapName, 'Scan Test Room')
    assert.deepEqual(failure.lastScan.location, success.lastScan.location)
  })

  it('reports the map, its location type, the nearest named area, weather, light and scene traits', () => {
    const map = { ...testMap(), mapType: 'miningSite', biome: 'desert', weather: 'rain', ambient: 40, areas: [{ name: 'Ore Shed', position: { x: 3, y: 5 } }, { name: 'Pit', position: { x: 13, y: 5 } }] }
    const state = createExplorationState(map, team(), 1, { enemiesActive: false })
    const withTrait = { ...state, scenario: { ...state.scenario, traits: [{ name: 'Smoke', potency: 1 }] } }
    const { location } = explorationReducer(withTrait, { type: 'scan', memberId: 'alpha' }).lastScan
    assert.equal(location.locationType, 'Mining Site')
    assert.equal(location.area, 'Ore Shed')
    assert.equal(location.biome, 'Desert')
    assert.equal(location.weather, 'Rain')
    assert.equal(location.light, 40)
    assert.deepEqual(location.traits, ['Smoke'])
  })

  it('then waits cooldownSeconds of world time before that character can scan again', () => {
    const scanned = explorationReducer(start(3), { type: 'scan', memberId: 'alpha' })
    assert.equal(scanCooldown(scanned, 'alpha'), scanData.cooldownSeconds)
    assert.equal(explorationReducer(scanned, { type: 'scan', memberId: 'alpha' }), scanned)
    const later = { ...scanned, world: { ...scanned.world, time: scanned.world.time + scanData.cooldownSeconds } }
    assert.equal(canScan(later, 'alpha').possible, true)
  })

  it('gives enemy directions as compass points, north being up on the minimap', () => {
    const from = { x: 5, y: 5 }
    const points = [[5, 0, 'N'], [9, 1, 'NE'], [10, 5, 'E'], [9, 9, 'SE'], [5, 10, 'S'], [1, 9, 'SW'], [0, 5, 'W'], [1, 1, 'NW'], [6, 0, 'N']]
    for (const [x, y, expected] of points) assert.equal(compassPoint(from, { x, y }), expected)
  })
})

describe('Sneak from the radial menu', () => {
  it('toggles that one character, selected or not', () => {
    const { party } = start(1)
    const selected = partyReducer(party, { type: 'select', id: 'alpha' })
    const next = partyReducer(selected, { type: 'toggleSneakFor', id: 'beta' })
    assert.equal(next.members.beta.sneaking, true)
    assert.equal(next.members.alpha.sneaking, selected.members.alpha.sneaking)
  })
})
