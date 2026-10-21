// Reusable conversations (conversation/conversationScope.js): {npc} and {group} flags, conditions on the talking NPC's own
// properties, and the outcomes that change that NPC (Intimidated, check Difficulty, standing down).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createNode } from '../src/conversation/conversationFormat.js'
import { availableOptions } from '../src/conversation/conversationRuntime.js'
import { checkScopedCondition, scopedFlag } from '../src/conversation/conversationScope.js'
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { checkDifficultyChange, checksSkipped } from '../src/exploration/partySocial.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const team = () => [makeCharacter({ id: 'alpha', name: 'Alpha' }), makeCharacter({ id: 'beta', name: 'Beta' })]

function room() {
  const map = createBlankMap({ name: 'Scope Test Room', width: 14, height: 10 })
  map.markers.playerStarts = [
    { x: 4, y: 4 },
    { x: 4, y: 5 },
  ]
  map.markers.enemySpawns = []
  const at = (id, x, extra) => ({ id, characterId: 'stationEngineer', name: null, position: { x, y: 4 }, facing: 180, disposition: 'wary', ...extra })
  map.npcs = [at('a', 5, { alertGroupId: 'g1' }), at('b', 6, { alertGroupId: 'g1' }), at('c', 7, {})]
  return map
}

// One reusable conversation: a choice whose option shows only for a calm NPC, and options that set per-NPC outcomes.
const definition = {
  id: 'scopeTest',
  name: 'Scope test',
  start: 'pick',
  nodes: [
    {
      ...createNode('choice', 'pick'),
      options: [
        { id: 'mark', text: 'Mark it', conditions: [], next: 'markIt' },
        { id: 'calmOnly', text: 'Calm only', conditions: [{ npc: 'disposition', op: 'notEquals', value: 'wary' }], next: 'end' },
        { id: 'unmarked', text: 'Not yet marked', conditions: [{ flag: '{npc}.marked', op: 'isFalse' }], next: 'end' },
        { id: 'intimidatedOnly', text: 'Intimidated only', conditions: [{ npc: 'intimidated', op: 'isTrue' }], next: 'end' },
      ],
    },
    {
      ...createNode('action', 'markIt'),
      actions: [
        { type: 'changeFlag', flag: '{npc}.marked', op: 'set', value: true },
        { type: 'changeFlag', flag: '{group}.seen', op: 'add', value: 1 },
        { type: 'setIntimidated', intimidated: true },
        { type: 'adjustCheckDifficulty', amount: 1 },
        { type: 'standDown', disposition: 'neutral', leaveGroup: false },
      ],
      next: 'end',
    },
    createNode('end', 'end'),
  ],
}

const begin = () => explorationReducer(createExplorationState(room(), team()), { type: 'talk', npcId: 'a', definition })
const talkTo = (state, npcId) => explorationReducer({ ...state, conversation: null }, { type: 'talk', npcId, definition })
const optionIds = (state) => availableOptions(state).map((option) => option.id)

describe('conversation scope', () => {
  it('resolves {npc} to the NPC and {group} to its alert group, else to the NPC itself', () => {
    const state = createExplorationState(room(), team())
    assert.equal(scopedFlag('{npc}.marked', 'a', state.world.npcs.a), 'a.marked')
    assert.equal(scopedFlag('{group}.seen', 'a', state.world.npcs.a), 'g1.seen')
    assert.equal(scopedFlag('{group}.seen', 'c', state.world.npcs.c), 'c.seen')
    assert.equal(scopedFlag('plain', 'a', state.world.npcs.a), 'plain')
  })

  it('keeps one NPC per flag and shares a group flag between its members', () => {
    let state = begin()
    state = explorationReducer(state, { type: 'conversationChoose', optionId: 'mark' })
    assert.equal(state.scenario.flags['a.marked'], true)
    assert.equal(state.scenario.flags['b.marked'], undefined)
    assert.equal(state.scenario.flags['g1.seen'], 1)
    // The second member of the group is a different NPC: its own marker is still clear, the group's is shared.
    state = talkTo(state, 'b')
    assert.ok(optionIds(state).includes('unmarked'))
    state = explorationReducer(state, { type: 'conversationChoose', optionId: 'mark' })
    assert.equal(state.scenario.flags['b.marked'], true)
    assert.equal(state.scenario.flags['g1.seen'], 2)
  })

  it('gates options on the talking NPC, not on every NPC', () => {
    let state = begin()
    assert.deepEqual(optionIds(state), ['mark', 'unmarked'])
    state = explorationReducer(state, { type: 'conversationChoose', optionId: 'mark' })
    // a is now Intimidated and neutral; b, talked to next, is still wary.
    state = talkTo(state, 'a')
    assert.deepEqual(optionIds(state), ['mark', 'calmOnly', 'intimidatedOnly'])
    state = talkTo(state, 'b')
    assert.deepEqual(optionIds(state), ['mark', 'unmarked'])
  })

  it('applies the outcomes to the talking NPC only', () => {
    let state = begin()
    state = explorationReducer(state, { type: 'conversationChoose', optionId: 'mark' })
    assert.equal(checksSkipped(state, 'a'), true)
    assert.equal(checksSkipped(state, 'b'), false)
    assert.equal(checkDifficultyChange(state, 'a'), 1)
    assert.equal(checkDifficultyChange(state, 'b'), 0)
    assert.equal(state.world.npcs.a.disposition, 'neutral')
    assert.equal(state.world.npcs.b.disposition, 'wary')
    assert.equal(state.world.npcs.a.alertGroupId, 'g1', 'leaveGroup was off')
  })

  it('reads NPC hostility as a number and leaves flag conditions unchanged', () => {
    const state = createExplorationState(room(), team())
    assert.equal(checkScopedCondition(state, 'a', { npc: 'hostility', op: 'equals', value: 2 }), true)
    assert.equal(checkScopedCondition(state, 'a', { npc: 'hostility', op: 'atLeast', value: 3 }), false)
    assert.equal(checkScopedCondition(state, 'a', { npc: 'nonsense', op: 'isTrue' }), false)
    assert.equal(checkScopedCondition(state, 'a', { flag: 'powerRestored', op: 'isFalse' }), true)
  })
})
