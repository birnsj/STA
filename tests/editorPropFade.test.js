import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BOUNDS_ALPHA_MASK, editorPropFadeIds, setAlphaMaskSource, spriteGeometry } from '../src/maps/propPick.js'
import { project } from '../src/maps/iso.js'

describe('editorPropFadeIds', () => {
  const front = {
    id: 'wall-front',
    position: { x: 4, y: 4 },
    depth: 8,
    spriteSize: { width: 64, height: 96 },
    spriteAnchorX: 32,
    worldImage: '/art/test.png',
  }
  const back = {
    id: 'wall-back',
    position: { x: 2, y: 2 },
    depth: 4,
    spriteSize: { width: 64, height: 96 },
    spriteAnchorX: 32,
    worldImage: '/art/test.png',
  }

  it('fades the prop under the board pointer', () => {
    setAlphaMaskSource(() => BOUNDS_ALPHA_MASK)
    const { anchor } = spriteGeometry(front)
    // A little above the south tip so the pick sits inside the sprite box, not on the edge.
    const faded = editorPropFadeIds([back, front], { boardPoint: { x: anchor.x, y: anchor.y - 8 } })
    assert.ok(faded.has('wall-front'))
    assert.equal(faded.has('wall-back'), false)
  })

  it('fades props in front of a placement ghost whose sprite overlaps them', () => {
    setAlphaMaskSource(() => BOUNDS_ALPHA_MASK)
    const ghost = {
      id: '__ghost',
      position: { x: 3.5, y: 3.5 },
      depth: 1000,
      spriteSize: { width: 64, height: 96 },
      spriteAnchorX: 32,
      worldImage: '/art/ghost.png',
    }
    const faded = editorPropFadeIds([back, front, ghost], { ghost })
    assert.ok(faded.has('wall-front'), 'front wall should cut away for a ghost behind it')
    assert.equal(faded.has('wall-back'), false)
    assert.equal(faded.has('__ghost'), false)
  })

  it('fades a front wall when the ghost tip sits behind it even if boxes barely touch', () => {
    setAlphaMaskSource(() => BOUNDS_ALPHA_MASK)
    const wall = {
      id: 'wall',
      position: { x: 5, y: 3 },
      depth: 8,
      spriteSize: { width: 48, height: 116 },
      spriteAnchorX: 32,
      worldImage: '/art/wall.png',
    }
    const ghost = {
      id: '__ghost',
      position: { x: 4.2, y: 2.8 },
      depth: 1000,
      spriteSize: { width: 64, height: 80 },
      spriteAnchorX: 32,
      worldImage: '/art/crate.png',
    }
    const faded = editorPropFadeIds([wall, ghost], { ghost })
    assert.ok(faded.has('wall'))
  })

  it('does not fade when the pointer is clear of every prop', () => {
    const clear = project({ x: 0, y: 0 })
    const faded = editorPropFadeIds([front], { boardPoint: clear })
    assert.equal(faded.size, 0)
  })
})
