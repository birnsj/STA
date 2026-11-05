import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DESIGN_RESOLUTION } from '../src/settings/displaySettings.js'
import { editorStageSize } from '../src/maps/editorViewScale.js'

describe('editorViewScale', () => {
  it('keeps the design resolution at 100%', () => {
    assert.deepEqual(editorStageSize(100), DESIGN_RESOLUTION)
  })

  it('shrinks the design size as the percent rises so the on-screen UI grows', () => {
    const stage = editorStageSize(125)
    assert.equal(stage.width, Math.round(DESIGN_RESOLUTION.width / 1.25))
    assert.equal(stage.height, Math.round(DESIGN_RESOLUTION.height / 1.25))
    assert.ok(stage.width < DESIGN_RESOLUTION.width)
  })
})
