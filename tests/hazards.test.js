// Environmental hazards (world/environment.js hazardRound, world/EnvironmentalHazard.js): the lingering
// Injury, spreading and dissipating, damage to objects beside a hazard, leaks, the neutralize Challenge, the exploration
// clock and the combat round hook.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { combatReducer, createCombat, getActiveCombatant } from '../src/combat/combatState.js'
import { attemptChallenge, challengeFor } from '../src/exploration/challengeObjects.js'
import { createExplorationState, explorationReducer } from '../src/exploration/explorationState.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { hazardChallengeId } from '../src/world/EnvironmentalHazard.js'
import { createEnvironment, damageObject, HAZARD_ROUND_SECONDS, HAZARD_TYPES, hazardRound, neutralizeHazard } from '../src/world/environment.js'
import { applyObjectEffect } from '../src/world/objectEffects.js'
import { objectFor } from '../src/world/objects.js'
import { makeCharacter } from './support/characters.js'

const room = ({ hazards = [], destructibles = [] } = {}) => ({ ...createBlankMap({ name: 'Hazard Room', width: 16, height: 12 }), hazards, destructibles })
const fire = (id, tiles, overrides = {}) => ({ id, type: 'fire', tiles, ...overrides })

describe('hazard rounds', () => {
  it('hits everyone standing in a hazard with the worst one on their tile', () => {
    const map = room({ hazards: [fire('f', { '4,4': 2 }), { id: 'p', type: 'plasmaFire', tiles: { '4,4': 1 } }] })
    const result = hazardRound(createEnvironment(map), map, [
      { id: 'in', position: { x: 4, y: 4 } },
      { id: 'out', position: { x: 6, y: 4 } },
    ])
    assert.equal(result.hits.length, 1)
    assert.equal(result.hits[0].targetId, 'in')
    assert.equal(result.hits[0].severity, HAZARD_TYPES.plasmaFire.severity)
    assert.equal(result.hits[0].kind, 'hazard')
  })

  it('spreads from thick tiles into open neighbours at one less, and dissipates', () => {
    const map = room({ hazards: [fire('f', { '5,5': 3 }, { spreadChance: 100, dissipateChance: 0 })] })
    const spread = hazardRound(createEnvironment(map), map).environment.hazards.f
    const added = Object.entries(spread.tiles).filter(([key]) => key !== '5,5')
    assert.equal(added.length, 1)
    assert.equal(added[0][1], 2)
    const thin = room({ hazards: [fire('f', { '5,5': 1 }, { spreadChance: 100, dissipateChance: 100 })] })
    assert.equal(hazardRound(createEnvironment(thin), thin).environment.hazards.f, undefined, 'a region with no tiles left is gone')
  })

  it('never spreads through walls', () => {
    const map = room({ hazards: [fire('f', { '1,1': 3 }, { spreadChance: 100, dissipateChance: 0 })] })
    const tiles = Object.keys(hazardRound(createEnvironment(map), map).environment.hazards.f.tiles)
    assert.ok(tiles.every((key) => !key.split(',').includes('0')))
  })

  it('damages objects beside a hazard that burns objects', () => {
    const map = room({ hazards: [fire('f', { '5,5': 1 }, { spreadChance: 0, dissipateChance: 0 })], destructibles: [{ id: 'c', type: 'chemicalContainer', position: { x: 6, y: 5 } }] })
    const environment = createEnvironment(map)
    const after = hazardRound(environment, map).environment.destructibles.c
    assert.equal(after.structure, environment.destructibles.c.structure - HAZARD_TYPES.fire.damagesObjects)
  })

  it('a hazard with a duration goes out after that many rounds; one without lasts until it dissipates', () => {
    const map = room({ hazards: [fire('timed', { '5,5': 2 }, { duration: 2, spreadChance: 0, dissipateChance: 0 }), fire('lasting', { '9,5': 2 }, { spreadChance: 0, dissipateChance: 0 })] })
    const first = hazardRound(createEnvironment(map), map).environment
    assert.equal(first.hazards.timed.roundsLeft, 1)
    const second = hazardRound(first, map).environment
    assert.equal(second.hazards.timed, undefined, 'out after its 2 rounds')
    assert.deepEqual(second.hazards.lasting.tiles, { '9,5': 2 })
    assert.equal(second.hazards.lasting.roundsLeft, null)
  })

  it('an inactive hazard does nothing until something sets it going', () => {
    const map = room({ hazards: [fire('f', { '4,4': 2 }, { active: false, spreadChance: 100, dissipateChance: 0 })] })
    const environment = createEnvironment(map)
    const result = hazardRound(environment, map, [{ id: 'in', position: { x: 4, y: 4 } }])
    assert.equal(result.hits.length, 0)
    assert.deepEqual(result.environment.hazards.f.tiles, { '4,4': 2 })
  })

  it('a damaged object keeps leaking until the leak is neutralized', () => {
    const map = room({ destructibles: [{ id: 'c', type: 'chemicalContainer', position: { x: 6, y: 5 } }] })
    const environment = createEnvironment(map)
    const hit = damageObject(environment, map, 'c', 2)
    assert.equal(hit.environment.destructibles.c.state, 'damaged')
    assert.ok(hit.environment.hazards['leak:c'], 'the leak starts')
    const sealed = neutralizeHazard(hit.environment, 'leak:c')
    assert.equal(sealed.destructibles.c.leakSealed, true)
    assert.equal(hazardRound(sealed, hit.map).environment.hazards['leak:c'], undefined, 'a sealed leak does not come back')
  })
})

