// Joined railing pieces (maps/railJoins.js).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { joinedImage } from '../src/maps/railJoins.js'

// '=' is a railing, '.' the bridge deck.
const mapOf = (rows) => {
  const tiles = rows.map((row) => [...row].map((c) => (c === '=' ? 'tosRail' : 'tosDeck')))
  return { width: tiles[0].length, height: tiles.length, tiles }
}
const piece = (rows, x, y) => joinedImage(mapOf(rows), { x, y })?.match(/tosRail-(.*)\.png/)[1] ?? null

describe('railing joins', () => {
  it('a lone railing and other tiles are drawn plain', () => {
    assert.equal(piece(['...', '.=.', '...'], 1, 1), null)
    assert.equal(piece(['...', '.=.', '...'], 0, 0), null)
  })

  it('joins straight runs, ends and diagonal steps', () => {
    assert.equal(piece(['===', '...'], 1, 0), 'E-W')
    assert.equal(piece(['===', '...'], 0, 0), 'E')
    assert.equal(piece(['=..', '.=.', '..='], 1, 1), 'SE-NW')
    assert.equal(piece(['==.', '..='], 1, 0), 'SE-W')
  })

  it('a corner step joins through the edge, not as a triangle', () => {
    assert.equal(piece(['==', '.='], 0, 0), 'E')
    assert.equal(piece(['==', '.='], 1, 0), 'S-W')
  })
})
