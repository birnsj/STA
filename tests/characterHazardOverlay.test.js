// Character hazard overlay type (world/characterHazardOverlay.js): tile hazard or lingering affliction.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { createCondition } from '../src/rules/personalCondition.js'
import { characterHazardOverlayType, hasCharacterHazardOverlay, resolveHazardOverlayDisplay } from '../src/world/characterHazardOverlay.js'
import { createEnvironment } from '../src/world/environment.js'
import { makeCharacter } from './support/characters.js'

describe('characterHazardOverlayType', () => {
  it('uses the tile hazard while standing in fire', () => {
    const map = {
      ...createBlankMap({ name: 'Overlay', width: 8, height: 8 }),
      hazards: [{ id: 'f', type: 'fire', tiles: { '2,2': 2 }, spreadChance: 0, dissipateChance: 0 }],
    }
    const environment = createEnvironment(map)
    const character = makeCharacter()
    assert.equal(characterHazardOverlayType(environment, { x: 2, y: 2 }, character, createCondition()), 'fire')
    assert.equal(characterHazardOverlayType(environment, { x: 3, y: 3 }, character, createCondition()), null)
  })

  it('keeps showing an affliction after leaving the tile', () => {
    const character = makeCharacter()
    const condition = {
      ...createCondition(),
      afflictions: [{ id: 'afflict:fire', hazardType: 'fire', severity: 2, injuryType: 'deadly', roundsLeft: 2, sourceName: 'Fire' }],
    }
    assert.equal(characterHazardOverlayType(null, { x: 0, y: 0 }, character, condition), 'fire')
  })

  it('hides matching types when a suit grants immunity', () => {
    const map = {
      ...createBlankMap({ name: 'Overlay', width: 8, height: 8 }),
      hazards: [{ id: 'f', type: 'fire', tiles: { '2,2': 2 }, spreadChance: 0, dissipateChance: 0 }],
    }
    const environment = createEnvironment(map)
    const character = makeCharacter({ equipment: [{ itemId: 'thermalSuit' }] })
    assert.equal(characterHazardOverlayType(environment, { x: 2, y: 2 }, character, createCondition()), null)
  })

  it('hasCharacterHazardOverlay is true while on fire or afflicted', () => {
    const map = {
      ...createBlankMap({ name: 'Overlay', width: 8, height: 8 }),
      hazards: [{ id: 'f', type: 'fire', tiles: { '2,2': 2 }, spreadChance: 0, dissipateChance: 0 }],
    }
    const environment = createEnvironment(map)
    const character = makeCharacter()
    assert.equal(hasCharacterHazardOverlay(environment, { x: 2, y: 2 }, character, createCondition()), true)
    assert.equal(hasCharacterHazardOverlay(environment, { x: 0, y: 0 }, character, createCondition()), false)
    assert.equal(
      hasCharacterHazardOverlay(null, { x: 0, y: 0 }, character, {
        ...createCondition(),
        afflictions: [{ id: 'a', hazardType: 'smoke', severity: 1, injuryType: 'stun', roundsLeft: 1, sourceName: 'Smoke' }],
      }),
      true,
    )
  })

  it('holds the last overlay through fall / getUp when the live type clears', () => {
    assert.deepEqual(resolveHazardOverlayDisplay('fire', { holding: false, heldType: null }), { type: 'fire', held: 'fire' })
    assert.deepEqual(resolveHazardOverlayDisplay(null, { holding: true, heldType: 'fire' }), { type: 'fire', held: 'fire' })
    assert.deepEqual(resolveHazardOverlayDisplay(null, { holding: false, heldType: 'fire' }), { type: null, held: null })
    assert.deepEqual(resolveHazardOverlayDisplay('plasmaFire', { holding: true, heldType: 'fire' }), { type: 'plasmaFire', held: 'plasmaFire' })
  })
})
