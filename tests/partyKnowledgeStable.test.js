// Idle perception must reuse party-knowledge entries so exploration ticks can skip React commits.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { createPartyKnowledge, getEntityKnowledge, KNOWLEDGE, updatePartyKnowledge } from '../src/exploration/partyKnowledge.js'

describe('party knowledge structural sharing', () => {
  it('reuses the knowledge object while a visible NPC stays put with the same observers', () => {
    const map = createBlankMap({ name: 'Stable', width: 12, height: 12 })
    const observers = [{ id: 'alpha', position: { x: 2, y: 2 } }]
    const entities = [{ id: 'guard', position: { x: 4, y: 2 }, hostile: false }]
    const first = updatePartyKnowledge(createPartyKnowledge(), map, observers, entities, 1)
    assert.equal(getEntityKnowledge(first, 'guard').state, KNOWLEDGE.VISIBLE)
    const second = updatePartyKnowledge(first, map, observers, entities, 2)
    assert.equal(second, first)
    assert.equal(getEntityKnowledge(second, 'guard').lastSeenTime, 1)
  })

  it('stamps lastSeenTime when visibility is lost', () => {
    const map = createBlankMap({ name: 'Stable', width: 80, height: 80 })
    const near = [{ id: 'alpha', position: { x: 2, y: 2 } }]
    // baseVisionRange is 40 tiles — stand well outside it.
    const far = [{ id: 'alpha', position: { x: 70, y: 70 } }]
    const entities = [{ id: 'guard', position: { x: 4, y: 2 }, hostile: false }]
    const visible = updatePartyKnowledge(createPartyKnowledge(), map, near, entities, 1)
    const known = updatePartyKnowledge(visible, map, far, entities, 5)
    assert.notEqual(known, visible)
    assert.equal(getEntityKnowledge(known, 'guard').state, KNOWLEDGE.KNOWN)
    assert.equal(getEntityKnowledge(known, 'guard').lastSeenTime, 5)
  })
})
