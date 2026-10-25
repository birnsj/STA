// Catalogue description is the only player-facing text for an item. Placements may rename a drop;
// they do not carry a description, and a scan reads the same catalogue string the hover view does.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { groundItemInfo } from '../src/components/exploration/explorationRings.js'
import { getItemById } from '../src/rules/equipment.js'
import { groundItemViews } from '../src/rules/inventory.js'
import { GroundItem } from '../src/world/GroundItem.js'

const SAMPLES = ['standardUniform', 'communicator', 'standardTricorder', 'phaserType1', 'medkit', 'hyperspanner', 'calFoot8Red']

function dropped(itemId, name) {
  return {
    party: {
      map: { width: 4, height: 4, tiles: Array.from({ length: 4 }, () => Array(4).fill('floor')) },
      members: { alpha: { id: 'alpha', character: { name: 'Alpha' } } },
    },
    itemInstances: { 'item-9': { id: 'item-9', itemId, quantity: 1 } },
    groundItems: {
      'item-9': { instanceId: 'item-9', position: { x: 1, y: 1 }, name },
    },
  }
}

describe('item description resolution', () => {
  it('uses the catalogue description for a renamed drop that stores none of its own', () => {
    for (const itemId of SAMPLES) {
      const catalogue = getItemById(itemId).description
      const state = dropped(itemId, 'Renamed drop')
      assert.equal('description' in state.groundItems['item-9'], false, itemId)
      assert.equal('description' in state.itemInstances['item-9'], false, itemId)
      assert.equal(groundItemViews(state)[0].description, catalogue, itemId)
      const view = new GroundItem('item-9').view(state)
      assert.equal(view.name, 'Renamed drop', itemId)
      assert.equal(view.description, catalogue, itemId)
      const hidden = groundItemInfo(state, 'item-9')
      assert.equal(hidden.title, 'Renamed drop', itemId)
      assert.equal(hidden.tips.includes(catalogue), false, itemId)
      const scanned = groundItemInfo({ ...state, objectScans: { 'item-9': { success: true, memberId: 'alpha' } } }, 'item-9')
      assert.equal(scanned.title, 'Renamed drop', itemId)
      assert.equal(scanned.tips.includes(catalogue), true, itemId)
    }
  })

  it('follows an in-memory catalogue edit without a per-instance copy', () => {
    const item = getItemById('medkit')
    const original = item.description
    const state = dropped('medkit', 'Field kit')
    item.description = 'Edited catalogue text.'
    try {
      assert.equal(groundItemViews(state)[0].description, 'Edited catalogue text.')
      assert.equal(new GroundItem('item-9').view(state).description, 'Edited catalogue text.')
      const card = groundItemInfo({ ...state, objectScans: { 'item-9': { success: true, memberId: 'alpha' } } }, 'item-9')
      assert.equal(card.title, 'Field kit')
      assert.ok(card.tips.includes('Edited catalogue text.'))
      assert.equal(card.tips.includes(original), false)
    } finally {
      item.description = original
    }
  })
})
