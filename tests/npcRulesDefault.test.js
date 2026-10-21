// A placed NPC with no npcRules plays as its stat block's book category (designer decision 2026-10-20); the away team
// never does, and 'main' chooses the full character rules on purpose.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getAuthoredCharacter, getPlaytestParty, npcRulesFor } from '../src/character/authoredCharacters.js'
import { createExplorationState } from '../src/exploration/explorationState.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { npcCategoryOf } from '../src/rules/personalCondition.js'
import { makeCharacter } from './support/characters.js'

function room(npcRules) {
  const map = createBlankMap({ name: 'Rules Test Room', width: 10, height: 8 })
  map.markers.playerStarts = [{ x: 2, y: 2 }]
  map.markers.enemySpawns = []
  map.npcs = [{ id: 'k', characterId: 'klingonWarrior1', name: null, position: { x: 5, y: 4 }, facing: 180, disposition: 'wary', ...(npcRules === undefined ? {} : { npcRules }) }]
  return map
}
const categoryOnMap = (npcRules) => npcCategoryOf(createExplorationState(room(npcRules), [makeCharacter({ id: 'alpha' })]).world.npcs.k.character)

describe('the default NPC rules of a placed NPC', () => {
  it('is the stat block category when the placement sets none', () => {
    assert.equal(npcRulesFor('klingonWarrior1'), 'minor')
    assert.equal(categoryOnMap(undefined), 'minor')
  })

  it('is whatever the placement authors, including the full character rules', () => {
    assert.equal(categoryOnMap('supporting'), 'supporting')
    assert.equal(categoryOnMap('notable'), 'notable')
    assert.equal(categoryOnMap('main'), 'main')
  })

  it('is nothing for a character with no stat block, and is never applied to an away-team character', () => {
    assert.equal(npcRulesFor('no-such-character'), null)
    assert.equal(npcCategoryOf(getAuthoredCharacter('klingonWarrior1')), 'main', 'asking for the character itself does not apply it')
    for (const member of getPlaytestParty()) assert.equal(npcCategoryOf(member), 'main', member.name)
  })
})
