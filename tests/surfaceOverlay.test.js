// Editor overlay: which tops are drawn when Placement surfaces is on.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankMap } from '../src/maps/mapFormat.js'
import { diamond, footprintDiamond } from '../src/maps/iso.js'
import { surfaceOfItem } from '../src/rules/placement.js'
import { surfaceOverlayMarks } from '../src/maps/surfaceOverlay.js'

function mapWith(tiles, extra = {}) {
  const map = createBlankMap({ name: 'Surfaces', width: tiles[0].length, height: tiles.length })
  return { ...map, tiles, ...extra }
}

describe('placement surface overlay', () => {
  it('marks a support top and skips plain floor', () => {
    const map = mapWith([
      ['floor', 'crate'],
      ['floor', 'floor'],
    ])
    const marks = surfaceOverlayMarks(map)
    assert.deepEqual(
      marks.map((mark) => mark.id),
      ['tile:1,0'],
    )
    const crate = marks[0]
    assert.equal(crate.kind, 'tile')
    const flat = diamond({ x: 1, y: 0 }, 0, 0.9)
    assert.equal(flat[0][1] - crate.points[0][1], 16)
  })

  it('lifts a stacked prop by the heights under it', () => {
    const map = mapWith(
      [
        ['floor', 'crate'],
        ['floor', 'floor'],
      ],
      { stackOver: { '1,0': ['crate'] } },
    )
    const mark = surfaceOverlayMarks(map).find((entry) => entry.id === 'tile:1,0')
    const flat = diamond({ x: 1, y: 0 }, 0, 0.9)
    assert.equal(flat[0][1] - mark.points[0][1], 32)
  })

  it('uses the tile inset for the footprint', () => {
    const map = mapWith([['calTable']])
    const [mark] = surfaceOverlayMarks(map)
    const full = diamond({ x: 0, y: 0 }, 16, 1)
    const drawn = diamond({ x: 0, y: 0 }, 16, 0.76)
    assert.ok(Math.abs(mark.points[1][0] - mark.points[3][0]) < Math.abs(full[1][0] - full[3][0]))
    assert.equal(mark.points[1][0], drawn[1][0])
  })

  it('marks an item top above the support it rests on', () => {
    const surface = surfaceOfItem('calFoot8Red')
    const map = mapWith([['crate']], {
      groundItemPlacements: [{ id: 'box', itemId: 'calFoot8Red', position: { x: 0, y: 0 } }],
    })
    const marks = surfaceOverlayMarks(map)
    const item = marks.find((entry) => entry.id === 'item:box')
    assert.ok(item)
    assert.equal(item.kind, 'item')
    const onFloor = footprintDiamond({ x: 0, y: 0 }, surface.footprint, surface.topZ)
    assert.equal(onFloor[0][1] - item.points[0][1], 16)
  })
})
