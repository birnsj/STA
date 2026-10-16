// Hazard suit immunity, stacked Protection, and affliction-after-leave (world/hazardAfflictions.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { getProtection, afflictionRoundsFor, createCondition, normalizeCondition } from '../src/rules/personalCondition.js'
import { hazardImmunities, isImmuneToHazard } from '../src/rules/equipment.js'
import { createEnvironment, damageObject, HAZARD_TYPES, hazardRound, injuryFromHit } from '../src/world/environment.js'
import { syncHazardAfflictions } from '../src/world/hazardAfflictions.js'
import { makeCharacter } from './support/characters.js'

const room = ({ hazards = [], destructibles = [] } = {}) => ({
  ...createBlankMap({ name: 'Affliction Room', width: 16, height: 12 }),
  hazards,
  destructibles,
})
const fire = (id, tiles, overrides = {}) => ({ id, type: 'fire', tiles, spreadChance: 0, dissipateChance: 0, ...overrides })

describe('hazardImmunity', () => {
  it('unions hazardImmunity from equipped items', () => {
    const character = makeCharacter({ equipment: [{ itemId: 'thermalSuit' }] })
    assert.ok(isImmuneToHazard(character, 'fire'))
    assert.ok(isImmuneToHazard(character, 'plasmaFire'))
    assert.equal(isImmuneToHazard(character, 'toxicGas'), false)
    assert.deepEqual([...hazardImmunities(character)].sort(), ['fire', 'plasmaFire', 'steam'])
  })

  it('drops the tile hit and creates no affliction when immune', () => {
    const map = room({ hazards: [fire('f', { '4,4': 2 })] })
    const environment = createEnvironment(map)
    const character = makeCharacter({ equipment: [{ itemId: 'thermalSuit' }] })
    const round = hazardRound(environment, map, [{ id: 'in', position: { x: 4, y: 4 } }])
    assert.equal(round.hits.length, 1)
    const synced = syncHazardAfflictions(
      [{ id: 'in', position: { x: 4, y: 4 }, character, condition: createCondition() }],
      round.hits,
      round.environment,
    )
    assert.equal(synced.hits.length, 0)
    assert.deepEqual(synced.afflictionsById.get('in'), [])
  })
})

