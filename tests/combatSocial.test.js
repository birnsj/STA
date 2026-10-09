// Persuade, Intimidate, surrender and retreat (designer decisions Oct 2026; Book Core pp.256, 278-282). The asker's
// successes set the Difficulty of the enemy's Control + Command roll; if the asker wins, the enemy takes that much Stress
// while it has Stress left, else surrenders. An enemy with no Stress left retreats and leaves once out of sight.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { combatReducer, createCombat, isActive, previewSocial } from '../src/combat/combatState.js'
import { retreatStep } from '../src/combat/combatRetreat.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { getMaxStress } from '../src/rules/personalCondition.js'
import { makeCharacter } from './support/characters.js'

function fight({ seed = 7, enemyAt = { x: 6, y: 5 }, wall = false } = {}) {
  const map = createBlankMap({ name: 'Social Test Room', width: 16, height: 12 })
  // A wall at x = 9 with a gap at y = 5, so the enemy is seen at first and can then duck behind it.
  if (wall) for (let y = 1; y < 11; y++) if (y !== 5) map.tiles[y][9] = map.tiles[0][0]
  map.markers.playerStarts = [{ x: 2, y: 5 }]
  map.markers.enemySpawns = [enemyAt]
  const state = createCombat({ map, players: [makeCharacter({ id: 'alpha', name: 'Alpha' })], seed, initiativeOptions: { firstSide: 'player' } })
  const enemy = Object.values(state.combatants).find((combatant) => combatant.side === 'enemy')
  return { state, enemy }
}

// The enemy as a full character (with a Stress track), with this much Stress already taken.
function withEnemyStress(state, enemyId, stress) {
  const enemy = state.combatants[enemyId]
  const character = { ...enemy.character, npcRules: 'main' }
  const max = getMaxStress(character).value
  const condition = { ...enemy.condition, stress: Math.min(stress, max), fatigued: stress >= max }
  return { ...state, combatants: { ...state.combatants, [enemyId]: { ...enemy, character, condition } } }
}

// The first seed whose request (kind) the asker wins (or loses) against an enemy with `stress` taken.
function askUntil(kind, wins, stress = 0) {
  for (let seed = 1; seed < 400; seed += 1) {
    const { state: fresh, enemy } = fight({ seed })
    const state = withEnemyStress(fresh, enemy.id, stress)
    const next = combatReducer(state, { type: kind, targetId: enemy.id })
    if (next.result?.passed === wins) return { before: state, next, enemy: next.combatants[enemy.id] }
  }
  throw new Error(`no seed gave a ${wins ? 'won' : 'lost'} ${kind}`)
}

describe('Persuade and Intimidate', () => {
  it('Persuade is Presence + Command, Intimidate Control + Security, resisted with Control + Command', () => {
    const { state, enemy } = fight()
    const persuade = previewSocial(state, 'alpha', enemy.id, 'persuade')
    const intimidate = previewSocial(state, 'alpha', enemy.id, 'intimidate')
    assert.ok(persuade.available, persuade.reason)
    assert.deepEqual([persuade.task.attribute.id, persuade.task.department.id], ['presence', 'command'])
    assert.deepEqual([intimidate.task.attribute.id, intimidate.task.department.id], ['control', 'security'])
    assert.deepEqual([persuade.resist.task.attribute.id, persuade.resist.task.department.id], ['control', 'command'])
  })

  it('needs the enemy within earshot', () => {
    const { state, enemy } = fight({ enemyAt: { x: 13, y: 5 } })
    const preview = previewSocial(state, 'alpha', enemy.id, 'persuade')
    assert.equal(preview.available, false)
    assert.match(preview.reason, /out of earshot/)
  })

  it('a win against an enemy with Stress left costs it Stress equal to the successes, and spends the major action', () => {
    const { before, next, enemy } = askUntil('persuade', true)
    assert.equal(next.turn.major, before.turn.major - 1)
    assert.equal(enemy.surrendered, undefined)
    assert.equal(next.result.social.outcome, 'stress')
    assert.equal(enemy.condition.stress, Math.min(next.result.successes, getMaxStress(enemy.character).value))
  })

  it('a loss changes nothing for the enemy', () => {
    const { enemy } = askUntil('persuade', false)
    assert.equal(enemy.condition.stress, 0)
    assert.ok(isActive(enemy))
  })

  it('an enemy with no Stress left surrenders, which ends the fight', () => {
    const { next, enemy } = askUntil('persuade', true, 99)
    assert.equal(enemy.surrendered, true)
    assert.equal(isActive(enemy), false)
    assert.equal(next.result.social.outcome, 'surrendered')
    assert.equal(next.outcome, 'victory')
  })

  it('a won Intimidate leaves the enemy Intimidated: +1 Difficulty to resist', () => {
    const { next, enemy } = askUntil('intimidate', true)
    assert.equal(enemy.intimidated, true)
    if (isActive(enemy)) assert.equal(previewSocial(next, 'alpha', enemy.id, 'persuade').resist.extra >= 1, true)
  })
})

describe('Retreat', () => {
  it('an enemy whose Stress track fills starts retreating', () => {
    const { state: fresh, enemy } = fight()
    const state = withEnemyStress(fresh, enemy.id, 99)
    const next = combatReducer(state, { type: 'endTurn' })
    assert.equal(next.combatants[enemy.id].retreating, true)
    assert.equal(next.outcome, null)
  })

  it('a retreating enemy runs out of sight and leaves the fight, which ends it', () => {
    const { state: fresh, enemy } = fight({ enemyAt: { x: 7, y: 5 }, wall: true })
    let state = combatReducer(withEnemyStress(fresh, enemy.id, 99), { type: 'endTurn' })
    assert.equal(state.combatants[enemy.id].retreating, true)
    for (let i = 0; i < 6 && !state.outcome; i++) {
      const self = state.combatants[state.order[state.turnIndex]]
      state = combatReducer(state, self.side === 'enemy' ? retreatStep(state, self) : { type: 'endTurn' })
    }
    assert.equal(state.combatants[enemy.id].left, true)
    assert.equal(state.outcome, 'victory')
  })
})
