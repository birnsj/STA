// Board visibility for enemies the party cannot currently see (exploration/boardVisibility.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hideEnemyFromBoard } from '../src/exploration/boardVisibility.js'
import { KNOWLEDGE } from '../src/exploration/partyKnowledge.js'

const knowledge = (state) => ({ entities: { k1: { state, lastKnownPosition: { x: 1, y: 1 }, identified: true } } })

describe('hideEnemyFromBoard', () => {
  it('hides upright unseen enemies', () => {
    const unit = { id: 'k1', side: 'enemy', condition: { defeated: false } }
    assert.equal(hideEnemyFromBoard(knowledge(KNOWLEDGE.KNOWN), unit), true)
    assert.equal(hideEnemyFromBoard(knowledge(KNOWLEDGE.UNKNOWN), unit), true)
  })

  it('keeps defeated (stunned or dead) bodies on the board out of sight', () => {
    const unit = { id: 'k1', side: 'enemy', condition: { defeated: true, injuries: [{ type: 'stun' }] } }
    assert.equal(hideEnemyFromBoard(knowledge(KNOWLEDGE.KNOWN), unit), false)
    assert.equal(hideEnemyFromBoard(knowledge(KNOWLEDGE.UNKNOWN), unit), false)
  })

  it('keeps hazard-revealed enemies and never hides the party', () => {
    const enemy = { id: 'k1', side: 'enemy', condition: { defeated: false } }
    assert.equal(hideEnemyFromBoard(knowledge(KNOWLEDGE.KNOWN), enemy, { revealed: true }), false)
    assert.equal(hideEnemyFromBoard(knowledge(KNOWLEDGE.VISIBLE), enemy), false)
    assert.equal(hideEnemyFromBoard(knowledge(KNOWLEDGE.KNOWN), { id: 'p1', side: 'player', condition: {} }), false)
  })
})
