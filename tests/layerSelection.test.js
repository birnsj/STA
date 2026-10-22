// Layer-aware selection candidates and floor erase blocking.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canEditLayer, defaultLayerState } from '../src/maps/layers.js'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { paintTile, placeNpc, selectionCandidates, toggleMarker } from '../src/maps/mapEdits.js'

describe('selectionCandidates', () => {
  it('lists NPC, spawn and tile candidates on one cell', () => {
    let map = createBlankMap({ width: 6, height: 6 })
    map = paintTile(map, { x: 2, y: 2 }, 'floor')
    map = toggleMarker(map, 'playerStarts', { x: 2, y: 2 })
    map = placeNpc(map, { x: 2, y: 2 }, 'redshirt').map
    const candidates = selectionCandidates(map, [], { x: 2, y: 2 })
    const kinds = candidates.map((entry) => entry.kind)
    assert.ok(kinds.includes('npc'))
    assert.ok(kinds.includes('playerStarts'))
    assert.ok(kinds.includes('tile'))
  })
})

describe('canEditLayer', () => {
  it('rejects hidden or locked layers', () => {
    const layers = defaultLayerState()
    assert.equal(canEditLayer(layers, 'ground'), true)
    layers.visible.ground = false
    assert.equal(canEditLayer(layers, 'ground'), false)
    layers.visible.ground = true
    layers.locked.ground = true
    assert.equal(canEditLayer(layers, 'ground'), false)
  })
})
