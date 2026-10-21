import { loadImage } from '../canvasTiles.js'
import { textureOf } from './pixiDraw.js'

// The flipbook strips (environmentArt.js) cut into frame textures once per page and shared by every board and sprite:
// nothing here is made per frame or per tile. Presentation only.

const strips = new Map()

// Copy one frame of a strip onto its own canvas, then make a texture from that. Avoids shared ImageSource / NPOT /
// mipmap edge cases that showed some strips (large explosions) as solid black quads on WebGL.
function frameTexture(image, index, frameWidth, frameHeight) {
  const canvas = document.createElement('canvas')
  canvas.width = frameWidth
  canvas.height = frameHeight
  canvas.getContext('2d').drawImage(image, index * frameWidth, 0, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight)
  return textureOf(canvas)
}

// The frame textures of a horizontal strip of `frames` equal frames: an array once loaded, null while loading or if
// the image failed (the caller draws nothing then). The first call starts the load.
export function stripFrames(href, frames) {
  let entry = strips.get(href)
  if (!entry) {
    entry = { textures: null }
    strips.set(href, entry)
    loadImage(href).then(async (image) => {
      if (!image?.naturalWidth) return
      // Decoded off the main thread now, not on the first frame that draws it.
      await image.decode?.().catch(() => {})
      const frameWidth = Math.floor(image.naturalWidth / frames)
      const frameHeight = image.naturalHeight
      if (frameWidth < 1 || frameHeight < 1) return
      entry.textures = Array.from({ length: frames }, (_, i) => frameTexture(image, i, frameWidth, frameHeight))
    })
  }
  return entry.textures
}

// Drop a cached strip so the next stripFrames call reloads it (e.g. after replacing the PNG).
export function clearStripFrames(href) {
  if (href) strips.delete(href)
  else strips.clear()
}
