import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  conversationFitsDialogueTier,
  dialogueMismatchWarning,
  dialogueTierOf,
  dialogueTierWarnings,
  requiredDialogueTier,
} from '../src/conversation/dialogueTier.js'

const pos = { x: 0, y: 0 }
const oneLine = {
  id: 'hello',
  name: 'Hello',
  start: 'n1',
  nodes: [
    { id: 'n1', type: 'npc', position: pos, speaker: '', text: 'Move along.', next: 'end' },
    { id: 'end', type: 'end', position: pos },
  ],
}

const branched = {
  id: 'branch',
  name: 'Branch',
  start: 'n1',
  nodes: [
    { id: 'n1', type: 'npc', position: pos, speaker: '', text: 'What do you want?', next: 'c1' },
    {
      id: 'c1',
      type: 'choice',
      position: pos,
      options: [
        { id: 'o1', text: 'Nothing.', conditions: [], next: 'end' },
        { id: 'o2', text: 'Directions.', conditions: [], next: 'end' },
      ],
    },
    { id: 'end', type: 'end', position: pos },
  ],
}

const full = {
  id: 'full',
  name: 'Full',
  start: 'n1',
  nodes: [
    { id: 'n1', type: 'npc', position: pos, speaker: '', text: 'Convince me.', next: 'check' },
    {
      id: 'check',
      type: 'check',
      position: pos,
      label: 'Persuade',
      attribute: 'presence',
      department: 'command',
      difficulty: 1,
      focuses: [],
      complicationRange: 1,
      onComplication: [],
      opposed: false,
      success: 'end',
      failure: 'end',
    },
    { id: 'end', type: 'end', position: pos },
  ],
}

describe('dialogueTierOf', () => {
  it('maps NPC rules to dialogue depth', () => {
    assert.equal(dialogueTierOf('minor'), 'minor')
    assert.equal(dialogueTierOf('notable'), 'notable')
    assert.equal(dialogueTierOf('supporting'), 'notable')
    assert.equal(dialogueTierOf('major'), 'major')
    assert.equal(dialogueTierOf('main'), 'major')
    assert.equal(dialogueTierOf(null), 'major')
  })
})

describe('requiredDialogueTier', () => {
  it('classifies one-line, branched and full graphs', () => {
    assert.equal(requiredDialogueTier(oneLine), 'minor')
    assert.equal(requiredDialogueTier(branched), 'notable')
    assert.equal(requiredDialogueTier(full), 'major')
  })

  it('treats multiple NPC lines as Notable', () => {
    const twoLines = {
      ...oneLine,
      nodes: [
        { id: 'n1', type: 'npc', position: pos, speaker: '', text: 'First.', next: 'n2' },
        { id: 'n2', type: 'npc', position: pos, speaker: '', text: 'Second.', next: 'end' },
        { id: 'end', type: 'end', position: pos },
      ],
    }
    assert.equal(requiredDialogueTier(twoLines), 'notable')
  })
})

describe('conversationFitsDialogueTier', () => {
  it('enforces soft tier limits', () => {
    assert.equal(conversationFitsDialogueTier(oneLine, 'minor'), true)
    assert.equal(conversationFitsDialogueTier(branched, 'minor'), false)
    assert.equal(conversationFitsDialogueTier(branched, 'notable'), true)
    assert.equal(conversationFitsDialogueTier(full, 'notable'), false)
    assert.equal(conversationFitsDialogueTier(full, 'major'), true)
  })
})

describe('soft warnings', () => {
  it('reports dialogue depth in the Conversation Editor', () => {
    assert.match(dialogueTierWarnings(oneLine)[0], /Minor/)
    assert.match(dialogueTierWarnings(branched)[0], /Notable/)
    assert.match(dialogueTierWarnings(full)[0], /Major/)
  })

  it('reports a mismatch for an NPC whose rules are too shallow', () => {
    assert.equal(dialogueMismatchWarning(oneLine, 'minor'), null)
    assert.match(dialogueMismatchWarning(full, 'minor', { conversationId: 'full' }), /Major/)
    assert.match(dialogueMismatchWarning(full, 'minor', { conversationId: 'full' }), /Minor/)
    assert.equal(dialogueMismatchWarning(branched, 'supporting'), null)
  })
})
