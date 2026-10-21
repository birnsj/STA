// The Klingon encounter (conversations/klingonEncounter.json): every Klingon talks with it by default (faction default,
// conversation/defaultConversations.js), and Persuade, Intimidate and Fight are options in it. The ring no longer has
// Persuade or Intimidate buttons.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import klingonFile from '../conversations/klingonEncounter.json'
import { parseConversation, serializeConversation, validateConversation } from '../src/conversation/conversationFormat.js'
import { availableOptions } from '../src/conversation/conversationRuntime.js'
import { conversationIdFor } from '../src/conversation/defaultConversations.js'
import { MODE } from '../src/exploration/combatLink.js'
import { createExplorationState, explorationReducer, npcsInTalkRange } from '../src/exploration/explorationState.js'
import { checkDifficultyChange, checksSkipped } from '../src/exploration/partySocial.js'
import { npcMenuButtons } from '../src/components/exploration/explorationRings.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const klingon = parseConversation(klingonFile, 'klingonEncounter')
const team = () => [makeCharacter({ id: 'alpha', name: 'Alpha' }), makeCharacter({ id: 'beta', name: 'Beta' })]

// A Klingon with no conversationId, and a Federation engineer with none either.
function room(disposition = 'wary') {
  const map = createBlankMap({ name: 'Klingon Test Room', width: 14, height: 10 })
  map.markers.playerStarts = [
    { x: 4, y: 4 },
    { x: 4, y: 5 },
  ]
  map.markers.enemySpawns = []
  map.npcs = [
    { id: 'k1', characterId: 'klingonWarrior1', name: null, position: { x: 5, y: 4 }, facing: 180, disposition },
    { id: 'eng', characterId: 'stationEngineer', name: null, position: { x: 5, y: 5 }, facing: 180, disposition: 'friendly' },
  ]
  return map
}

const start = (disposition, definition = klingon) =>
  explorationReducer(createExplorationState(room(disposition), team()), { type: 'talk', npcId: 'k1', definition })
const choose = (state, optionId) => explorationReducer(state, { type: 'conversationChoose', optionId })
const roll = (state) => explorationReducer(state, { type: 'conversationRoll', performerId: 'alpha' })
const optionIds = (state) => availableOptions(state).map((option) => option.id)
// The same conversation with every Task Check unopposed at Difficulty 0 (always a Success), to follow the Success branches
// without depending on dice; the opposed rolls themselves are tested below.
const easy = { ...klingon, nodes: klingon.nodes.map((node) => (node.type === 'check' ? { ...node, opposed: false, difficulty: 0 } : node)) }
// ...and at a Difficulty nobody can reach, to follow the Failure branches.
const impossible = { ...klingon, nodes: klingon.nodes.map((node) => (node.type === 'check' ? { ...node, opposed: false, difficulty: 5 } : node)) }

describe('the default conversation by faction', () => {
  it('has nothing wrong with it', () => {
    assert.deepEqual(validateConversation(klingon), [])
  })

  it('survives an edit, save and reload unchanged, NPC conditions and new actions included', () => {
    const reloaded = parseConversation(JSON.parse(JSON.stringify(serializeConversation(klingon))), 'klingonEncounter')
    assert.deepEqual(reloaded, klingon)
    const kinds = klingon.nodes.flatMap((node) => [...(node.actions ?? []), ...(node.options ?? []).flatMap((option) => option.conditions), ...(node.conditions ?? [])]).map((entry) => entry.type ?? (entry.npc ? 'npcCondition' : 'flagCondition'))
    for (const kind of ['influenceNearby', 'standDown', 'setIntimidated', 'adjustCheckDifficulty', 'npcCondition']) assert.ok(kinds.includes(kind), kind)
  })

  it('gives a Klingon a conversation without one being authored, and the engineer none', () => {
    const state = createExplorationState(room(), team())
    assert.equal(conversationIdFor(state.world.npcs.k1), 'klingonEncounter')
    assert.equal(conversationIdFor(state.world.npcs.eng), null)
    assert.equal(conversationIdFor({ conversationId: 'engineerSealedSection', faction: 'klingonEmpire' }), 'engineerSealedSection', 'an authored one wins')
    assert.deepEqual(npcsInTalkRange(state, state.party.memberIds).map((npc) => npc.id), ['k1'])
  })

  it('Talk is enabled for the Klingon, and the ring has no Persuade or Intimidate any more', () => {
    const state = createExplorationState(room(), team())
    const actions = { talk() {}, scan() {}, info() {}, attack() {}, goTo() {} }
    const buttons = npcMenuButtons(state, state.world.npcs.k1, true, false, actions)
    assert.equal(buttons.find((button) => button.id === 'talk').enabled, true)
    assert.deepEqual(buttons.filter((button) => ['persuade', 'intimidate'].includes(button.id)), [])
    const engineerButtons = npcMenuButtons(state, state.world.npcs.eng, true, false, actions)
    assert.equal(engineerButtons.find((button) => button.id === 'talk').enabled, false)
  })
})

