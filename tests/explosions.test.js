// Explosions and shots at destructible objects (world/environment.js damageObject, combat/combatEnvironment.js,
// combat/objectAI.js, exploration/explorationEnvironment.js): blast radius against hazard radius, walls, every side
// caught, one hit per character per chain, chain order, the queued Avoid Injury prompts and the AI keeping its own side
// out of a blast.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { combatReducer, createCombat } from '../src/combat/combatState.js'
import { damageObjectInCombat } from '../src/combat/combatEnvironment.js'
import { objectShotOptions } from '../src/combat/objectAI.js'
import { currentInjuryPrompt, previewObjectShot } from '../src/exploration/explorationEnvironment.js'
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { applyEnvironmentTiles, createEnvironment, damageObject, DESTRUCTIBLE_TYPES } from '../src/world/environment.js'
import { makeCharacter } from './support/characters.js'

const GAS = DESTRUCTIBLE_TYPES.gasCylinder.explosion

function setup(destructibles, { width = 16, height = 12, walls = [] } = {}) {
  const map = { ...createBlankMap({ name: 'Blast Test', width, height }), destructibles }
  walls.forEach(({ x, y }) => {
    map.tiles[y][x] = 'bulkhead'
  })
  const environment = createEnvironment(map)
  return { environment, map: applyEnvironmentTiles(map, environment) }
}

describe('explosions', () => {
  it('hits everyone within the blast radius; the hazard covers only its own radius', () => {
    const { environment, map } = setup([{ id: 'g', type: 'gasCylinder', position: { x: 6, y: 6 } }])
    const actors = [
      { id: 'near', position: { x: 6 + GAS.radius, y: 6 } },
      { id: 'far', position: { x: 6 + GAS.radius + 1, y: 6 } },
    ]
    const result = damageObject(environment, map, 'g', 10, actors)
    assert.deepEqual(result.hits.map((hit) => hit.targetId), ['near'])
    assert.equal(result.hits[0].severity, GAS.severity)
    const region = Object.values(result.environment.hazards)[0]
    assert.equal(region.type, GAS.hazard)
    const tiles = Object.keys(region.tiles).map((key) => key.split(',').map(Number))
    assert.ok(tiles.length > 1)
    assert.ok(tiles.every(([x, y]) => Math.abs(x - 6) <= GAS.hazardRadius && Math.abs(y - 6) <= GAS.hazardRadius))
  })

  it('walls stop the blast', () => {
    const { environment, map } = setup([{ id: 'g', type: 'gasCylinder', position: { x: 6, y: 6 } }], { walls: [{ x: 7, y: 5 }, { x: 7, y: 6 }, { x: 7, y: 7 }] })
    const result = damageObject(environment, map, 'g', 10, [{ id: 'behind', position: { x: 8, y: 6 } }, { id: 'open', position: { x: 4, y: 6 } }])
    assert.deepEqual(result.hits.map((hit) => hit.targetId), ['open'])
  })

  it('catches every side, and hits each character once per chain', () => {
    const { environment, map } = setup([
      { id: 'a', type: 'gasCylinder', position: { x: 5, y: 6 } },
      { id: 'b', type: 'gasCylinder', position: { x: 7, y: 6 } },
    ])
    const actors = [
      { id: 'player', position: { x: 6, y: 5 } },
      { id: 'enemy', position: { x: 6, y: 7 } },
    ]
    const result = damageObject(environment, map, 'a', 10, actors)
    assert.deepEqual(result.hits.map((hit) => hit.targetId).sort(), ['enemy', 'player'])
    assert.deepEqual(result.explosions.map((explosion) => explosion.objectId), ['a', 'b'], 'the chain sets off the second cylinder once')
    assert.equal(result.environment.destructibles.b.state, 'destroyed')
  })

  it('a blast at the map edge is clipped to the map: nothing outside it is caught or covered', () => {
    const { environment, map } = setup([{ id: 'g', type: 'gasCylinder', position: { x: 0, y: 0 } }])
    const result = damageObject(environment, map, 'g', 10, [
      { id: 'inside', position: { x: 1, y: 1 } },
      { id: 'offMap', position: { x: -1, y: 0 } },
    ])
    assert.deepEqual(result.hits.map((hit) => hit.targetId), ['inside'])
    const tiles = Object.keys(Object.values(result.environment.hazards)[0].tiles).map((key) => key.split(',').map(Number))
    assert.ok(tiles.every(([x, y]) => x >= 0 && y >= 0 && x < map.width && y < map.height))
  })

  it('two objects in each other\'s blast detonate once each, and a destroyed object takes no more damage', () => {
    const { environment, map } = setup([
      { id: 'a', type: 'gasCylinder', position: { x: 5, y: 6 } },
      { id: 'b', type: 'gasCylinder', position: { x: 6, y: 6 } },
    ])
    const first = damageObject(environment, map, 'a', 10)
    assert.deepEqual(first.explosions.map((explosion) => explosion.objectId), ['a', 'b'])
    const again = damageObject(first.environment, first.map, 'b', 10)
    assert.deepEqual(again.explosions, [])
    assert.equal(again.environment, first.environment)
  })

  it('chain reactions go nearest first, then by id', () => {
    const { environment, map } = setup([
      { id: 'start', type: 'gasCylinder', position: { x: 6, y: 6 } },
      { id: 'z', type: 'gasCylinder', position: { x: 7, y: 6 } },
      { id: 'y', type: 'gasCylinder', position: { x: 8, y: 6 } },
      { id: 'a', type: 'gasCylinder', position: { x: 9, y: 6 } },
    ])
    const result = damageObject(environment, map, 'start', 10)
    assert.deepEqual(result.explosions.map((explosion) => explosion.objectId), ['start', 'z', 'y', 'a'])
  })
})

