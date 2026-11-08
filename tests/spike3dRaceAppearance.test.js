import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nearestDivisionId, parseHex, uniformTextureUrl, UNIFORM_DIVISION_IDS } from '../src/spike3d/uniformTextures.js'
import { resolveRaceMeshId, raceModelPath, skinColourFor, RACE_MESH_SPECIES } from '../src/spike3d/raceMeshes/index.js'
import { resolveSpike3dAppearance, genderPreset } from '../src/spike3d/appearance.js'

describe('spike3d uniform textures', () => {
  it('lists the three Starfleet divisions', () => {
    assert.deepEqual(UNIFORM_DIVISION_IDS, ['command', 'operations', 'sciences'])
  })

  it('maps division colours to the matching texture id', () => {
    assert.equal(nearestDivisionId('#c9a227'), 'command')
    assert.equal(nearestDivisionId('#b3262c'), 'operations')
    assert.equal(nearestDivisionId('#2d6fb3'), 'sciences')
    assert.equal(nearestDivisionId(0xc9a227), 'command')
  })

  it('builds stable uniform texture URLs', () => {
    assert.equal(uniformTextureUrl('command'), '/art/models/characters/shared/uniform-command.png')
    assert.equal(parseHex('#c9a227'), 0xc9a227)
  })
})

describe('spike3d race meshes', () => {
  it('keeps humans / mixed / newSpecies on the human mesh', () => {
    assert.equal(resolveRaceMeshId('human'), 'human')
    assert.equal(resolveRaceMeshId('mixedHeritage'), 'human')
    assert.equal(resolveRaceMeshId('newSpecies'), 'human')
    assert.equal(raceModelPath('human', 'male'), null)
  })

  it('maps romulan to vulcan kit and exposes model paths for other races', () => {
    assert.equal(resolveRaceMeshId('romulan'), 'vulcan')
    assert.ok(RACE_MESH_SPECIES.includes('caitian'))
    assert.equal(raceModelPath('andorian', 'female'), '/art/models/characters/andorian-female.glb')
    assert.equal(skinColourFor('andorian'), '#6a9ec9')
  })
})

describe('spike3d appearance resolve', () => {
  it('resolves gender presets and species from portrait-like ids', () => {
    const female = genderPreset('female')
    assert.ok(female.hip > female.shoulder)
    const app = resolveSpike3dAppearance({
      portraitId: 'vulcan-female-1',
      uniform: '#2d6fb3',
    })
    assert.equal(app.species, 'vulcan')
    assert.equal(app.gender, 'female')
    assert.equal(app.klingonArmour, false)
    assert.equal(app.uniform, '#2d6fb3')
  })

  it('resolves species from sprite-set ids (Sprite Showcase passes these)', () => {
    const app = resolveSpike3dAppearance({ portraitId: 'andorian-male' })
    assert.equal(app.species, 'andorian')
    assert.equal(app.gender, 'male')
    const caitian = resolveSpike3dAppearance({ portraitId: 'caitian-female' })
    assert.equal(caitian.species, 'caitian')
    assert.equal(caitian.gender, 'female')
  })

  it('marks Klingons for armour (no division tunic)', () => {
    const app = resolveSpike3dAppearance({ portraitId: 'klingon-warrior-1', enemy: true })
    assert.equal(app.species, 'klingon')
    assert.equal(app.klingonArmour, true)
    assert.equal(app.uniform, null)
  })
})
