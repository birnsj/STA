// NPC conversations (conversation/*) and the shared mission flags (exploration/missionFlags.js): the file format and its
// validation, branching on flags, actions, Task Checks through the shared STA task, and the Deck 10 Brig encounter
// (Lt. Okafor, the power junction and the sealed bulkheads).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import engineerFile from '../conversations/engineerSealedSection.json'
import brigFile from '../maps/Deck 10 Brig.json'
import { checkAhead, createConversation, createNode, getNode, parseConversation, removeNode, serializeConversation, validateConversation, withLink } from '../src/conversation/conversationFormat.js'
import { availableOptions, currentCheck, recommendCheck } from '../src/conversation/conversationRuntime.js'
import { getNpcs } from '../src/exploration/awareness.js'
import { getAvailableActions } from '../src/exploration/challengeObjects.js'
import { MODE } from '../src/exploration/combatLink.js'
import { createExplorationState, explorationReducer, npcConfigsFor, npcsInTalkRange } from '../src/exploration/explorationState.js'
import { applyFlagChange, checkCondition, checkConditions, objectiveStatus, parseFlagValue } from '../src/exploration/missionFlags.js'
import { createBlankMap, parseMapFile, serializeMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const engineerTalk = parseConversation(engineerFile, 'engineerSealedSection')
const team = () => [makeCharacter({ id: 'alpha', name: 'Alpha' }), makeCharacter({ id: 'beta', name: 'Beta', attributes: { reason: 12 }, disciplines: { engineering: 4 } })]

// A plain room with one placed NPC (the authored engineer) who has a conversation, and no enemies.
function roomWithEngineer() {
  const map = createBlankMap({ name: 'Conversation Test Room', width: 14, height: 10 })
  map.markers.playerStarts = [
    { x: 4, y: 4 },
    { x: 4, y: 5 },
  ]
  map.markers.enemySpawns = []
  map.npcs = [{ id: 'eng', characterId: 'stationEngineer', name: null, position: { x: 5, y: 4 }, facing: 180, disposition: 'friendly', conversationId: 'engineerSealedSection' }]
  map.objectives = [{ id: 'restorePower', title: 'Restore power', description: '', position: null }]
  return map
}

const talk = (state, definition = engineerTalk, npcId = 'eng') => explorationReducer(state, { type: 'talk', npcId, definition })
const choose = (state, optionId) => explorationReducer(state, { type: 'conversationChoose', optionId })
const leave = (state) => explorationReducer(state, { type: 'conversationLeave' })
const withFlags = (state, flags) => ({ ...state, scenario: { ...state.scenario, flags: { ...state.scenario.flags, ...flags } } })
const optionIds = (state) => availableOptions(state).map((option) => option.id)

// A one-check conversation: the check's Success and Failure each set a flag and end.
function checkTalk(difficulty, extra = {}) {
  return {
    id: 'checkTest',
    name: 'Check test',
    start: 'c',
    nodes: [
      { ...createNode('check', 'c'), label: 'Test', attribute: 'reason', department: 'engineering', difficulty, ...extra, success: 'win', failure: 'lose' },
      { ...createNode('action', 'win'), actions: [{ type: 'changeFlag', flag: 'checkResult', op: 'set', value: 'success' }], next: 'end' },
      { ...createNode('action', 'lose'), actions: [{ type: 'changeFlag', flag: 'checkResult', op: 'set', value: 'failure' }], next: 'end' },
      createNode('end', 'end'),
    ],
  }
}

describe('mission flags', () => {
  it('read an unset flag as false, 0 or empty text, whichever it is compared with', () => {
    assert.equal(checkCondition({}, { flag: 'powerRestored', op: 'equals', value: false }), true)
    assert.equal(checkCondition({}, { flag: 'trust', op: 'equals', value: 0 }), true)
    assert.equal(checkCondition({}, { flag: 'name', op: 'equals', value: '' }), true)
    assert.equal(checkCondition({}, { flag: 'powerRestored', op: 'isFalse' }), true)
    assert.equal(checkCondition({ status: 'active' }, { flag: 'status', op: 'isFalse' }), false)
  })

  it('compare numbers and text, and require every condition in a list', () => {
    const flags = { trust: 2, mood: 'calm' }
    assert.equal(checkCondition(flags, { flag: 'trust', op: 'atLeast', value: 2 }), true)
    assert.equal(checkCondition(flags, { flag: 'trust', op: 'above', value: 2 }), false)
    assert.equal(checkCondition(flags, { flag: 'trust', op: 'below', value: 3 }), true)
    assert.equal(checkCondition(flags, { flag: 'mood', op: 'notEquals', value: 'angry' }), true)
    assert.equal(checkConditions(flags, [{ flag: 'trust', op: 'atMost', value: 2 }, { flag: 'mood', op: 'equals', value: 'angry' }]), false)
    assert.equal(checkConditions(flags, []), true)
  })

  it('set, clear and add (an unset number counts as 0); an unchanged flag keeps the same object', () => {
    const set = applyFlagChange({}, { flag: 'door', op: 'set', value: 'open' })
    assert.deepEqual(set, { door: 'open' })
    assert.equal(applyFlagChange(set, { flag: 'door', op: 'set', value: 'open' }), set)
    assert.deepEqual(applyFlagChange(set, { flag: 'door', op: 'clear' }), {})
    assert.deepEqual(applyFlagChange({}, { flag: 'trust', op: 'add', value: -1 }), { trust: -1 })
    assert.deepEqual(applyFlagChange({ trust: 2 }, { flag: 'trust', op: 'add', value: 1 }), { trust: 3 })
  })

  it('turn typed text into the value it means', () => {
    assert.equal(parseFlagValue('true'), true)
    assert.equal(parseFlagValue('false'), false)
    assert.equal(parseFlagValue('3'), 3)
    assert.equal(parseFlagValue(' open '), 'open')
  })
})

describe('the conversation file format', () => {
  it('round-trips the engineer conversation and finds nothing wrong with it', () => {
    const again = parseConversation(JSON.parse(JSON.stringify(serializeConversation(engineerTalk))), engineerTalk.id)
    assert.deepEqual(again, engineerTalk)
    assert.deepEqual(validateConversation(engineerTalk), [])
  })

  it('warns about missing links, unreachable nodes and incomplete nodes', () => {
    const base = createConversation({ id: 'broken' })
    const broken = { ...base, nodes: [{ ...base.nodes[0], next: 'gone' }, createNode('choice', 'n2')] }
    const warnings = validateConversation(broken)
    assert.ok(warnings.some((text) => text.includes('missing node')))
    assert.ok(warnings.some((text) => text.includes('n2 can never be reached')))
    assert.ok(warnings.some((text) => text.includes('no text')))
    assert.ok(warnings.some((text) => text.includes('no options')))
  })

  it('removing a node clears every link to it', () => {
    const base = createConversation({ id: 'links' })
    const linked = { ...base, nodes: [withLink(base.nodes[0], 'next', 'n2'), createNode('end', 'n2')] }
    const removed = removeNode(linked, 'n2')
    assert.equal(getNode(removed, 'n1').next, null)
    assert.equal(removed.nodes.length, 1)
  })

  it('an option shows the check it leads to through Action nodes', () => {
    const option = getNode(engineerTalk, 'mainChoice').options.find((entry) => entry.id === 'requestAccess')
    assert.equal(checkAhead(engineerTalk, option.next)?.id, 'commandCheck')
    assert.equal(checkAhead(engineerTalk, 'activateObjective'), null)
  })
})

describe('NPCs placed on a map', () => {
  it('are saved with the map and replace the test NPCs', () => {
    const map = roomWithEngineer()
    const again = parseMapFile(JSON.parse(JSON.stringify(serializeMap(map))), map.id)
    assert.deepEqual(again.npcs[0], { ...map.npcs[0], faction: null, npcRules: null, alertGroupId: null, alertMethod: null, responseType: null })
    assert.deepEqual(again.objectives, map.objectives.map((objective) => ({ ...objective, objectId: null, activeWhen: [], completeWhen: [] })))
    assert.deepEqual(npcConfigsFor(again).map((config) => config.id), ['eng'])
    const [npc] = getNpcs(createExplorationState(again, team()).world)
    assert.equal(npc.name, 'Lt. Mara Okafor')
    assert.equal(npc.conversationId, 'engineerSealedSection')
    assert.equal(npc.faction, 'federation')
  })

  it('can be talked to only from close by', () => {
    const state = createExplorationState(roomWithEngineer(), team())
    assert.deepEqual(npcsInTalkRange(state, state.party.memberIds).map((npc) => npc.id), ['eng'])
    const far = { ...state, party: { ...state.party, members: Object.fromEntries(Object.entries(state.party.members).map(([id, member]) => [id, { ...member, position: { x: 12, y: 8 } }])) } }
    assert.deepEqual(npcsInTalkRange(far, far.party.memberIds), [])
  })
})

describe('a conversation in exploration', () => {
  it('opens on the first line, records the meeting and offers the choices whose conditions hold', () => {
    const state = talk(createExplorationState(roomWithEngineer(), team()))
    assert.equal(state.conversation.nodeId, 'intro')
    assert.equal(state.conversation.line.speaker, 'Lt. Mara Okafor')
    assert.equal(state.scenario.flags.engineerMet, true)
    assert.deepEqual(optionIds(state), ['requestAccess', 'investigate', 'offerHelp', 'leave'])
  })

  it('an option sets the objective active, then is no longer offered; returning gives a different line', () => {
    let state = choose(talk(createExplorationState(roomWithEngineer(), team())), 'offerHelp')
    assert.equal(objectiveStatus(state.scenario.flags, 'restorePower'), 'active')
    assert.equal(state.conversation.nodeId, 'offerHelpLine')
    assert.ok(!optionIds(state).includes('offerHelp'))
    state = talk(leave(state))
    assert.equal(state.conversation.nodeId, 'returnLine')
  })

  it('branches on the power flag: restored power grants access once, then the short line', () => {
    let state = talk(withFlags(createExplorationState(roomWithEngineer(), team()), { stationPowerRestored: true }))
    assert.equal(state.conversation.nodeId, 'poweredThanks')
    assert.equal(state.scenario.flags.sectionAccessGranted, true)
    assert.equal(state.scenario.flags.engineerTrust, 1)
    state = explorationReducer(state, { type: 'conversationContinue' })
    assert.equal(state.conversation, null)
    state = talk(state)
    assert.equal(state.conversation.nodeId, 'alreadyCleared')
    assert.equal(state.scenario.flags.engineerTrust, 1)
  })

  it('an option leading to a check waits for the party to choose who answers, and recommends the best', () => {
    const state = choose(talk(createExplorationState(roomWithEngineer(), team())), 'investigate')
    assert.equal(currentCheck(state)?.id, 'engineeringCheck')
    assert.equal(state.scenario.flags.faultInvestigated, true)
    assert.deepEqual(recommendCheck(state, currentCheck(state)).bestIds, ['beta'])
  })

  it('rolls a check with the shared task (seeded), pays bonus dice and follows Success or Failure', () => {
    const start = choose(talk(createExplorationState(roomWithEngineer(), team(), 7)), 'investigate')
    const rolled = explorationReducer(start, { type: 'conversationRoll', performerId: 'beta', purchase: { bonusDice: 1, momentum: 0 } })
    const check = rolled.conversation.lastCheck
    assert.equal(check.performerId, 'beta')
    assert.equal(check.result.dice.length, 3)
    assert.equal(check.threatAddedForDice, 1)
    assert.equal(rolled.scenario.taskCount, start.scenario.taskCount + 1)
    assert.equal(rolled.resources.momentum, start.resources.momentum + check.momentumSaved)
    assert.equal(rolled.conversation.nodeId, check.result.success ? 'faultFoundLine' : 'faultMissedLine')
    assert.equal(Boolean(rolled.scenario.flags.faultDiagnosed), check.result.success)
    assert.deepEqual(explorationReducer(start, { type: 'conversationRoll', performerId: 'beta', purchase: { bonusDice: 1, momentum: 0 } }).conversation.lastCheck.result, check.result)
  })

  it('Difficulty 0 always succeeds; a check that ends the conversation keeps the panel on its result', () => {
    const state = createExplorationState(roomWithEngineer(), team())
    const passed = explorationReducer(talk(state, checkTalk(0)), { type: 'conversationRoll', performerId: 'alpha' })
    assert.equal(passed.scenario.flags.checkResult, 'success')
    assert.equal(passed.conversation.ended, true)
    assert.equal(leave(passed).conversation, null)
  })

  it('applies complication consequences only when a complication remains', () => {
    const talkWithConsequence = checkTalk(0, { complicationRange: 5, onComplication: [{ type: 'addThreat', amount: 2 }] })
    const outcomes = Array.from({ length: 40 }, (_, seed) => {
      const state = talk(createExplorationState(roomWithEngineer(), team(), seed), talkWithConsequence)
      const rolled = explorationReducer(state, { type: 'conversationRoll', performerId: 'alpha' })
      return { complications: rolled.conversation.lastCheck.result.complications, threatAdded: rolled.resources.threat - state.resources.threat }
    })
    assert.ok(outcomes.some((outcome) => outcome.complications > 0) && outcomes.some((outcome) => outcome.complications === 0))
    outcomes.forEach((outcome) => assert.equal(outcome.threatAdded, outcome.complications > 0 ? 2 : 0))
  })

  it('actions change disposition and start a fight that ends the conversation', () => {
    const hostile = {
      id: 'fight',
      name: 'Fight',
      start: 'a',
      nodes: [
        { ...createNode('action', 'a'), actions: [{ type: 'setDisposition', disposition: 'hostile' }, { type: 'startCombat' }], next: 'end' },
        createNode('end', 'end'),
      ],
    }
    const state = talk(createExplorationState(roomWithEngineer(), team()), hostile)
    assert.equal(state.conversation, null)
    assert.equal(state.world.npcs.eng.disposition, 'hostile')
    assert.equal(state.mode, MODE.COMBAT)
  })

  it('is not started in combat or for an NPC who is down', () => {
    const state = createExplorationState(roomWithEngineer(), team())
    const down = { ...state, world: { ...state.world, npcs: { eng: { ...state.world.npcs.eng, condition: { stress: 0, injuries: [], defeated: true } } } } }
    assert.equal(talk(down).conversation, null)
  })
})

describe('the Deck 10 Brig encounter', () => {
  const brig = () => {
    const map = parseMapFile(brigFile, 'Deck 10 Brig')
    const state = createExplorationState(map, team(), 3, { enemiesActive: false })
    // Within reach of Lt. Okafor (21, 21), the junction (23, 23) and the south bulkhead (24, 20).
    const near = { x: 23, y: 21 }
    const members = Object.fromEntries(Object.entries(state.party.members).map(([id, member]) => [id, { ...member, position: near }]))
    return { ...state, party: { ...state.party, members } }
  }

  it('places Lt. Okafor and the guards from the map file, with the east bulkheads sealed', () => {
    const state = brig()
    assert.deepEqual(getNpcs(state.world).map((npc) => npc.id), ['engineer', 'guardA', 'guardB', 'guardC'])
    assert.equal(state.party.map.tiles[20][24], 'hatchWall')
    assert.equal(state.party.map.tiles[21][24], 'hatchWall')
    assert.deepEqual(getAvailableActions(state, 'eastBulkheadSouth'), [])
    const okafor = state.world.npcs.engineer.position
    const members = Object.fromEntries(Object.entries(state.party.members).map(([id, member]) => [id, { ...member, position: { x: okafor.x + 1, y: okafor.y } }]))
    const beside = { ...state, party: { ...state.party, members } }
    assert.deepEqual(npcsInTalkRange(beside, beside.party.memberIds).map((npc) => npc.id), ['engineer'])
  })

  it('a diagnosis makes the junction easier; restoring power opens the bulkhead for a cleared party', () => {
    let state = withFlags(brig(), { faultDiagnosed: true, sectionAccessGranted: true })
    assert.deepEqual(getAvailableActions(state, 'powerJunction01').map((entry) => entry.action.id), ['replaceCoupling'])
    for (let attempt = 0; attempt < 20 && !state.scenario.flags.stationPowerRestored; attempt += 1) {
      state = explorationReducer(state, { type: 'challenge', objectId: 'powerJunction01', actionId: 'replaceCoupling', performerId: 'beta' })
    }
    assert.equal(state.scenario.flags.stationPowerRestored, true)
    assert.equal(objectiveStatus(state.scenario.flags, 'restorePower'), 'complete')
    assert.deepEqual(getAvailableActions(state, 'eastBulkheadSouth').map((entry) => entry.action.id), ['openDoor'])
    state = explorationReducer(state, { type: 'challenge', objectId: 'eastBulkheadSouth', actionId: 'openDoor', performerId: 'beta' })
    assert.equal(state.party.map.tiles[20][24], 'doorway')
    assert.equal(state.party.map.tiles[21][24], 'doorway')
  })

  it('without clearance a powered bulkhead needs its lockout overridden', () => {
    const state = withFlags(brig(), { stationPowerRestored: true })
    assert.deepEqual(getAvailableActions(state, 'eastBulkheadSouth').map((entry) => entry.action.id), ['overrideLock'])
  })
})
