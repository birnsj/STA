// The Captain's Log (Prototype): stardates, entries for objectives, checks and authored text, and the map's briefing.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import engineerFile from '../conversations/engineerSealedSection.json'
import brigFile from '../maps/Deck 10 Brig.json'
import logData from '../src/data/adaptation/exploration/missionLog.json'
import { createNode, parseConversation } from '../src/conversation/conversationFormat.js'
import { objectivePosition } from '../src/exploration/challengeObjects.js'
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { addLogEntry, stardateAt } from '../src/exploration/missionLog.js'
import { createBlankMap, parseMapFile, resizeMap, serializeMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const engineerTalk = parseConversation(engineerFile, 'engineerSealedSection')
const team = () => [makeCharacter({ id: 'alpha', name: 'Alpha' }), makeCharacter({ id: 'beta', name: 'Beta', attributes: { reason: 12 }, disciplines: { engineering: 4 } })]

function roomWithEngineer() {
  const map = createBlankMap({ name: 'Log Test Room', width: 14, height: 10 })
  map.markers.playerStarts = [
    { x: 4, y: 4 },
    { x: 4, y: 5 },
  ]
  map.markers.enemySpawns = []
  map.npcs = [{ id: 'eng', characterId: 'stationEngineer', name: null, position: { x: 5, y: 4 }, facing: 180, disposition: 'friendly', conversationId: 'engineerSealedSection' }]
  map.objectives = [{ id: 'restorePower', title: 'Restore power', description: '', position: null }]
  return map
}

const talk = (state, definition = engineerTalk) => explorationReducer(state, { type: 'talk', npcId: 'eng', definition })
const choose = (state, optionId) => explorationReducer(state, { type: 'conversationChoose', optionId })
const texts = (state) => state.missionLog.entries.map((entry) => entry.text)

describe("the Captain's Log", () => {
  it('counts the stardate up from the map (or the default) with world time', () => {
    assert.equal(stardateAt({ stardate: 4100.5 }, 0), '4100.5')
    assert.equal(stardateAt({ stardate: 4100.5 }, logData.stepSeconds * 2 + 1), (4100.5 + logData.stardateStep * 2).toFixed(1))
    assert.equal(stardateAt({ stardate: null }, 0), logData.defaultStardate.toFixed(1))
  })

  it('starts empty and ignores blank entries', () => {
    const state = createExplorationState(roomWithEngineer(), team())
    assert.deepEqual(state.missionLog.entries, [])
    assert.equal(addLogEntry(state, { text: '   ' }), state)
    const logged = addLogEntry(state, { text: ' Something happened. ' })
    assert.deepEqual(logged.missionLog.entries, [{ id: 1, time: state.world.time, kind: 'authored', text: 'Something happened.' }])
  })

  it('logs an objective when a conversation makes it active', () => {
    const state = choose(talk(createExplorationState(roomWithEngineer(), team())), 'offerHelp')
    assert.deepEqual(texts(state), ['New objective: Restore power.'])
    assert.equal(state.missionLog.entries[0].kind, 'objective')
  })

  it('logs the result of a conversation check', () => {
    const start = choose(talk(createExplorationState(roomWithEngineer(), team(), 7)), 'investigate')
    const rolled = explorationReducer(start, { type: 'conversationRoll', performerId: 'beta', purchase: { bonusDice: 1, momentum: 0 } })
    const success = rolled.conversation.lastCheck.result.success
    const check = rolled.missionLog.entries.find((entry) => entry.kind === 'check')
    assert.match(check.text, new RegExp(`^Beta: .* \\(with Lt\\. Mara Okafor\\): ${success ? 'succeeded' : 'failed'}\\.$`))
  })

  it("a conversation's Add log entry action writes the author's text", () => {
    const definition = {
      id: 'logTest',
      name: 'Log test',
      start: 'a',
      nodes: [{ ...createNode('action', 'a'), actions: [{ type: 'addLogEntry', text: 'We met the engineer.' }], next: 'end' }, createNode('end', 'end')],
    }
    assert.deepEqual(texts(talk(createExplorationState(roomWithEngineer(), team()), definition)), ['We met the engineer.'])
  })

  it('the Deck 10 Brig junction logs the repair, the completed objective, then the way in it opens', () => {
    const map = parseMapFile(brigFile, 'Deck 10 Brig')
    const base = createExplorationState(map, team(), 3, { enemiesActive: false })
    const members = Object.fromEntries(Object.entries(base.party.members).map(([id, member]) => [id, { ...member, position: { x: 23, y: 21 } }]))
    let state = { ...base, party: { ...base.party, members }, scenario: { ...base.scenario, flags: { ...base.scenario.flags, faultDiagnosed: true, 'objective.restorePower': 'active' } } }
    for (let attempt = 0; attempt < 20 && !state.scenario.flags.stationPowerRestored; attempt += 1) {
      state = explorationReducer(state, { type: 'challenge', objectId: 'powerJunction01', actionId: 'replaceCoupling', performerId: 'beta' })
    }
    assert.deepEqual(texts(state).slice(-3), [
      "Following Lt. Okafor's diagnosis, we replaced the burnt-out EPS coupling. The section has power again.",
      'Objective complete: Restore power to the section.',
      'New objective: Get into the east section.',
    ])
  })
})

describe("the map's briefing and stardate", () => {
  it('are saved with the map, and left out when blank', () => {
    const map = { ...createBlankMap({ name: 'Briefed', width: 8, height: 8 }), briefing: '  First.\n\nSecond.  ', stardate: 4400.2 }
    const again = parseMapFile(JSON.parse(JSON.stringify(serializeMap(map))), 'Briefed')
    assert.equal(again.briefing, 'First.\n\nSecond.')
    assert.equal(again.stardate, 4400.2)
    const blank = serializeMap(createBlankMap({ name: 'Plain', width: 8, height: 8 }))
    assert.ok(!('briefing' in blank) && !('stardate' in blank))
  })

  it('the Deck 10 Brig has a briefing, and its objective is marked at the power junction', () => {
    const map = parseMapFile(brigFile, 'Deck 10 Brig')
    assert.match(map.briefing, /Okafor/)
    assert.equal(map.stardate, 4523.3)
    assert.deepEqual(objectivePosition(map, map.objectives[0]), { x: 23, y: 23 })
  })
})

describe("an objective's minimap position", () => {
  it('is saved as [x, y], left out when unset, and dropped when outside the map or cut off by a resize', () => {
    const map = createBlankMap({ name: 'Marked', width: 10, height: 10 })
    map.objectives = [
      { id: 'here', title: 'Here', description: '', position: { x: 7, y: 2 }, objectId: null, activeWhen: [], completeWhen: [] },
      { id: 'nowhere', title: 'Nowhere', description: '', position: null, objectId: null, activeWhen: [], completeWhen: [] },
    ]
    const file = serializeMap(map)
    assert.deepEqual(file.objectives[0].position, [7, 2])
    assert.ok(!('position' in file.objectives[1]))
    assert.deepEqual(parseMapFile(JSON.parse(JSON.stringify(file)), 'Marked').objectives, map.objectives)
    assert.equal(parseMapFile({ ...file, objectives: [{ id: 'far', position: [40, 40] }] }, 'Marked').objectives[0].position, null)
    assert.equal(resizeMap(map, 6, 10).objectives[0].position, null)
  })
})