function fight(destructibles, playerStarts, enemySpawns, firstSide = 'player') {
  const map = { ...createBlankMap({ name: 'Blast Fight', width: 16, height: 12 }), destructibles }
  map.markers.playerStarts = playerStarts
  map.markers.enemySpawns = enemySpawns
  const players = playerStarts.map((_, index) => makeCharacter({ id: `p${index + 1}`, name: `Player ${index + 1}` }))
  return createCombat({ map, players, seed: 3, initiativeOptions: { firstSide } })
}

describe('firing on an object in exploration', () => {
  const team = () => ['alpha', 'beta'].map((id) => makeCharacter({ id, name: id, equipment: [{ itemId: 'phaserType1' }] }))
  function explore(seed) {
    const map = { ...createBlankMap({ name: 'Blast Room', width: 18, height: 14 }), destructibles: [{ id: 'g', type: 'gasCylinder', position: { x: 6, y: 7 } }] }
    map.markers.playerStarts = [{ x: 4, y: 6 }, { x: 4, y: 8 }]
    map.markers.enemySpawns = []
    return createExplorationState(map, team(), seed)
  }
  // The first seed whose shot destroys the cylinder.
  function blown() {
    for (let seed = 1; seed < 100; seed += 1) {
      const after = explorationReducer(explore(seed), { type: 'fireOnObject', memberId: 'alpha', objectId: 'g' })
      if (after.environment.destructibles.g.state === 'destroyed') return after
    }
    throw new Error('no seed destroyed the cylinder')
  }

  it('previews the shot with the weapon and the Structure it would do', () => {
    const preview = previewObjectShot(explore(1), 'alpha', 'g')
    assert.equal(preview.available, true)
    assert.equal(preview.damage, Math.max(1, preview.weapon.severity - DESTRUCTIBLE_TYPES.gasCylinder.resistance))
  })

  it("a member with no weapon of their own fires the standard issue the party bar shows", () => {
    const state = explore(1)
    const unarmed = { ...state.party.members.alpha, character: { ...state.party.members.alpha.character, equipment: [] } }
    const preview = previewObjectShot({ ...state, party: { ...state.party, members: { ...state.party.members, alpha: unarmed } } }, 'alpha', 'g')
    assert.equal(preview.available, true)
    assert.equal(preview.weapon.id, 'phaserType2')
  })

  it('queues an Avoid Injury prompt for each party member the blast catches, answered one at a time', () => {
    const state = blown()
    assert.equal(state.environment.explosions.length, 1)
    assert.deepEqual(state.injuryPrompts.map((prompt) => prompt.targetId), ['alpha', 'beta'])
    assert.equal(currentInjuryPrompt(state).option.possible, true)
    const first = explorationReducer(state, { type: 'answerInjuryPrompt', avoid: true })
    assert.equal(currentInjuryPrompt(first).targetId, 'beta')
    assert.ok(first.party.members.alpha.condition.stress > 0)
    const second = explorationReducer(first, { type: 'answerInjuryPrompt', avoid: false })
    assert.equal(currentInjuryPrompt(second), null)
    assert.equal(second.party.members.beta.condition.defeated, true)
    assert.equal(second.party.map.tiles[7][6], 'dsGasCylinderDestroyed', 'the world map shows the wreck')
  })
})

describe('explosions in combat', () => {
  it('queues one Avoid Injury prompt per party member caught', () => {
    const state = fight([{ id: 'g', type: 'gasCylinder', position: { x: 6, y: 6 } }], [{ x: 5, y: 6 }, { x: 7, y: 6 }], [{ x: 14, y: 2 }])
    const { state: after } = damageObjectInCombat(state, 'g', 10)
    assert.equal(after.incomingInjury?.targetId, 'p1')
    assert.deepEqual(after.injuryQueue.map((entry) => entry.targetId), ['p2'])
    const first = combatReducer(after, { type: 'injuryDecision', avoid: true })
    assert.equal(first.incomingInjury?.targetId, 'p2', 'the next prompt comes up')
    assert.equal(first.injuryQueue.length, 0)
    const second = combatReducer(first, { type: 'injuryDecision', avoid: true })
    assert.equal(second.incomingInjury, null)
    assert.ok(second.combatants.p1.condition.stress > 0 && second.combatants.p2.condition.stress > 0)
  })

  it('the AI never fires on an object whose blast would catch its own side', () => {
    const near = fight([{ id: 'g', type: 'gasCylinder', position: { x: 8, y: 6 } }], [{ x: 7, y: 6 }], [{ x: 9, y: 6 }], 'enemy')
    const enemy = Object.values(near.combatants).find((combatant) => combatant.side === 'enemy')
    assert.deepEqual(objectShotOptions(near, enemy), [])
    const clear = fight([{ id: 'g', type: 'gasCylinder', position: { x: 4, y: 6 } }], [{ x: 3, y: 6 }], [{ x: 12, y: 6 }], 'enemy')
    const shooter = Object.values(clear.combatants).find((combatant) => combatant.side === 'enemy')
    const options = objectShotOptions(clear, shooter)
    assert.ok(options.length > 0, 'a blast that catches only the party is worth a shot')
    assert.equal(options[0].action.objectId, 'g')
  })
})
