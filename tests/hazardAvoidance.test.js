// AI / Auto Combat leaves damaging hazards and never steps onto them (combat/hazardAvoidance.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createCombat, getActiveCombatant, combatReducer } from '../src/combat/combatState.js'
import { chooseAIStep, normalStep } from '../src/combat/autoCombat.js'
import { escapeHazardStep, damagingHazardAt, isSafeTile, safeReachable } from '../src/combat/hazardAvoidance.js'
import { nextAIStep } from '../src/combat/combatAI.js'
import { plannerStep } from '../src/combat/turnPlanner.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { makeCharacter } from './support/characters.js'

const room = ({ hazards = [] } = {}) => {
  const map = createBlankMap({ name: 'AI Hazard Room', width: 16, height: 12 })
  map.hazards = hazards
  map.markers.playerStarts = [{ x: 4, y: 6 }]
  map.markers.enemySpawns = [{ x: 12, y: 6 }]
  return map
}

const fireAt = (x, y) => ({ id: 'f', type: 'fire', tiles: { [`${x},${y}`]: 2 }, spreadChance: 0, dissipateChance: 0 })

describe('hazardAvoidance helpers', () => {
  it('treats damaging tiles as unsafe unless the character is immune', () => {
    const map = room({ hazards: [fireAt(4, 6)] })
    const state = createCombat({ map, players: [makeCharacter({ id: 'alpha', name: 'Alpha' })], seed: 1, initiativeOptions: { firstSide: 'player' } })
    const self = state.combatants.alpha
    assert.ok(damagingHazardAt(state.environment, self.position, self.character))
    assert.equal(isSafeTile(state.environment, self.position, self.character), false)
    const immune = makeCharacter({ id: 'alpha', name: 'Alpha', equipment: [{ itemId: 'thermalSuit' }] })
    assert.equal(damagingHazardAt(state.environment, self.position, immune), null)
  })
})

describe('AI escapes and avoids hazards', () => {
  it('escapeHazardStep leaves fire for the nearest safe tile', () => {
    const map = room({ hazards: [fireAt(4, 6)] })
    const state = createCombat({ map, players: [makeCharacter({ id: 'alpha', name: 'Alpha' })], seed: 1, initiativeOptions: { firstSide: 'player' } })
    const self = getActiveCombatant(state)
    const step = escapeHazardStep(state, self)
    assert.ok(step)
    assert.equal(step.type, 'move')
    assert.ok(isSafeTile(state.environment, step.destination, self.character))
    assert.match(step.decision, /out of hazard/i)
  })

  it('classic Auto Combat leaves fire before attacking', () => {
    const map = room({ hazards: [fireAt(4, 6)] })
    const state = createCombat({ map, players: [makeCharacter({ id: 'alpha', name: 'Alpha' })], seed: 1, initiativeOptions: { firstSide: 'player' } })
    const self = getActiveCombatant(state)
    const step = normalStep(state, self, 'classic')
    assert.equal(step.type, 'move')
    assert.ok(isSafeTile(state.environment, step.destination, self.character))
  })

  it('turn planner leaves fire', () => {
    const map = room({ hazards: [fireAt(4, 6)] })
    const state = createCombat({ map, players: [makeCharacter({ id: 'alpha', name: 'Alpha' })], seed: 1, initiativeOptions: { firstSide: 'player' } })
    const self = getActiveCombatant(state)
    const step = plannerStep(state, self, 'planner')
    assert.equal(step.type, 'move')
    assert.ok(isSafeTile(state.environment, step.destination, self.character))
  })

  it('move destinations never include damaging hazard tiles', () => {
    const map = room({
      hazards: [
        fireAt(5, 6),
        { id: 'f2', type: 'fire', tiles: { '5,5': 2, '5,7': 2, '6,6': 2 }, spreadChance: 0, dissipateChance: 0 },
      ],
    })
    // Start off the fire so escape does not trigger; AI should still refuse to walk into it.
    map.markers.playerStarts = [{ x: 4, y: 6 }]
    const state = createCombat({ map, players: [makeCharacter({ id: 'alpha', name: 'Alpha' })], seed: 1, initiativeOptions: { firstSide: 'player' } })
    const self = getActiveCombatant(state)
    assert.equal(damagingHazardAt(state.environment, self.position, self.character), null)
    const safe = safeReachable(state, self)
    assert.ok(safe.length > 0)
    assert.ok(safe.every((entry) => isSafeTile(state.environment, entry.position, self.character)))
    const step = nextAIStep(state)
    if (step.type === 'move' || step.type === 'sprint') {
      assert.ok(isSafeTile(state.environment, step.destination, self.character), 'AI must not walk into fire')
    }
  })

  it('chooseAIStep for the enemy also escapes fire', () => {
    const map = room({ hazards: [fireAt(12, 6)] })
    let state = createCombat({
      map,
      players: [makeCharacter({ id: 'alpha', name: 'Alpha' })],
      seed: 1,
      initiativeOptions: { firstSide: 'enemy' },
    })
    // Ensure an enemy is active on the fire tile.
    const enemy = getActiveCombatant(state)
    assert.equal(enemy.side, 'enemy')
    assert.ok(damagingHazardAt(state.environment, enemy.position, enemy.character))
    const step = chooseAIStep(state, { enemyAI: 'classic', partyAmbush: false })
    assert.equal(step.type, 'move')
    assert.ok(isSafeTile(state.environment, step.destination, enemy.character))
    state = combatReducer(state, step)
    assert.ok(isSafeTile(state.environment, state.combatants[enemy.id].position, enemy.character))
  })

  it('a thermal suit wearer does not flee fire', () => {
    const map = room({ hazards: [fireAt(4, 6)] })
    const state = createCombat({
      map,
      players: [makeCharacter({ id: 'alpha', name: 'Alpha', equipment: [{ itemId: 'thermalSuit' }] })],
      seed: 1,
      initiativeOptions: { firstSide: 'player' },
    })
    const self = getActiveCombatant(state)
    assert.equal(escapeHazardStep(state, self), null)
  })
})
