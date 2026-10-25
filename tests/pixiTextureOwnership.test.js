import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { destroyOwnedFrameTextures, destroyOwnedTokenChildren } from '../src/components/maps/pixi/figures.js'
import { destroyOwnedStackRecord } from '../src/components/maps/pixi/mapLayers.js'

const textureSpy = () => ({
  calls: [],
  destroy(destroySource) {
    this.calls.push(destroySource)
  },
})

describe('canvas texture ownership cleanup', () => {
  it('destroys a stack sprite and its exclusively owned canvas source', () => {
    const texture = textureSpy()
    const sprite = { calls: 0, destroy() { this.calls++ } }
    const record = { sprite, texture }
    destroyOwnedStackRecord(record)
    assert.equal(sprite.calls, 1)
    assert.deepEqual(texture.calls, [true])
    assert.equal(record.sprite, null)
    assert.equal(record.texture, null)
  })

  it('destroys cut-frame canvas sources but preserves shared whole-sheet sources', () => {
    const cut = textureSpy()
    const sharedView = textureSpy()
    const frames = new Map([
      ['cut', { texture: cut, ownsSource: true }],
      ['view', { texture: sharedView, ownsSource: false }],
    ])
    destroyOwnedFrameTextures(frames)
    assert.deepEqual(cut.calls, [true])
    assert.deepEqual(sharedView.calls, [false])
    assert.equal(frames.size, 0)
  })

  it('destroys portrait canvas sources without asking ordinary token children to destroy textures', () => {
    const portrait = textureSpy()
    const ownedChild = { texture: portrait, calls: [], destroy(options) { this.calls.push(options) } }
    const ordinaryChild = { texture: textureSpy(), calls: [], destroy(options) { this.calls.push(options) } }
    const token = { removeChildren: () => [ownedChild, ordinaryChild] }
    const owned = new Set([portrait])
    destroyOwnedTokenChildren(token, owned)
    assert.deepEqual(ownedChild.calls, [undefined])
    assert.deepEqual(ordinaryChild.calls, [true])
    assert.deepEqual(portrait.calls, [true])
    assert.equal(owned.size, 0)
  })
})
