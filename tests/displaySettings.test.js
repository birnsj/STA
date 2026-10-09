// Display settings repair (settings/displaySettings.js): saved values from older versions or hand edits.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_DISPLAY_SETTINGS, normalizeDisplaySettings } from '../src/settings/displaySettings.js'

describe('display settings', () => {
  it('older saves without Help Hints get it on', () => {
    assert.equal(normalizeDisplaySettings({ scaleMode: 'fit', guideHighlight: false }).helpHints, true)
    assert.deepEqual(normalizeDisplaySettings(null), DEFAULT_DISPLAY_SETTINGS)
  })

  it('a saved Help Hints off stays off; anything that is not true or false is the default', () => {
    assert.equal(normalizeDisplaySettings({ helpHints: false }).helpHints, false)
    assert.equal(normalizeDisplaySettings({ helpHints: 'no' }).helpHints, true)
    assert.equal(normalizeDisplaySettings({ helpHints: false }).guideHighlight, true)
  })
})
