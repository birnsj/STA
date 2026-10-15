import { Rectangle, Texture } from 'pixi.js'
import { loadImage } from '../canvasTiles.js'
import { textureOf } from './pixiDraw.js'

// The flipbook strips (environmentArt.js) cut into frame textures once per page and shared by every board and sprite:
// nothing here is made per frame or per tile. Presentation only.

const strips = new Map()

// The frame textures of a horizontal strip of `frames` equal frames: an array once loaded, null while loading or if
// the image failed (the caller draws nothing then). The first call starts the load.
export function stripFrames(href, frames) {
  let entry = strips.get(href)
  if (!entry) {
    entry = { textures: null }
    strips.set(href, entry)
    loadImage(href).then(async (image) => {
      if (!image) return
      // Decoded off the main thread now, not on the first frame that draws it.
      await image.decode?.().catch(() => {})
      const source = textureOf(image).source
      const width = image.naturalWidth / frames
      entry.textures = Array.from({ length: frames }, (_, i) => new Texture({ source, frame: new Rectangle(i * width, 0, width, image.naturalHeight) }))
    })
  }
  return entry.textures
}
