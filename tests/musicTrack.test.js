import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pickNext } from '../src/audio/musicTrack.js'

const FILES = ['explore01', 'explore02', 'explore03']

describe('music cue track choice', () => {
  it('reaches every file in the list', () => {
    const picked = new Set([0, 0.34, 0.67, 0.999].map((roll) => pickNext(FILES, null, () => roll)))
    assert.deepEqual([...picked].sort(), FILES)
  })

  it('never repeats the file that just played', () => {
    for (const last of FILES) {
      for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) assert.notEqual(pickNext(FILES, last, () => roll), last)
    }
  })

  it('still reaches every other file when it avoids the last one', () => {
    const others = new Set([0, 0.6].map((roll) => pickNext(FILES, 'explore02', () => roll)))
    assert.deepEqual([...others].sort(), ['explore01', 'explore03'])
  })

  it('a single file repeats itself', () => {
    assert.equal(pickNext(['menu01'], 'menu01', () => 0.5), 'menu01')
  })
})