describe('affliction after leave', () => {
  it('Fitness 7 keeps base rounds; Fitness 12 still lingers at least 2', () => {
    assert.equal(afflictionRoundsFor(makeCharacter({ attributes: { fitness: 7 } })), 5)
    assert.equal(afflictionRoundsFor(makeCharacter({ attributes: { fitness: 8 } })), 4)
    assert.equal(afflictionRoundsFor(makeCharacter({ attributes: { fitness: 10 } })), 3)
    assert.equal(afflictionRoundsFor(makeCharacter({ attributes: { fitness: 12 } })), 2)
  })

  it('refreshes on the tile and deals affliction hits after leaving', () => {
    const map = room({ hazards: [fire('f', { '4,4': 2 })] })
    const environment = createEnvironment(map)
    const character = makeCharacter({ attributes: { fitness: 7 } })
    const onTile = hazardRound(environment, map, [{ id: 'a', position: { x: 4, y: 4 } }])
    const first = syncHazardAfflictions(
      [{ id: 'a', position: { x: 4, y: 4 }, character, condition: createCondition() }],
      onTile.hits,
      onTile.environment,
    )
    assert.equal(first.hits.length, 1)
    assert.equal(first.hits[0].kind, 'hazard')
    assert.equal(first.afflictionsById.get('a').length, 1)
    assert.equal(first.afflictionsById.get('a')[0].roundsLeft, 5)
    assert.equal(first.afflictionsById.get('a')[0].hazardType, 'fire')

    const condition = { ...createCondition(), afflictions: first.afflictionsById.get('a') }
    const offTile = hazardRound(onTile.environment, map, [{ id: 'a', position: { x: 6, y: 4 } }])
    assert.equal(offTile.hits.length, 0)
    const second = syncHazardAfflictions(
      [{ id: 'a', position: { x: 6, y: 4 }, character, condition }],
      offTile.hits,
      offTile.environment,
    )
    assert.equal(second.hits.length, 1)
    assert.equal(second.hits[0].severity, HAZARD_TYPES.fire.severity)
    assert.equal(second.afflictionsById.get('a')[0].roundsLeft, 4)

    let remaining = second.afflictionsById.get('a')
    for (let i = 0; i < 4; i += 1) {
      const tick = syncHazardAfflictions(
        [{ id: 'a', position: { x: 6, y: 4 }, character, condition: { ...condition, afflictions: remaining } }],
        [],
        offTile.environment,
      )
      remaining = tick.afflictionsById.get('a')
    }
    assert.equal(remaining.length, 0)

    const after = syncHazardAfflictions(
      [{ id: 'a', position: { x: 6, y: 4 }, character, condition: { ...condition, afflictions: [] } }],
      [],
      offTile.environment,
    )
    assert.equal(after.hits.length, 0)
  })

  it('high Fitness still gets a short affliction after standing in fire', () => {
    const map = room({ hazards: [fire('f', { '4,4': 2 })] })
    const environment = createEnvironment(map)
    const character = makeCharacter({ attributes: { fitness: 12 } })
    const round = hazardRound(environment, map, [{ id: 'a', position: { x: 4, y: 4 } }])
    const synced = syncHazardAfflictions(
      [{ id: 'a', position: { x: 4, y: 4 }, character, condition: createCondition() }],
      round.hits,
      round.environment,
    )
    assert.equal(synced.hits.length, 1, 'still takes the on-tile Injury')
    assert.equal(synced.afflictionsById.get('a').length, 1)
    assert.equal(synced.afflictionsById.get('a')[0].roundsLeft, 2)
  })
})

describe('stacked Protection', () => {
  it('sums protection from equipped items', () => {
    const character = makeCharacter({
      equipment: [{ itemId: 'armouredVest' }, { itemId: 'thermalSuit' }],
    })
    assert.equal(getProtection(character, { injuryType: 'deadly' }).value, 2)
  })
})

describe('explosions unchanged', () => {
  it('applies Protection to a blast; blast hits alone never create an affliction', () => {
    const map = room({
      destructibles: [{ id: 'c', type: 'chemicalContainer', position: { x: 5, y: 5 }, explosion: { radius: 2, severity: 3, injuryType: 'deadly', hazard: 'none' } }],
    })
    const environment = createEnvironment(map)
    const result = damageObject(environment, map, 'c', 99, [{ id: 'near', position: { x: 5, y: 6 } }])
    const blast = result.hits.find((hit) => hit.kind === 'explosion' && hit.targetId === 'near')
    assert.ok(blast, 'blast hit the nearby actor')
    assert.ok(result.hits.every((hit) => hit.kind === 'explosion'), 'damageObject only yields explosion hits')
    const character = makeCharacter({ equipment: [{ itemId: 'armouredVest' }], attributes: { fitness: 7 } })
    const injury = injuryFromHit(character, blast, 'blast-1')
    assert.equal(injury.protection, 1)
    assert.equal(injury.severity, Math.max(1, blast.severity - 1))
    // Affliction sync is not run on blast apply paths; even if called with only explosion hits and no tile hazard, no affliction.
    const synced = syncHazardAfflictions(
      [{ id: 'near', position: { x: 8, y: 8 }, character, condition: createCondition() }],
      result.hits,
      result.environment,
    )
    assert.ok(synced.hits.some((hit) => hit.kind === 'explosion'))
    assert.deepEqual(synced.afflictionsById.get('near'), [])
    assert.deepEqual(normalizeCondition(createCondition()).afflictions, [])
  })
})
