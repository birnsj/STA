// Alpha masks of the prop art, for the editor to pick a prop by the pixels it draws (maps/propPick.js).
// One mask per loaded picture, built the first time a click needs it from the picture's own pixels (a one-off read of the
// source art, not of the screen). Keyed on the image element, so a picture that is loaded again gets a fresh mask.
import { makeAlphaMask, setAlphaMaskSource } from '../../maps/propPick.js'
import { loadedImage, loadImage } from './canvasTiles.js'

const masks = new WeakMap()

function buildMask(image) {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (!width || !height) return null
  const canvas = Object.assign(document.createElement('canvas'), { width, height })
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0)
  return makeAlphaMask(width, height, context.getImageData(0, 0, width, height).data)
}

// href -> mask; undefined while the picture is still loading, null when it failed (nothing is drawn, so nothing to click).
export function alphaMaskFor(href) {
  if (!href) return null
  const image = loadedImage(href)
  if (image === undefined) {
    loadImage(href)
    return undefined
  }
  if (!image) return null
  if (!masks.has(image)) {
    try {
      masks.set(image, buildMask(image))
    } catch {
      // A picture the browser will not let us read: fall back to the sprite's box rather than make it unclickable.
      masks.set(image, undefined)
    }
  }
  return masks.get(image)
}

setAlphaMaskSource(alphaMaskFor)
