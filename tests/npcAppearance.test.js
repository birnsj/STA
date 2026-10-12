import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getAuthoredCharacter } from '../src/character/authoredCharacters.js'
import { assignNpcAppearances, npcPortraitOptions } from '../src/character/npcAppearance.js'
import { createBlankMap, parseMapFile, serializeMap } from '../src/maps/mapFormat.js'
import { getPortraitLayers } from '../src/rules/appearance.js'

const klingon = (key, extra = {}) => ({ key, characterId: 'klingonWarrior1', gender: null, portraitId: null, ...extra })

describe('NPC portraits and gender', () => {
  it('offers Klingon portraits of both genders, and none for species without NPC portraits', () => {
    const genders = new Set(npcPortraitOptions('klingonWarrior1').map((portrait) => portrait.gender))
    assert.deepEqual([...genders].sort(), ['female', 'male'])
    assert.ok(npcPortraitOptions('klingonWarrior1', 'female').every((portrait) => portrait.gender === 'female'))
    assert.deepEqual(npcPortraitOptions('stationEngineer'), [])
    assert.deepEqual(assignNpcAppearances([{ key: 'a', characterId: 'stationEngineer', gender: null, portraitId: null }]), [null])
  })

  it('a chosen portrait wins and brings its gender', () => {
    const [shown] = assignNpcAppearances([klingon('a', { portraitId: 'klingon-female-3' })])
    assert.equal(shown.genderId, 'female')
    assert.equal(shown.portraitId, 'klingon-female-3')
  })

  it('each Klingon gets one of the six Klingon backdrops, stable and spread across the map', () => {
    const crowd = Array.from({ length: 6 }, (_, index) => klingon(`npc${index + 1}`))
    const first = assignNpcAppearances(crowd).map((entry) => entry.backdropId)
    assert.deepEqual(assignNpcAppearances(crowd).map((entry) => entry.backdropId), first)
    assert.equal(new Set(first).size, 6)
    assert.ok(first.every((id) => id.startsWith('klingon-')))
    const character = getAuthoredCharacter('klingonWarrior1', { appearance: { genderId: 'male', portraitId: 'klingon-male-1', backdropId: 'klingon-great-hall' } })
    assert.equal(character.portrait.backdrop, '/art/portraits/enemy/background/klingon-great-hall.png')
    assert.deepEqual(getPortraitLayers(character.portrait.image), [{ role: 'character', src: character.portrait.image }])
  })

  it('Auto keeps a chosen gender, is stable, and avoids repeating faces', () => {
    const [shown] = assignNpcAppearances([klingon('a', { gender: 'male' })])
    assert.equal(shown.genderId, 'male')
    assert.ok(shown.portraitId.startsWith('klingon-male-'))
    const crowd = Array.from({ length: 9 }, (_, index) => klingon(`npc${index + 1}`))
    const first = assignNpcAppearances(crowd)
    assert.deepEqual(assignNpcAppearances(crowd), first)
    assert.equal(new Set(first.map((entry) => entry.portraitId)).size, 9)
  })

  it('dresses the runtime character: portrait, map sprite and pronouns follow the gender', () => {
    const character = getAuthoredCharacter('klingonWarrior1', { appearance: { genderId: 'female', portraitId: 'klingon-female-1' } })
    assert.equal(character.portrait.id, 'klingon-female-1')
    assert.equal(character.portrait.image, '/art/portraits/enemy/klingon-female-1.png')
    assert.equal(character.portrait.spriteSet, 'klingon-female')
    assert.equal(character.pronouns, 'She / her')
    const male = getAuthoredCharacter('klingonWarrior1', { appearance: { genderId: 'male', portraitId: 'klingon-male-2' } })
    assert.equal(male.portrait.spriteSet, 'klingon-male')
    assert.equal(male.pronouns, 'He / him')
  })

  it('map files keep a chosen gender and portrait, and leave Auto out', () => {
    const map = createBlankMap({ name: 'Portrait Room', width: 6, height: 6 })
    const base = { id: 'npc1', characterId: 'klingonWarrior1', name: null, position: { x: 2, y: 2 }, facing: 90, mustSurvive: false }
    map.npcs = [
      { ...base, gender: 'female', portraitId: 'klingon-female-2' },
      { ...base, id: 'npc2', position: { x: 3, y: 3 }, gender: null, portraitId: null },
    ]
    const file = serializeMap(map)
    assert.equal(file.npcs[0].gender, 'female')
    assert.equal(file.npcs[0].portraitId, 'klingon-female-2')
    assert.ok(!('gender' in file.npcs[1]) && !('portraitId' in file.npcs[1]))
    const loaded = parseMapFile(file, 'Portrait Room')
    assert.equal(loaded.npcs[0].portraitId, 'klingon-female-2')
    assert.ok(!('gender' in loaded.npcs[1]) && !('portraitId' in loaded.npcs[1]))
  })
})
