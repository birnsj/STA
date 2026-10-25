import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cueFiles, DEFAULT_CUE_FILES, emptyMusic, normalizeMusic, serializeMusic } from '../src/audio/musicCues.js'
import { createBlankMap, parseMapFile, serializeMap } from '../src/maps/mapFormat.js'

describe('episode music', () => {
  it('plays the defaults for a cue the episode leaves alone', () => {
    for (const name of ['intro', 'exploration', 'combat', 'outro']) {
      assert.deepEqual(cueFiles(name, null), DEFAULT_CUE_FILES[name])
      assert.deepEqual(cueFiles(name, emptyMusic()), DEFAULT_CUE_FILES[name])
    }
  })

  it('plays the files the episode names, one or several', () => {
    const music = { intro: 'epintro01', exploration: ['explore04'], combat: ['combat02', 'combat03'], outro: 'epoutro01' }
    assert.deepEqual(cueFiles('exploration', music), ['explore04'])
    assert.deepEqual(cueFiles('combat', music), ['combat02', 'combat03'])
    assert.deepEqual(cueFiles('intro', { intro: 'explore04' }), ['explore04'])
  })

  it('drops anything that is not a plain file name, and repeats', () => {
    assert.deepEqual(normalizeMusic({ intro: '../secret', exploration: ['explore01', 'explore01', 'a/b', 3], combat: 'combat01', outro: 5 }), {
      intro: null,
      exploration: ['explore01'],
      combat: [],
      outro: null,
    })
    assert.deepEqual(normalizeMusic(null), emptyMusic())
  })

  it('leaves music out of the map file when nothing is changed, and keeps only what was', () => {
    assert.equal(serializeMusic(emptyMusic()), undefined)
    assert.equal('music' in serializeMap(createBlankMap()), false)
    assert.deepEqual(serializeMusic({ intro: null, exploration: ['explore04'], combat: [], outro: 'epoutro01' }), { exploration: ['explore04'], outro: 'epoutro01' })
  })

  it('round-trips through a map file', () => {
    const map = createBlankMap({ name: 'Music Test' })
    map.music = { intro: 'epintro01', exploration: ['explore03', 'explore04'], combat: ['combat01'], outro: null }
    const saved = serializeMap(map)
    assert.deepEqual(saved.music, { intro: 'epintro01', exploration: ['explore03', 'explore04'], combat: ['combat01'] })
    assert.deepEqual(parseMapFile(saved, 'Music Test').music, map.music)
    assert.deepEqual(parseMapFile(serializeMap(createBlankMap()), 'x').music, emptyMusic())
  })
})