const team = () => ['alpha', 'beta'].map((id) => makeCharacter({ id, name: id, attributes: { control: 12 }, disciplines: { engineering: 5 } }))
function explore(map, seed = 1) {
  map.markers.playerStarts = [{ x: 4, y: 6 }, { x: 4, y: 8 }]
  map.markers.enemySpawns = []
  return createExplorationState(map, team(), seed)
}

describe('hazards in exploration', () => {
  it("a hazard's Neutralize goes through the challenge roll and puts the whole region out", () => {
    const map = room({ hazards: [fire('f', { '5,6': 2, '5,7': 2 }, { spreadChance: 0, dissipateChance: 0 })] })
    let neutralized = null
    for (let seed = 1; seed < 60 && !neutralized; seed += 1) {
      const state = explore(room({ hazards: map.hazards }), seed)
      assert.equal(objectFor(state.scenario, hazardChallengeId('f')), null, 'never a challenge object in the scenario')
      const object = challengeFor(state, hazardChallengeId('f'))
      assert.ok(object, 'its Neutralize task is built on demand')
      assert.deepEqual(object.position(), { x: 5, y: 6 }, 'its marker sits on the anchor tile')
      assert.deepEqual(object.currentTiles(state.scenario), [], 'it never changes the map tiles')
      const after = explorationReducer(state, { type: 'neutralizeHazard', hazardId: 'f', performerId: 'alpha' })
      assert.notEqual(after, state)
      assert.equal(after.scenario.definitions.length, state.scenario.definitions.length)
      if (after.lastTask.success) neutralized = after
    }
    assert.ok(neutralized, 'some seed succeeds')
    assert.equal(neutralized.environment.hazards.f, undefined)
    assert.equal(challengeFor(neutralized, hazardChallengeId('f')), null, 'its task goes with it')
    assert.ok(neutralized.missionLog.entries.some((entry) => entry.text.includes('Extinguish (Fire)')), 'the Captain\'s Log names the hazard')
  })

  it('is out of reach unless a member stands within range of one of its tiles', () => {
    const state = explore(room({ hazards: [fire('f', { '12,6': 2 }, { spreadChance: 0, dissipateChance: 0 })] }))
    assert.equal(attemptChallenge(state, { objectId: hazardChallengeId('f'), actionId: 'neutralize', performerId: 'alpha' }), state)
  })

  it('an authored challenge outcome can put a hazard out (neutralizeHazard effect)', () => {
    const state = explore(room({ hazards: [fire('f', { '5,6': 3, '6,6': 1 }, { spreadChance: 0, dissipateChance: 0 })] }))
    const object = { id: 'panel', position: () => ({ x: 0, y: 0 }) }
    const reduced = applyObjectEffect(state, object, { id: 'vent' }, { type: 'neutralizeHazard', hazardId: 'f', mode: 'reduce' }, { messages: [] })
    assert.deepEqual(reduced.environment.hazards.f.tiles, { '5,6': 2 })
    const stopped = applyObjectEffect(state, object, { id: 'vent' }, { type: 'neutralizeHazard', hazardId: 'f', mode: 'stopSpread' }, { messages: [] })
    assert.equal(stopped.environment.hazards.f.spread, false)
  })

  it('a hazard round passes every HAZARD_ROUND_SECONDS of world time; the member standing in it takes Stress', () => {
    let state = explore(room({ hazards: [fire('f', { '4,6': 2 }, { spreadChance: 0, dissipateChance: 0 })] }))
    state = explorationReducer(state, { type: 'tick', seconds: HAZARD_ROUND_SECONDS - 1 })
    assert.equal(state.injuryPrompts.length, 0)
    state = explorationReducer(state, { type: 'tick', seconds: 1.5 })
    assert.deepEqual(state.injuryPrompts ?? [], [])
    assert.ok(state.party.members.alpha.condition.stress > 0)
    assert.equal(state.environment.round, 1)
  })
})

