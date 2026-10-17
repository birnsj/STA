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
    assert.equal(normalizeDisplaySettings({}).missionIntro, true)
    assert.equal(normalizeDisplaySettings({ missionIntro: false }).missionIntro, false)
  })

  it('older saves without the outro setting get it on; a saved off stays off', () => {
    assert.equal(normalizeDisplaySettings({ missionIntro: false }).missionOutro, true)
    assert.equal(normalizeDisplaySettings({ missionOutro: false }).missionOutro, false)
    assert.equal(normalizeDisplaySettings({ missionOutro: 'no' }).missionOutro, true)
  })

  it('older saves without the Tooltips setting get them on; a saved off stays off', () => {
    assert.equal(normalizeDisplaySettings({ helpHints: false }).tooltips, true)
    assert.equal(normalizeDisplaySettings({ tooltips: false }).tooltips, false)
    assert.equal(normalizeDisplaySettings({ tooltips: 'no' }).tooltips, true)
  })

  it('older saves without Camera Follow get it on; a saved off stays off', () => {
    assert.equal(normalizeDisplaySettings({ tooltips: false }).cameraFollow, true)
    assert.equal(normalizeDisplaySettings({ cameraFollow: false }).cameraFollow, false)
    assert.equal(normalizeDisplaySettings({ cameraFollow: 'no' }).cameraFollow, true)
  })

  it('older saves without WASD After Glide get 100; a saved value is clamped 0–100', () => {
    assert.equal(normalizeDisplaySettings({ cameraFollow: false }).wasdCoast, 100)
    assert.equal(normalizeDisplaySettings({ wasdCoast: 0 }).wasdCoast, 0)
    assert.equal(normalizeDisplaySettings({ wasdCoast: 40 }).wasdCoast, 40)
    assert.equal(normalizeDisplaySettings({ wasdCoast: 150 }).wasdCoast, 100)
    assert.equal(normalizeDisplaySettings({ wasdCoast: -5 }).wasdCoast, 0)
    assert.equal(normalizeDisplaySettings({ wasdCoast: 'no' }).wasdCoast, 100)
  })

  it('older saves without Party / Enemy AI get Classic; a known id is kept', () => {
    assert.equal(normalizeDisplaySettings({ wasdCoast: 40 }).partyAI, 'classic')
    assert.equal(normalizeDisplaySettings({}).enemyAI, 'classic')
    assert.equal(normalizeDisplaySettings({ partyAI: 'planner', enemyAI: 'squad' }).partyAI, 'planner')
    assert.equal(normalizeDisplaySettings({ partyAI: 'planner', enemyAI: 'squad' }).enemyAI, 'squad')
    assert.equal(normalizeDisplaySettings({ partyAI: 'nope' }).partyAI, 'classic')
    assert.equal(normalizeDisplaySettings({ enemyAI: 'nope' }).enemyAI, 'classic')
  })
})
