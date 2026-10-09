import { useEffect, useState } from 'react'
import { getPortraitLayers } from '../rules/appearance.js'
import { getMockShirtArt } from '../rules/uniform.js'

const toRgb = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))
const shade = (rgb, factor) => rgb.map((channel) => Math.round(channel * factor))

// Swaps the mock art's flat shirt colours (also where the name label darkens them) for `colour`, in place.
// RGBA pixel data, as from a canvas. Other pixels (skin, hair, background, insignia) are left alone.
export function recolourShirtPixels(pixels, colour, { shirtColours, labelShade, tolerance } = getMockShirtArt()) {
  const target = toRgb(colour)
  const swaps = shirtColours
    .map(toRgb)
    .filter((source) => source.some((channel, index) => channel !== target[index]))
    .flatMap((source) => [
      { from: source, to: target },
      { from: shade(source, labelShade), to: shade(target, labelShade) },
    ])
  if (!swaps.length) return pixels
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index]
    const g = pixels[index + 1]
    const b = pixels[index + 2]
    const swap = swaps.find(
      ({ from }) => Math.abs(r - from[0]) <= tolerance && Math.abs(g - from[1]) <= tolerance && Math.abs(b - from[2]) <= tolerance,
    )
    if (swap) {
      pixels[index] = swap.to[0]
      pixels[index + 1] = swap.to[1]
      pixels[index + 2] = swap.to[2]
    }
  }
  return pixels
}

function loadImage(src) {
  const image = new Image()
  image.src = src
  return image.decode().then(() => image)
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

const toUrl = (canvas) => new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject()), 'image/png'))

// A greyscale uniform layer multiplied by `colour`, keeping its shading and its own transparency.
function tintLayer(image, colour, width, height) {
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0, width, height)
  context.globalCompositeOperation = 'multiply'
  context.fillStyle = colour
  context.fillRect(0, 0, width, height)
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(image, 0, 0, width, height)
  return canvas
}

// Composited portrait art (rules/appearance.js getPortraitLayers): every layer drawn bottom to top at the first
// layer's size; the uniform layer is tinted with the department colour.
async function composeLayers(layers, colour) {
  const images = await Promise.all(layers.map((layer) => loadImage(layer.src)))
  const { naturalWidth: width, naturalHeight: height } = images[0]
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  layers.forEach((layer, index) => {
    const image = layer.role === 'uniform' && colour ? tintLayer(images[index], colour, width, height) : images[index]
    context.drawImage(image, 0, 0, width, height)
  })
  return toUrl(canvas)
}

// Flat mock art: the shirt's flat colours swapped in place.
async function recolourFlat(src, colour) {
  const image = await loadImage(src)
  const canvas = createCanvas(image.naturalWidth, image.naturalHeight)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  const data = context.getImageData(0, 0, canvas.width, canvas.height)
  recolourShirtPixels(data.data, colour)
  context.putImageData(data, 0, 0)
  return toUrl(canvas)
}

// `${src}|${colour}` -> { url } once drawn. Layered art falls back to the flat picture if a layer fails to load; a
// picture that can't be drawn at all (missing file, or a canvas the browser won't let us read) keeps its original src,
// so the usual placeholder/fallback behaviour still applies.
const cache = new Map()

function draw(src, colour) {
  const key = `${src}|${colour}`
  if (!cache.has(key)) {
    const layers = getPortraitLayers(src)
    const flat = async () => (colour ? recolourFlat(src, colour) : src)
    const promise = (layers ? composeLayers(layers, colour).catch(flat) : flat())
      .catch(() => src)
      .then((url) => {
        cache.set(key, { url })
      })
    cache.set(key, { promise })
  }
  return cache.get(key)
}

// The portrait `src` as shown: its layers stacked if it has any, wearing `colour` (from getUniformColour). Null while
// it is being drawn, so callers keep what they showed before rather than flashing the wrong picture. A picture with
// neither layers nor a colour is returned as it is.
export function useUniformImage(src, colour) {
  const key = src && (colour || getPortraitLayers(src)) ? `${src}|${colour}` : null
  const [, setReady] = useState(null)

  useEffect(() => {
    if (!key) return undefined
    const entry = draw(src, colour)
    if (!entry.promise) return undefined
    let live = true
    entry.promise.then(() => live && setReady(key))
    return () => {
      live = false
    }
  }, [key, src, colour])

  if (!key) return src
  return cache.get(key)?.url ?? null
}
