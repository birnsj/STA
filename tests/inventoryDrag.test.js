import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { project } from '../src/maps/iso.js'
import { worldGrabOffset } from '../src/components/exploration/inventoryDrag.js'

describe('world drag grab offset', () => {
  it('keeps the sprite foot the same distance from the pointer that it had when grabbed', () => {
    const toClient = (x, y) => ({ x: x * 2 + 10, y: y * 2 + 20 })
    const ground = { position: { x: 2, y: 3 } }
    const z = 16
    const tip = project(ground.position)
    const foot = toClient(tip.x, tip.y - z)
    const pointer = { x: foot.x + 4, y: foot.y - 12 }
    const grab = worldGrabOffset(ground, z, pointer.x, pointer.y, toClient)
    assert.deepEqual(grab, { x: -4, y: 12 })
    const later = { x: pointer.x + 30, y: pointer.y - 8 }
    assert.deepEqual(
      { x: later.x + grab.x, y: later.y + grab.y },
      { x: foot.x + 30, y: foot.y - 8 },
    )
  })

  it('waits until the board can project the foot', () => {
    assert.equal(worldGrabOffset({ position: { x: 1, y: 1 } }, 0, 0, 0, null), null)
    assert.equal(worldGrabOffset(null, 0, 0, 0, () => ({ x: 0, y: 0 })), null)
  })
})