describe('hazards across the hand-off', () => {
  it('a fight starts from the world\'s hazards, its rounds go on burning them, and exploration resumes with the result', () => {
    const map = room({ hazards: [fire('f', { '9,9': 2 }, { duration: 5, spreadChance: 0, dissipateChance: 0 })] })
    map.markers.playerStarts = [{ x: 4, y: 6 }, { x: 4, y: 8 }]
    map.markers.enemySpawns = [{ x: 7, y: 6 }]
    let state = createExplorationState(map, team(), 3)
    state = explorationReducer(state, { type: 'tick', seconds: HAZARD_ROUND_SECONDS / 2 })
    const clockBefore = state.hazardClock
    const [npcId] = Object.keys(state.world.npcs)
    const fighting = explorationReducer(state, { type: 'attackNpc', npcId, targetId: 'alpha' })
    assert.equal(fighting.combat.environment, state.environment, 'the fight starts from the very same environment')

    let combat = fighting.combat
    for (let i = 0; i < 12 && combat.round < 3; i += 1) combat = combatReducer(combat, { type: 'endTurn' })
    assert.equal(combat.round, 3)
    assert.equal(combat.environment.round, 2, 'two new rounds, two hazard rounds')
    assert.equal(combat.environment.hazards.f.roundsLeft, 3)

    const ended = explorationReducer({ ...fighting, combat }, { type: 'endCombat' })
    assert.equal(ended.environment.hazards.f.roundsLeft, 3, 'exploration carries on from the fight\'s result')
    assert.equal(ended.environment.round, 2)
    assert.equal(ended.hazardClock, clockBefore, 'the world clock waited while the fight ran')
    const resumed = explorationReducer(ended, { type: 'tick', seconds: HAZARD_ROUND_SECONDS / 2 + 0.1 })
    assert.equal(resumed.environment.round, 3, 'and the next world round comes when the rest of the interval has passed')
  })
})

describe('neutralizing across modes', () => {
  it('a hazard put out in a fight (the same Neutralize task) is gone in the fight, its map and the world afterwards', () => {
    let neutralized = null
    for (let seed = 1; seed < 40 && !neutralized; seed += 1) {
      const map = room({ hazards: [fire('f', { '5,6': 2, '5,7': 2 }, { spreadChance: 0, dissipateChance: 0 })] })
      map.markers.playerStarts = [{ x: 4, y: 6 }, { x: 4, y: 8 }]
      map.markers.enemySpawns = [{ x: 12, y: 6 }]
      let state = createExplorationState(map, team(), seed)
      const [npcId] = Object.keys(state.world.npcs)
      state = explorationReducer(state, { type: 'attackNpc', npcId, targetId: 'alpha' })
      for (let i = 0; i < 6 && getActiveCombatant(state.combat).side !== 'player'; i += 1) state = explorationReducer(state, { type: 'combat', action: { type: 'endTurn' } })
      const actor = getActiveCombatant(state.combat)
      assert.equal(actor.side, 'player')
      const after = explorationReducer(state, { type: 'combat', action: { type: 'interact', objectId: hazardChallengeId('f'), actionId: 'neutralize' } })
      assert.notEqual(after, state, `${actor.id} can reach the fire and has the Major action`)
      assert.equal(after.combat.environment, after.environment, 'the fight and the world share one environment record')
      if (after.lastTask.success) neutralized = after
    }
    assert.ok(neutralized, 'some seed succeeds')
    assert.equal(neutralized.combat.environment.hazards.f, undefined)
    const ended = explorationReducer(neutralized, { type: 'endCombat' })
    assert.equal(ended.environment.hazards.f, undefined, 'still out after the fight')
    assert.equal(challengeFor(ended, hazardChallengeId('f')), null)
  })
})

describe('hazards in combat', () => {
  it('act at the start of each new round', () => {
    const map = room({ hazards: [fire('f', { '3,6': 2 }, { spreadChance: 0, dissipateChance: 0 })] })
    map.markers.playerStarts = [{ x: 3, y: 6 }]
    map.markers.enemySpawns = [{ x: 13, y: 6 }]
    let state = createCombat({ map, players: [makeCharacter({ id: 'alpha', name: 'Alpha' })], seed: 2, initiativeOptions: { firstSide: 'player' } })
    assert.equal(state.round, 1)
    for (let i = 0; i < 6 && state.round === 1; i += 1) state = combatReducer(state, { type: 'endTurn' })
    assert.equal(state.round, 2)
    assert.equal(state.environment.round, 1)
    assert.equal(state.incomingInjury, null, 'no Avoid Injury prompt for hazard hits')
    assert.ok(state.combatants.alpha.condition.stress > 0, 'Alpha auto-takes Stress from the fire')
    assert.ok(state.log.some((entry) => entry.lines.some((line) => line.includes('in the fire'))))
  })
})
