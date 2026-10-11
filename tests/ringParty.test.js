// The away team on the outer ring of an NPC's or a challenge object's radial menu (designer request 2026-10-11): who
// could do the button last hovered and who is best at it, from the same recommendation the panels use.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import brigFile from '../maps/Deck 10 Brig.json'
import { createExplorationState } from '../src/exploration/explorationState.js'
import { npcButtonPerformer, ringPartyView } from '../src/exploration/ringParty.js'
import { createBlankMap, parseMapFile } from '../src/maps/mapFormat.js'
import { objectFor } from '../src/world/objects.js'
import { makeCharacter } from './support/characters.js'

const scientist = (id, equipment) => makeCharacter({ id, name: id, attributes: { reason: 12 }, disciplines: { science: 5 }, equipment })

function npcState() {
  const map = createBlankMap({ name: 'Ring Test Room', width: 16, height: 12 })
  map.markers.playerStarts = [
    { x: 2, y: 5 },
    { x: 2, y: 7 },
  ]
  map.markers.enemySpawns = [{ x: 10, y: 6 }]
  return createExplorationState(map, [scientist('alpha', [{ itemId: 'scienceTricorder' }]), scientist('beta', [])], 1, { enemiesActive: false })
}

const byId = (view) => Object.fromEntries(view.members.map((member) => [member.id, member]))

describe('Ring party band (Prototype)', () => {
  it('NPC Scan: only those who can scan the NPC are judged; the best gets the star', () => {
    const state = npcState()
    const npcId = Object.keys(state.world.npcs)[0]
    const view = ringPartyView(state, { npcId }, 'scan')
    const { alpha, beta } = byId(view)
    assert.equal(view.hasTask, true)
    assert.equal(alpha.available, true)
    assert.equal(alpha.possible, true)
    assert.equal(typeof alpha.targetNumber, 'number')
    assert.equal(alpha.best, true)
    assert.equal(beta.available, false)
    assert.equal(beta.reason, 'Carries no tricorder.')
    assert.equal(beta.targetNumber, null)
  })

  it('Info, Go To, Use Item and no button hovered: no comparison', () => {
    const state = npcState()
    const npcId = Object.keys(state.world.npcs)[0]
    for (const buttonId of ['info', 'goTo', 'useItem', null]) {
      const view = ringPartyView(state, { npcId }, buttonId)
      assert.equal(view.hasTask, false, String(buttonId))
      assert.ok(view.members.every((member) => member.available && member.targetNumber === null && !member.best))
    }
  })

  it('Talk ranks on Presence + Command and Attack on Control + Security; the pick, else the best, performs', () => {
    const map = createBlankMap({ name: 'Ring Test Room', width: 16, height: 12 })
    map.markers.playerStarts = [
      { x: 2, y: 5 },
      { x: 2, y: 7 },
    ]
    map.markers.enemySpawns = [{ x: 10, y: 6 }]
    const talker = makeCharacter({ id: 'talker', name: 'Talker', attributes: { presence: 12, control: 7 }, disciplines: { command: 5, security: 1 } })
    const shooter = makeCharacter({ id: 'shooter', name: 'Shooter', attributes: { presence: 7, control: 12 }, disciplines: { command: 1, security: 5 } })
    const state = createExplorationState(map, [talker, shooter], 1, { enemiesActive: false })
    const npcId = Object.keys(state.world.npcs)[0]
    assert.deepEqual(ringPartyView(state, { npcId }, 'talk').bestIds, ['talker'])
    assert.deepEqual(ringPartyView(state, { npcId }, 'attack').bestIds, ['shooter'])
    assert.equal(npcButtonPerformer(state, npcId, 'attack'), 'shooter')
    assert.equal(npcButtonPerformer(state, npcId, 'attack', 'talker'), 'talker')
  })

  it('object approach: members out of reach are left out; the rest match the object recommendation', () => {
    const team = [
      makeCharacter({ id: 'alpha', name: 'Alpha', attributes: { control: 11, reason: 10 }, disciplines: { engineering: 4 }, equipment: [{ itemId: 'engineeringToolkit' }] }),
      makeCharacter({ id: 'beta', name: 'Beta', attributes: { daring: 11 }, disciplines: { security: 4 } }),
      makeCharacter({ id: 'gamma', name: 'Gamma', attributes: { reason: 11 }, disciplines: { science: 4 } }),
    ]
    const start = createExplorationState(parseMapFile({ ...brigFile, objectPlacements: {} }, 'Deck 10 Brig'), team, 3, { enemiesActive: false })
    const definition = start.scenario.definitions.find((candidate) => candidate.actions.some((action) => !action.routine))
    const action = definition.actions.find((candidate) => !candidate.routine)
    const [x, y] = definition.position
    const spots = { alpha: { x: x + 1, y }, beta: { x: x + 30, y: y + 30 }, gamma: { x, y: y + 1 } }
    const members = Object.fromEntries(start.party.memberIds.map((id) => [id, { ...start.party.members[id], position: spots[id] }]))
    const state = { ...start, party: { ...start.party, members } }

    const view = ringPartyView(state, { objectId: definition.id }, action.id)
    const expected = objectFor(state.scenario, definition.id).recommend(state, action.id, ['alpha', 'gamma'])
    const entries = byId(view)
    assert.equal(view.hasTask, true)
    assert.equal(entries.beta.available, false)
    assert.equal(entries.beta.reason, 'Not close enough.')
    for (const id of ['alpha', 'gamma']) {
      assert.equal(entries[id].available, true)
      assert.equal(entries[id].targetNumber, expected.entries[id].targetNumber)
      assert.equal(entries[id].best, expected.bestIds.includes(id))
    }
  })
})
