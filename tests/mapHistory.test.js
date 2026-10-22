// Document undo/redo helpers are exercised through edit semantics used by useMapDocument.
// Pure snapshot-stack behaviour mirrored here so the rules stay testable without React.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { paintTile } from '../src/maps/mapEdits.js'

function historyMachine(initial) {
  let map = initial
  let undo = []
  let redo = []
  let stroke = null
  const HISTORY_LIMIT = 100
  return {
    get map() {
      return map
    },
    get canUndo() {
      return undo.length > 0
    },
    get canRedo() {
      return redo.length > 0
    },
    beginStroke() {
      if (!stroke) stroke = { before: map, pushed: false }
    },
    endStroke() {
      stroke = null
    },
    edit(next) {
      if (next === map) return
      if (stroke) {
        if (!stroke.pushed) {
          undo = [...undo.slice(-(HISTORY_LIMIT - 1)), stroke.before]
          stroke.pushed = true
          redo = []
        }
      } else {
        undo = [...undo.slice(-(HISTORY_LIMIT - 1)), map]
        redo = []
      }
      map = next
    },
    undo() {
      if (!undo.length) return
      const previous = undo[undo.length - 1]
      undo = undo.slice(0, -1)
      redo = [...redo, map]
      map = previous
      stroke = null
    },
    redo() {
      if (!redo.length) return
      const next = redo[redo.length - 1]
      redo = redo.slice(0, -1)
      undo = [...undo, map]
      map = next
      stroke = null
    },
  }
}

describe('map history', () => {
  it('undoes and redoes a single edit', () => {
    const h = historyMachine(createBlankMap({ width: 4, height: 4 }))
    h.edit(paintTile(h.map, { x: 1, y: 1 }, 'bulkhead'))
    assert.equal(h.map.tiles[1][1], 'bulkhead')
    h.undo()
    assert.equal(h.map.tiles[1][1], 'floor')
    h.redo()
    assert.equal(h.map.tiles[1][1], 'bulkhead')
  })

  it('coalesces a stroke into one undo step', () => {
    const h = historyMachine(createBlankMap({ width: 6, height: 6 }))
    h.beginStroke()
    h.edit(paintTile(h.map, { x: 1, y: 1 }, 'bulkhead'))
    h.edit(paintTile(h.map, { x: 2, y: 1 }, 'bulkhead'))
    h.edit(paintTile(h.map, { x: 3, y: 1 }, 'bulkhead'))
    h.endStroke()
    assert.equal(h.map.tiles[1][1], 'bulkhead')
    assert.equal(h.map.tiles[1][3], 'bulkhead')
    h.undo()
    assert.equal(h.map.tiles[1][1], 'floor')
    assert.equal(h.map.tiles[1][3], 'floor')
    assert.equal(h.canUndo, false)
  })
})
