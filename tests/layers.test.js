// Editor layer classification (src/maps/layers.js) over the tile catalogue and selection kinds.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyTemplatePieceLayer,
  classifyTileLayer,
  LAYER_IDS,
  layerOfSelection,
  layerOfTemplatePiece,
  layerOfTile,
  selectionPriority,
} from '../src/maps/layers.js'
import { TILES, getTile } from '../src/maps/mapFormat.js'
import { getTemplatePiece, TEMPLATE_PIECES } from '../src/maps/templatePieces.js'

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

  it('prefers an explicit catalogue layer over heuristics', () => {
    const tile = { ...getTile('floor'), layer: 'furniture' }
    assert.equal(layerOfTile(tile), 'furniture')
  })

  it('ignores invalid layer values and falls back', () => {
    assert.equal(layerOfTile({ ...getTile('bulkhead'), layer: 'nope' }), 'walls')
    assert.equal(layerOfTile({ ...getTile('floor'), layer: '' }), 'ground')
    assert.equal(layerOfTile({ id: 'x', height: 0, wall: false }), 'ground')
  })
})

describe('classifyTileLayer', () => {
  it('keeps a valid existing layer and never invents unknown ids', () => {
    assert.equal(classifyTileLayer({ ...getTile('floor'), layer: 'markers' }), 'markers')
    for (const tile of TILES) {
      const layer = classifyTileLayer({ ...tile, layer: undefined })
      assert.ok(LAYER_IDS.includes(layer), `${tile.id} → ${layer}`)
    }
  })

  it('matches metadata anchors used for seeding', () => {
    assert.equal(classifyTileLayer({ ...getTile('null'), layer: undefined }), 'ground')
    assert.equal(classifyTileLayer({ ...getTile('floor'), layer: undefined }), 'ground')
    assert.equal(classifyTileLayer({ ...getTile('doorway'), layer: undefined }), 'ground')
    assert.equal(classifyTileLayer({ ...getTile('bulkhead'), layer: undefined }), 'walls')
    assert.equal(classifyTileLayer({ ...getTile('crate'), layer: undefined }), 'furniture')
    assert.equal(classifyTileLayer({ ...getTile('machinery'), layer: undefined }), 'furniture')
    assert.equal(classifyTileLayer({ ...getTile('grating'), layer: undefined }), 'furniture')
  })
})

describe('layerOfTemplatePiece', () => {
  it('classifies every catalogue Template Piece into a known layer', () => {
    for (const piece of TEMPLATE_PIECES) {
      const layer = layerOfTemplatePiece(piece)
      assert.ok(LAYER_IDS.includes(layer), `${piece.id} → ${layer}`)
    }
  })

  it('puts walls, floors and props on the matching layers', () => {
    assert.equal(layerOfTemplatePiece('tplStarshipWall32'), 'walls')
    assert.equal(layerOfTemplatePiece('tplStarshipFloor'), 'ground')
    assert.equal(layerOfTemplatePiece('tplStarshipCrate'), 'furniture')
    assert.equal(layerOfTemplatePiece('tplStarshipMachinery'), 'furniture')
  })

  it('prefers an explicit catalogue layer over heuristics', () => {
    const piece = { ...getTemplatePiece('tplStarshipFloor'), layer: 'furniture' }
    assert.equal(layerOfTemplatePiece(piece), 'furniture')
  })

  it('ignores invalid layer values and falls back', () => {
    assert.equal(layerOfTemplatePiece({ ...getTemplatePiece('tplStarshipWall32'), layer: 'nope' }), 'walls')
    assert.equal(layerOfTemplatePiece({ ...getTemplatePiece('tplStarshipFloor'), layer: '' }), 'ground')
  })
})

describe('classifyTemplatePieceLayer', () => {
  it('keeps a valid existing layer and never invents unknown ids', () => {
    assert.equal(classifyTemplatePieceLayer({ ...getTemplatePiece('tplStarshipFloor'), layer: 'markers' }), 'markers')
    for (const piece of TEMPLATE_PIECES) {
      const layer = classifyTemplatePieceLayer({ ...piece, layer: undefined })
      assert.ok(LAYER_IDS.includes(layer), `${piece.id} → ${layer}`)
    }
  })

  it('matches tag anchors used for seeding', () => {
    assert.equal(classifyTemplatePieceLayer({ ...getTemplatePiece('tplStarshipWall32'), layer: undefined }), 'walls')
    assert.equal(classifyTemplatePieceLayer({ ...getTemplatePiece('tplStarshipFloor'), layer: undefined }), 'ground')
    assert.equal(classifyTemplatePieceLayer({ ...getTemplatePiece('tplStarshipCrate'), layer: undefined }), 'furniture')
    assert.equal(classifyTemplatePieceLayer({ ...getTemplatePiece('tplStarshipMachinery'), layer: undefined }), 'furniture')
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
    assert.equal(layerOfSelection('templatePiece'), 'walls')
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
