// Editor layer classification (src/maps/layers.js) over the tile catalogue and selection kinds.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LAYER_IDS, layerOfSelection, layerOfTile, selectionPriority } from '../src/maps/layers.js'
import { TILES } from '../src/maps/mapFormat.js'

describe('layerOfTile', () => {
  it('classifies every catalogue tile into a known layer', () => {
    for (const tile of TILES) {
      const layer = layerOfTile(tile)
      assert.ok(LAYER_IDS.includes(layer), `${tile.id} → ${layer}`)
    }
  })

  it('puts Null and floors on ground, walls on walls, props on furniture', () => {
    assert.equal(layerOfTile('null'), 'ground')
    assert.equal(layerOfTile('floor'), 'ground')
    assert.equal(layerOfTile('doorway'), 'ground')
    assert.equal(layerOfTile('bulkhead'), 'walls')
    assert.equal(layerOfTile('halfBulkhead'), 'walls')
    assert.equal(layerOfTile('crate'), 'furniture')
    assert.equal(layerOfTile('machinery'), 'furniture')
    assert.equal(layerOfTile('dsEpsConduit'), 'furniture')
    assert.equal(layerOfTile('grating'), 'furniture')
    assert.equal(layerOfTile('water'), 'ground')
  })
})

describe('layerOfSelection', () => {
  it('maps entity kinds to layers', () => {
    assert.equal(layerOfSelection('npc'), 'characters')
    assert.equal(layerOfSelection('playerStarts'), 'characters')
    assert.equal(layerOfSelection('enemySpawns'), 'characters')
    assert.equal(layerOfSelection('destructible'), 'furniture')
    assert.equal(layerOfSelection('object'), 'furniture')
    assert.equal(layerOfSelection('groundItem'), 'furniture')
    assert.equal(layerOfSelection('hazard'), 'furniture')
    assert.equal(layerOfSelection('area'), 'markers')
    assert.equal(layerOfSelection('objective'), 'markers')
    assert.equal(layerOfSelection('wall'), 'walls')
  })
})

describe('selectionPriority', () => {
  it('puts the active layer first', () => {
    assert.deepEqual(selectionPriority('markers')[0], 'markers')
    assert.deepEqual(selectionPriority('walls')[0], 'walls')
  })
})
