// Designer decision (2026-10-09): a fight started in the world ends in victory once every enemy the away team can see is
// dead or stunned; an enemy still up out of sight (an alert-group member waiting in another room) doesn't hold it open.
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

describe('a world fight ends when every enemy in sight is down', () => {
  it('ends in victory while the last enemy up is out of sight', () => {
    const next = combatAction(guardADown(true), { type: 'endTurn' })
    assert.equal(next.combat.outcome, 'victory')
    assert.ok(next.combat.log.at(-1).lines.some((line) => /out of sight leaves the fight/.test(line)))
  })

  it('goes on while that enemy is in sight', () => {
    const next = combatAction(guardADown(false), { type: 'endTurn' })
    assert.equal(next.combat.outcome, null)
  })

  it('the enemy that left still up attacks on sight afterwards, whatever its disposition', () => {
    const ended = endCombat(combatAction(guardADown(true), { type: 'endTurn' }))
    assert.equal(ended.mode, MODE.EXPLORATION)
    assert.equal(ended.world.npcs.guardB.responseType, 'combat')
    assert.equal(ended.world.npcs.guardA.responseType, null)

    // Guard B, made Wary (which only confronts), walks into the party's room facing them. Control: without the
    // after-the-fight override it never attacks.
    const seeParty = (responseType) => {
      const guardB = { ...ended.world.npcs.guardB, disposition: 'wary', responseType, position: { x: 7.5, y: 6.5 }, heading: Math.PI, patrol: null }
      let state = { ...ended, world: { ...ended.world, npcs: { ...ended.world.npcs, guardB } } }
      for (let i = 0; i < 100 && state.mode !== MODE.COMBAT; i++) state = explorationReducer(state, { type: 'tick', seconds: 0.1 })
      return state
    }
    const attacked = seeParty('combat')
    assert.equal(attacked.mode, MODE.COMBAT)
    assert.equal(attacked.link.trigger.npcId, 'guardB')
    assert.equal(seeParty(null).mode, MODE.EXPLORATION)
  })
})

// Designer decisions (Oct 2026): a surrendered enemy stands down; one that retreated out of the fight regroups (a breather,
// Book Core p.278) and attacks on sight once regroupSeconds have passed.
describe('surrendered and retreated enemies after a world fight', () => {
  const withGuardB = (state, changes) => ({ ...state, combat: { ...state.combat, combatants: { ...state.combat.combatants, guardB: { ...state.combat.combatants.guardB, ...changes } } } })

  it('a surrendered enemy is neutral, stays put and never joins a fight', () => {
    const ended = endCombat(withGuardB(guardADown(false), { surrendered: true }))
    const guardB = ended.world.npcs.guardB
    assert.equal(guardB.disposition, 'neutral')
    assert.equal(guardB.patrol, null)
    assert.equal(guardB.surrendered, true)
    assert.deepEqual(ended.lastCombat.surrendered, ['guardB'])
  })

  it('a retreated enemy recovers 4 Stress and waits out its regroup before attacking on sight', () => {
    const fighting = guardADown(false)
    const guardB = fighting.combat.combatants.guardB
    const character = { ...guardB.character, npcRules: 'main' }
    const ended = endCombat(withGuardB(fighting, { left: true, character, condition: { ...guardB.condition, stress: 6 } }))
    const npc = ended.world.npcs.guardB
    assert.equal(npc.condition.stress, 2)
    assert.equal(npc.responseType, 'combat')
    assert.ok(npc.regroupUntil > ended.world.time)
    assert.deepEqual(ended.lastCombat.retreated, ['guardB'])

    const seeParty = (regroupUntil) => {
      const placed = { ...npc, regroupUntil, position: { x: 7.5, y: 6.5 }, heading: Math.PI, patrol: null }
      let state = { ...ended, world: { ...ended.world, npcs: { ...ended.world.npcs, guardB: placed } } }
      for (let i = 0; i < 50 && state.mode !== MODE.COMBAT; i++) state = explorationReducer(state, { type: 'tick', seconds: 0.1 })
      return state
    }
    assert.equal(seeParty(ended.world.time + 1000).mode, MODE.EXPLORATION)
    assert.equal(seeParty(ended.world.time).mode, MODE.COMBAT)
  })
})
