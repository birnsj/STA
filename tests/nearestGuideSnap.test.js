import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { project } from '../src/maps/iso.js'
import { nearestGuideSnap } from '../src/components/maps/pixi/editorMarkers.js'

describe('nearestGuideSnap', () => {
  it('snaps to the nearest 32px guide intersection', () => {
    const board = project({ x: 3.2, y: 4.1 })
    assert.deepEqual(nearestGuideSnap(board, 32), { x: 3, y: 4 })
    const half = project({ x: 3.3, y: 4.4 })
    assert.deepEqual(nearestGuideSnap(half, 32), { x: 3.5, y: 4.5 })
  })

  it('uses tile-edge origin for 64px guides', () => {
    const board = project({ x: 1.1, y: 2.1 })
    assert.deepEqual(nearestGuideSnap(board, 64), { x: 1.5, y: 2.5 })
  })
})
