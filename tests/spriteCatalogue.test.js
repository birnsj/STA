import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  categorizeSpriteEntries,
  characterSpriteMeta,
  expectedSpriteSize,
  filterSpriteEntries,
  groupSpriteEntries,
  knownCharacterSpriteEntries,
} from '../src/rules/spriteCatalogue.js'

describe('spriteCatalogue', () => {
  it('resolves character sheet paths to set and sheet ids', () => {
    const meta = characterSpriteMeta('/art/sprites/characters/human/male/human-male-combat.png')
    assert.equal(meta?.setId, 'human-male')
    assert.equal(meta?.sheetId, 'combat')
    assert.equal(meta?.isMask, false)
    assert.ok(meta.grid.width > 0)
    assert.ok(meta.grid.height > 0)
  })

  it('resolves uniform masks', () => {
    const meta = characterSpriteMeta('/art/sprites/characters/human/female/human-female-uniform.png')
    assert.equal(meta?.setId, 'human-female')
    assert.equal(meta?.sheetId, 'base')
    assert.equal(meta?.isMask, true)
  })

  it('lists known character entries and groups them', () => {
    const entries = knownCharacterSpriteEntries()
    assert.ok(entries.length > 20)
    assert.ok(entries.every((entry) => entry.path.startsWith('/art/sprites/characters/')))
    const groups = groupSpriteEntries(entries)
    assert.equal(groups[0].id, 'characters')
    const filtered = filterSpriteEntries(entries, 'klingon-male-fall')
    assert.ok(filtered.some((entry) => entry.path.includes('klingon-male-fall')))
  })

  it('categorizes character sheets into species subgroups', () => {
    const entries = knownCharacterSpriteEntries()
    const categories = categorizeSpriteEntries(entries)
    assert.equal(categories[0].id, 'characters')
    const human = categories[0].subgroups.find((subgroup) => subgroup.folder === 'human')
    assert.ok(human)
    assert.ok(human.entries.every((entry) => entry.path.includes('/characters/human/')))
  })

  it('reports expected pixel size for character sheets', () => {
    const size = expectedSpriteSize('/art/sprites/characters/vulcan/male/vulcan-male.png')
    assert.deepEqual(
      { width: size.width, height: size.height },
      { width: size.columns * size.frame.width * size.resolution, height: size.rows * size.frame.height * size.resolution },
    )
  })
})
