// Plain tooltip text as the creator's info box (components/titleTipContent.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { titleTipContent } from '../src/components/titleTipContent.js'

describe('title tip content', () => {
  it('a short line is the title alone', () => {
    assert.deepEqual(titleTipContent('Pause'), { title: 'Pause' })
  })
  it('more lines: the first is the title, the rest the text', () => {
    assert.deepEqual(titleTipContent('Fire\nTN 12\n Severity 3 '), { title: 'Fire', text: 'TN 12\nSeverity 3' })
  })
  it('a one-line "Name: description" splits at the colon', () => {
    assert.deepEqual(titleTipContent('Guarded: attacks against them +1 Difficulty'), { title: 'Guarded', text: 'attacks against them +1 Difficulty' })
  })
  it("a toggle's On:/Off: description is not split", () => {
    const line = 'Off: enemies stand on their spawns and never notice the away team or start a fight.'
    assert.deepEqual(titleTipContent(line), { title: null, text: line })
  })
  it('a long sentence is text only', () => {
    const line = 'Follow the lead character with the camera as they move around the map'
    assert.deepEqual(titleTipContent(line), { title: null, text: line })
  })
  it('nothing to show is null', () => {
    assert.equal(titleTipContent('  \n '), null)
    assert.equal(titleTipContent(undefined), null)
  })
})