describe('the Klingon encounter', () => {
  it('offers Persuade unless the Klingon is friendly, and always offers Intimidate, Fight and leaving', () => {
    assert.deepEqual(optionIds(start('wary')), ['persuade', 'intimidate', 'fight', 'leave'])
    assert.deepEqual(optionIds(start('friendly')), ['intimidate', 'fight', 'leave'])
  })

  it('a won Persuade stands the Klingon down and eases its checks; it can be tried once', () => {
    let state = roll(choose(start('hostile', easy), 'persuade'))
    assert.equal(state.world.npcs.k1.disposition, 'neutral')
    assert.equal(checkDifficultyChange(state, 'k1'), -1)
    state = explorationReducer(state, { type: 'conversationContinue' })
    assert.ok(!optionIds(state).includes('persuade'))
  })

  it('a lost Persuade changes nothing about the Klingon', () => {
    const state = roll(choose(start('wary', impossible), 'persuade'))
    assert.equal(state.world.npcs.k1.disposition, 'wary')
    assert.equal(checkDifficultyChange(state, 'k1'), 0)
  })

  it('a won Intimidate makes the Klingon back down and Intimidated, so its checks pass without a roll', () => {
    const state = roll(choose(start('hostile', easy), 'intimidate'))
    assert.equal(state.world.npcs.k1.disposition, 'neutral')
    assert.equal(checksSkipped(state, 'k1'), true)
  })

  it('a lost Intimidate angers a wary Klingon and makes its checks harder, but starts no fight', () => {
    const state = roll(choose(start('wary', impossible), 'intimidate'))
    assert.equal(state.world.npcs.k1.disposition, 'hostile', 'one step more hostile than wary')
    assert.equal(checkDifficultyChange(state, 'k1'), 1)
    assert.notEqual(state.mode, MODE.COMBAT)
  })

  it('a lost Intimidate on an aggressive Klingon starts the fight', () => {
    const state = explorationReducer(roll(choose(start('aggressive', impossible), 'intimidate')), { type: 'conversationContinue' })
    assert.equal(state.mode, MODE.COMBAT)
    assert.equal(state.conversation, null)
  })

  it('Persuade and Intimidate are opposed: the roll sets the Klingon\'s Difficulty and the check succeeds when it fails', () => {
    assert.deepEqual(klingon.nodes.filter((node) => node.type === 'check').map((node) => node.opposed), [true, true])
    const results = Array.from({ length: 40 }, (_, seed) => {
      const state = explorationReducer(createExplorationState(room('wary'), team(), seed), { type: 'talk', npcId: 'k1', definition: klingon })
      const rolled = roll(choose(state, 'persuade'))
      return { state, rolled, check: rolled.conversation.lastCheck }
    })
    for (const { check } of results) {
      const { result, opposed } = check
      assert.ok(opposed, 'the result carries the NPC side')
      assert.equal(result.difficulty, opposed.set, 'the Difficulty shown is the one the roll set')
      assert.equal(result.success, opposed.set > 0 && opposed.resistSuccesses < opposed.difficulty, 'won only when the Klingon fails its roll')
      assert.ok(opposed.difficulty >= opposed.set)
      if (opposed.set === 0) assert.equal(result.success, false, 'no successes set nothing to resist')
    }
    assert.ok(results.some(({ check }) => check.result.success) && results.some(({ check }) => !check.result.success), 'both outcomes occur across seeds')
    // The Klingon's own Momentum becomes Threat (plus any Threat the asker added to buy dice, none here).
    for (const { state, rolled, check } of results) assert.equal(rolled.resources.threat - state.resources.threat, check.opposed.threat + check.threatAddedForDice)
    // A won request saves its Momentum; a lost one saves none.
    for (const { state, rolled, check } of results) if (!check.result.success) assert.equal(rolled.resources.momentum, state.resources.momentum)
  })

  it('an Intimidated Klingon lets an opposed request through without a roll, and cannot be Intimidated again', () => {
    const intimidated = { ...start('hostile'), npcSocial: { k1: { intimidated: true } } }
    assert.equal(optionIds(intimidated).includes('intimidate'), false)
    const state = choose(intimidated, 'persuade')
    assert.equal(state.conversation.lastCheck, null, 'nothing was rolled')
    assert.equal(state.world.npcs.k1.disposition, 'neutral', 'the Success branch ran')
  })

  it('Fight starts combat', () => {
    const state = choose(start('wary'), 'fight')
    assert.equal(state.mode, MODE.COMBAT)
  })
})
