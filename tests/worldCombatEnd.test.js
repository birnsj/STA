// Designer decision (Oct 2026): a fight started in the world ends only when every enemy in it is down or surrendered (or
// the party is); an enemy still up out of sight (an alert-group member waiting in another room) keeps it going.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { addCombatant } from '../src/combat/combatState.js'
import { combatAction, endCombat, MODE, startCombat } from '../src/exploration/combatLink.js'
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

// The party and Guard A in the west room; Guard B in the east room, behind a solid wall (or not, for the control).
function testMap(wall) {
  const map = createBlankMap({ name: 'Two Rooms', width: 18, height: 12 })
  if (wall) for (let y = 1; y < 11; y++) map.tiles[y][10] = map.tiles[0][0]
  map.markers.playerStarts = [
    { x: 4, y: 5 },
    { x: 4, y: 7 },
  ]
  map.markers.enemySpawns = [
    { x: 7, y: 6 },
    { x: 12, y: 6 },
  ]
  return map
}

// Guard A has just gone down; Guard B is in the fight and still up.
function guardADown(wall) {
  const state = createExplorationState(testMap(wall), [makeCharacter({ id: 'alpha', name: 'Alpha' }), makeCharacter({ id: 'beta', name: 'Beta' })])
  const fighting = startCombat(state, { triggerNpcId: 'guardA', triggerTargetId: 'alpha' })
  assert.equal(fighting.mode, MODE.COMBAT)
  const guardB = fighting.world.npcs.guardB
  let combat = fighting.combat.combatants.guardB ? fighting.combat : addCombatant(fighting.combat, { id: 'guardB', character: guardB.character, position: { x: 12, y: 6 } })
  const guardA = combat.combatants.guardA
  combat = { ...combat, combatants: { ...combat.combatants, guardA: { ...guardA, condition: { ...guardA.condition, defeated: true } } } }
  return { ...fighting, combat, link: { ...fighting.link, npcIds: [...new Set([...fighting.link.npcIds, 'guardB'])] } }
}

const withGuardB = (state, changes) => ({ ...state, combat: { ...state.combat, combatants: { ...state.combat.combatants, guardB: { ...state.combat.combatants.guardB, ...changes } } } })

describe('a world fight ends only when every enemy in it is down or surrendered', () => {
  it('goes on while the last enemy up is out of sight', () => {
    const next = combatAction(guardADown(true), { type: 'endTurn' })
    assert.equal(next.mode, MODE.COMBAT)
    assert.equal(next.combat.outcome, null)
  })

  it('the AI-played party goes looking for an enemy it can\'t see instead of waiting', () => {
    let state = guardADown(true)
    const moves = []
    for (let i = 0; i < 40 && !moves.length && !state.combat.outcome; i++) {
      state = combatAction(state, { type: 'aiStep', partyAI: 'classic', enemyAI: 'classic', partyAuto: true })
      const latest = state.combat.log.at(-1).lines[0] ?? ''
      if (/AI Decision: (Search|Track)/.test(latest)) moves.push(latest)
    }
    assert.ok(moves.length, 'a party member searched or tracked')
  })

  it('goes on while that enemy is in sight', () => {
    const next = combatAction(guardADown(false), { type: 'endTurn' })
    assert.equal(next.combat.outcome, null)
  })

  it('an enemy still up when a fight ends attacks on sight afterwards, whatever its disposition', () => {
    const ended = endCombat(guardADown(true))
    assert.equal(ended.mode, MODE.EXPLORATION)
    assert.equal(ended.world.npcs.guardB.responseType, 'combat')
    assert.equal(ended.world.npcs.guardA.responseType, null)

    // Guard B walks into the party's room facing them. Made Neutral (which only observes), it attacks only with the
    // after-the-fight override; Wary (which confronts) attacks on sight anyway (designer decision, Oct 2026).
    const seeParty = (disposition, responseType) => {
      const guardB = { ...ended.world.npcs.guardB, disposition, responseType, position: { x: 7.5, y: 6.5 }, heading: Math.PI, patrol: null }
      let state = { ...ended, world: { ...ended.world, npcs: { ...ended.world.npcs, guardB } } }
      for (let i = 0; i < 100 && state.mode !== MODE.COMBAT; i++) state = explorationReducer(state, { type: 'tick', seconds: 0.1 })
      return state
    }
    const attacked = seeParty('neutral', 'combat')
    assert.equal(attacked.mode, MODE.COMBAT)
    assert.equal(attacked.link.trigger.npcId, 'guardB')
    assert.equal(seeParty('neutral', null).mode, MODE.EXPLORATION)
    assert.equal(seeParty('wary', null).mode, MODE.COMBAT)
  })
})

// Designer decision (Oct 2026): a surrendered enemy stands down.
describe('surrendered enemies after a world fight', () => {
  it('a surrendered enemy is neutral, stays put and never joins a fight', () => {
    const ended = endCombat(withGuardB(guardADown(false), { surrendered: true }))
    const guardB = ended.world.npcs.guardB
    assert.equal(guardB.disposition, 'neutral')
    assert.equal(guardB.patrol, null)
    assert.equal(guardB.surrendered, true)
    assert.deepEqual(ended.lastCombat.surrendered, ['guardB'])
  })
})
