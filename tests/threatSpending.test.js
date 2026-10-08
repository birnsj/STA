// Enemies spend Threat (Book p.264, p.324: Threat mirrors group Momentum for NPCs; designer decision Oct 2026).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nextAIStep } from '../src/combat/combatAI.js'
import { combatReducer, createCombat, EXTRA_ACTIONS, extraMinorBlock, getActiveCombatant, getHitChance, previewAttack, secondMajorBlock } from '../src/combat/combatState.js'
import { bonusDiceCost, createMissionResources } from '../src/rules/missionResources.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

function testMap() {
  const map = createBlankMap({ name: 'Threat Test Room', width: 16, height: 12 })
  map.markers.playerStarts = [{ x: 2, y: 5 }]
  map.markers.enemySpawns = [{ x: 8, y: 5 }]
  return map
}

// The first Klingon takes the first turn.
function enemyTurn(threat) {
  return createCombat({
    map: testMap(),
    players: [makeCharacter({ id: 'alpha', name: 'Alpha' })],
    seed: 5,
    initiativeOptions: { firstSide: 'enemy' },
    resources: createMissionResources({ threat }),
  })
}

describe('extra actions bought with Threat', () => {
  it('Book p.260: an Extra Minor Action costs an NPC 1 Threat', () => {
    const broke = enemyTurn(0)
    assert.match(extraMinorBlock(broke, getActiveCombatant(broke)), /Threat/)
    const state = enemyTurn(3)
    assert.equal(extraMinorBlock(state, getActiveCombatant(state)), null)
    const next = combatReducer(state, { type: 'buyExtraMinor' })
    assert.equal(next.resources.threat, 3 - EXTRA_ACTIONS.extraMinorCost)
    assert.equal(next.turn.minor, state.turn.minor + 1)
    assert.equal(next.resources.momentum, 0)
  })

  it('Book p.288: a Second Major Action costs an NPC 2 Threat, after its first', () => {
    const state = enemyTurn(3)
    assert.match(secondMajorBlock(state, getActiveCombatant(state)), /major action first/)
    const used = { ...state, turn: { ...state.turn, major: 0 } }
    assert.equal(secondMajorBlock(used, getActiveCombatant(used)), null)
    const next = combatReducer(used, { type: 'buySecondMajor' })
    assert.equal(next.resources.threat, 3 - EXTRA_ACTIONS.secondMajorCost)
    assert.equal(next.turn.major, 1)
    assert.equal(next.turn.secondMajor, true)
  })
})

describe('the enemy AI spends Threat', () => {
  // Steps the enemy AI until it attacks; returns the state before the attack and the attack action.
  function untilAttack(state) {
    for (let step = 0; step < 10; step++) {
      const action = nextAIStep(state)
      if (action.type === 'attack') return { state, action }
      state = combatReducer(state, action)
    }
    throw new Error('the enemy never attacked')
  }

  it('buys bonus d20s for a doubtful shot, paid in Threat', () => {
    const { state, action } = untilAttack(enemyTurn(6))
    const enemy = getActiveCombatant(state)
    const shot = previewAttack(state, enemy.id, action.targetId, action.weaponId)
    assert.ok(getHitChance(state, enemy.id, shot) < 0.75, 'test needs a doubtful shot')
    assert.ok(action.purchase?.bonusDice >= 1, JSON.stringify(action))
    const after = combatReducer(state, action)
    assert.equal(after.resources.threat, state.resources.threat - bonusDiceCost(action.purchase.bonusDice))
  })

  it('buys nothing without Threat', () => {
    const { action } = untilAttack(enemyTurn(0))
    assert.equal(action.purchase, undefined)
  })
})
