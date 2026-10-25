import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aiUnarmedVariant, bestShot, nextAIStep } from '../src/combat/combatAI.js'
import { createCombat } from '../src/combat/combatState.js'
import { plannerStep } from '../src/combat/turnPlanner.js'
import { getWeapon } from '../src/combat/weaponSystem.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

function fight(distance = 1) {
  const map = createBlankMap({ name: 'AI Melee Test', width: 16, height: 12 })
  map.markers.playerStarts = [{ x: 2, y: 5 }]
  map.markers.enemySpawns = [{ x: 2 + distance, y: 5 }]
  const state = createCombat({
    map,
    players: [makeCharacter({ id: 'alpha', name: 'Alpha' })],
    seed: 31,
    initiativeOptions: { firstSide: 'player' },
  })
  const enemy = Object.values(state.combatants).find((combatant) => combatant.side === 'enemy')
  return { state, alpha: state.combatants.alpha, enemy }
}

describe('AI hand-to-hand choices', () => {
  it('uses melee at Reach and ranged weapons farther away', () => {
    const adjacent = fight(1)
    assert.equal(bestShot(adjacent.state, adjacent.alpha, adjacent.enemy).weapon.type, 'melee')
    const distant = fight(3)
    assert.equal(bestShot(distant.state, distant.alpha, distant.enemy).weapon.type, 'ranged')
  })

  it('uses Punch normally, but Aggressive and enemy Classic spend for Kick', () => {
    const { state, alpha } = fight()
    const shot = { weapon: getWeapon('unarmedStrike') }
    const funded = { ...state, resources: { ...state.resources, momentum: 2, threat: 2 } }
    assert.equal(aiUnarmedVariant(funded, alpha, shot, 'planner'), 'punch')
    assert.equal(aiUnarmedVariant(funded, alpha, shot, 'aggressive'), 'kick')
    assert.equal(aiUnarmedVariant(funded, { ...alpha, side: 'enemy' }, shot, 'classic'), 'kick')
    assert.equal(aiUnarmedVariant(state, alpha, shot, 'aggressive'), 'punch')
  })

  it('carries the selected Punch or Kick variant into a planner attack', () => {
    const { state, alpha } = fight()
    const unarmed = {
      ...state,
      resources: { ...state.resources, momentum: 2 },
      turn: { ...state.turn, minor: 0 },
      combatants: {
        ...state.combatants,
        [alpha.id]: { ...alpha, weaponIds: ['unarmedStrike'] },
      },
    }
    assert.equal(plannerStep(unarmed, unarmed.combatants[alpha.id], 'planner').variant, 'punch')
    assert.equal(plannerStep(unarmed, unarmed.combatants[alpha.id], 'aggressive').variant, 'kick')
  })

  it('Aggressive closes from Close range to make a melee attack', () => {
    const { state, alpha } = fight(2)
    const step = plannerStep(state, alpha, 'aggressive')
    assert.equal(step.type, 'move')
    assert.equal(step.weaponId, 'unarmedStrike')
    assert.deepEqual(step.destination, { x: 3, y: 5 })
  })

  it('Auto Combat rushes the party into Reach and leaves an enemy shooting', () => {
    const distant = fight(4)
    const party = nextAIStep(distant.state)
    assert.equal(party.type, 'move')
    assert.equal(party.weaponId, 'unarmedStrike')
    assert.deepEqual(party.destination, { x: 5, y: 5 })
    const enemyTurn = { ...distant.state, turnIndex: distant.state.order.indexOf(distant.enemy.id) }
    const enemy = nextAIStep(enemyTurn)
    assert.equal(enemy.type, 'aim')
    assert.equal(enemy.weaponId, 'disruptorPistol')
    const adjacent = fight(1)
    const strike = nextAIStep(adjacent.state)
    assert.ok(strike.type === 'aim' || strike.type === 'attack')
    assert.equal(strike.weaponId, 'unarmedStrike')
  })

  it('a party Turn Planner keeps closing, and Cautious holds when Reach is far', () => {
    const { state, alpha } = fight(8)
    const planner = plannerStep(state, alpha, 'planner')
    assert.equal(planner.type, 'sprint')
    assert.ok(planner.destination.x > alpha.position.x)
    assert.equal(plannerStep(state, alpha, 'cautious').type, 'endTurn')
  })
})
