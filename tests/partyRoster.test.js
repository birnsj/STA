// Party picker roster: saved characters plus authored playtest redshirts.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listPlaytestPartyIds } from '../src/character/authoredCharacters.js'
import { partyPickerRoster } from '../src/character/partyRoster.js'

describe('partyPickerRoster', () => {
  it('lists playtest redshirts when there are no saved characters', () => {
    const roster = partyPickerRoster([])
    const playtestIds = listPlaytestPartyIds()
    assert.ok(playtestIds.length >= 4)
    assert.equal(roster.length, playtestIds.length)
    playtestIds.forEach((id) => {
      const entry = roster.find((row) => row.id === id)
      assert.ok(entry?.character, id)
      assert.equal(entry.group, 'playtest')
    })
  })

  it('keeps saved characters first and appends redshirts', () => {
    const saved = [{ id: 'saved-1', name: 'Saved Officer', record: null }]
    // normalize of null record yields error / no character — still listed first by id.
    const roster = partyPickerRoster(saved)
    assert.equal(roster[0].id, 'saved-1')
    assert.equal(roster[0].group, 'saved')
    assert.ok(roster.some((entry) => entry.id === 'redshirtMallory' && entry.character))
  })

  it('does not list authored main cast officers', () => {
    const roster = partyPickerRoster([])
    ;['stationEngineer', 'sfSecurityReyes', 'sfEngineerChen', 'sfScienceVoss'].forEach((id) => {
      assert.ok(!roster.some((entry) => entry.id === id), id)
    })
  })
})
