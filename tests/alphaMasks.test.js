import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { BOUNDS_ALPHA_MASK } from '../src/maps/propPick.js'

const originalImage = globalThis.Image
const originalDocument = globalThis.document

before(() => {
  globalThis.Image = class {
    naturalWidth = 8
    naturalHeight = 6

    set src(value) {
      this.currentSrc = value
      this.onload()
    }
  }
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        drawImage() {},
        getImageData() {
          throw new Error('pixel read blocked')
        },
      }),
    }),
  }
})

after(() => {
  globalThis.Image = originalImage
  globalThis.document = originalDocument
})

test('an unreadable loaded image exposes the bounds fallback to the picker', async () => {
  const { alphaMaskFor } = await import('../src/components/maps/alphaMasks.js')
  assert.equal(alphaMaskFor('/unreadable.png'), undefined)
  assert.equal(alphaMaskFor('/unreadable.png'), BOUNDS_ALPHA_MASK)
})
