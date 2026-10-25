import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { moveGroundItem, paintTile } from '../src/maps/mapEdits.js'
import {
  beginMapHistoryStroke,
  createMapHistory,
  editMapHistory,
  endMapHistoryStroke,
  redoMapHistory,
  undoMapHistory,
} from '../src/maps/mapHistory.js'
import {
  beginMapDocumentOperation,
  createMapDocumentGuard,
  isMapDocumentOperationCurrent,
  noteMapDocumentChange,
} from '../src/maps/mapDocumentGuard.js'

describe('map history', () => {
  it('undoes and redoes a single edit', () => {
    let history = createMapHistory(createBlankMap({ width: 4, height: 4 }))
    history = editMapHistory(history, paintTile(history.present, { x: 1, y: 1 }, 'bulkhead'))
    assert.equal(history.present.tiles[1][1], 'bulkhead')
    history = undoMapHistory(history)
    assert.equal(history.present.tiles[1][1], 'floor')
    history = redoMapHistory(history)
    assert.equal(history.present.tiles[1][1], 'bulkhead')
  })

  it('coalesces a stroke into one undo step', () => {
    let history = beginMapHistoryStroke(createMapHistory(createBlankMap({ width: 6, height: 6 })))
    history = editMapHistory(history, paintTile(history.present, { x: 1, y: 1 }, 'bulkhead'))
    history = editMapHistory(history, paintTile(history.present, { x: 2, y: 1 }, 'bulkhead'))
    history = editMapHistory(history, paintTile(history.present, { x: 3, y: 1 }, 'bulkhead'))
    history = endMapHistoryStroke(history)
    assert.equal(history.present.tiles[1][1], 'bulkhead')
    assert.equal(history.present.tiles[1][3], 'bulkhead')
    history = undoMapHistory(history)
    assert.equal(history.present.tiles[1][1], 'floor')
    assert.equal(history.present.tiles[1][3], 'floor')
    assert.equal(history.undoStack.length, 0)
  })

  it('undoes an atomic support-subtree movement as one edit', () => {
    const map = {
      ...createBlankMap({ width: 6, height: 6 }),
      groundItemPlacements: [
        { id: 'parent', itemId: 'medkit', position: { x: 1.25, y: 1.25 } },
        { id: 'child', itemId: 'hypospray', position: { x: 1.25, y: 1.25 }, on: { placement: 'parent' } },
      ],
    }
    let history = createMapHistory(map)
    history = editMapHistory(history, moveGroundItem(history.present, 'parent', { x: 3.25, y: 2.25 }))
    const movedPosition = history.present.groundItemPlacements[0].position
    assert.deepEqual(history.present.groundItemPlacements.map((entry) => entry.position), [
      movedPosition,
      movedPosition,
    ])
    history = undoMapHistory(history)
    assert.deepEqual(history.present.groundItemPlacements, map.groundItemPlacements)
  })
})

describe('map document async guard', () => {
  it('invalidates an operation when a newer edit occurs', () => {
    const guard = createMapDocumentGuard()
    const save = beginMapDocumentOperation(guard)
    assert.equal(isMapDocumentOperationCurrent(guard, save), true)
    noteMapDocumentChange(guard)
    assert.equal(isMapDocumentOperationCurrent(guard, save), false)
  })

  it('lets only the newest operation replace the document', () => {
    const guard = createMapDocumentGuard()
    const load = beginMapDocumentOperation(guard)
    const generate = beginMapDocumentOperation(guard)
    assert.equal(isMapDocumentOperationCurrent(guard, load), false)
    assert.equal(isMapDocumentOperationCurrent(guard, generate), true)
  })
})
