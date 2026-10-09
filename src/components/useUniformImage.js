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

const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b

// Recolours the pixels under the mask (RGBA data of the same size, opaque where the uniform is) to `colour`, in place.
// Each pixel keeps its brightness relative to the shirt's typical (median) brightness: the median becomes `colour`
// itself, darker folds darken it and highlights blend it toward white. Alpha, and every pixel outside the mask, is
// left exactly as it was.
export function recolourMaskedPixels(pixels, maskPixels, colour) {
  const target = toRgb(colour)
  const levels = []
  for (let index = 0; index < pixels.length; index += 4) {
    if (maskPixels[index + 3]) levels.push(luminance(pixels[index], pixels[index + 1], pixels[index + 2]))
  }
  if (!levels.length) return pixels
  levels.sort((a, b) => a - b)
  const reference = Math.max(1, levels[Math.floor(levels.length / 2)])
  const highlightRange = Math.max(1, 255 - reference)
  for (let index = 0; index < pixels.length; index += 4) {
    if (!maskPixels[index + 3]) continue
    const level = luminance(pixels[index], pixels[index + 1], pixels[index + 2])
    for (let channel = 0; channel < 3; channel++) {
      const base = target[channel]
      const value = level <= reference ? (base * level) / reference : base + ((255 - base) * (level - reference)) / highlightRange
      pixels[index + channel] = Math.round(Math.min(255, value))
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

// A character layer with its uniform mask applied: the shirt recoloured, everything else untouched.
function recolourMaskedLayer(image, mask, colour, width, height) {
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0, width, height)
  const maskCanvas = createCanvas(width, height)
  const maskContext = maskCanvas.getContext('2d')
  maskContext.drawImage(mask, 0, 0, width, height)
  const data = context.getImageData(0, 0, width, height)
  recolourMaskedPixels(data.data, maskContext.getImageData(0, 0, width, height).data, colour)
  context.putImageData(data, 0, 0)
  return canvas
}

// One picture with its uniform mask applied (map sprite sheets, components/maps/useRecolouredSheet.js): a URL of the
// recoloured copy.
export async function recolourWithMask(src, maskSrc, colour) {
  const [image, mask] = await Promise.all([loadImage(src), loadImage(maskSrc)])
  return toUrl(recolourMaskedLayer(image, mask, colour, image.naturalWidth, image.naturalHeight))
}

const needsMaskRecolour = (layer, colour) => Boolean(layer.mask && colour && colour !== layer.baseColour)

function layerImage(layer, image, mask, colour, width, height) {
  if (layer.role === 'uniform' && colour) return tintLayer(image, colour, width, height)
  if (needsMaskRecolour(layer, colour)) return recolourMaskedLayer(image, mask, colour, width, height)
  return image
}

// Composited portrait art (rules/appearance.js getPortraitLayers): every layer drawn bottom to top at the first
// non-backdrop layer's size; the uniform layer is tinted with the department colour, and a masked character has its
// shirt recoloured. The backdrop may be another size (pixel art), so it is scaled without smoothing.
async function composeLayers(layers, colour) {
  const images = await Promise.all(layers.map((layer) => loadImage(layer.src)))
  const masks = await Promise.all(layers.map((layer) => (needsMaskRecolour(layer, colour) ? loadImage(layer.mask) : null)))
  const sizeImage = images[layers.findIndex((layer) => layer.role !== 'backdrop')] ?? images[0]
  const { naturalWidth: width, naturalHeight: height } = sizeImage
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  layers.forEach((layer, index) => {
    context.imageSmoothingEnabled = layer.role !== 'backdrop'
    context.drawImage(layerImage(layer, images[index], masks[index], colour, width, height), 0, 0, width, height)
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

// The layers to stack for `src`, with the backdrop image underneath. Only head-and-shoulders layers (a transparent
// character at the bottom) take a backdrop: single-image portraits are opaque and full-body layers bring their own
// background, so one would never show.
function layersFor(src, backdrop) {
  const layers = getPortraitLayers(src)
  if (!layers) return null
  return backdrop && layers[0].role === 'character' ? [{ role: 'backdrop', src: backdrop }, ...layers] : layers
}

// `${src}|${colour}|${backdrop}` -> { url } once drawn. Layered art falls back to the flat picture if a layer fails to
// load; a picture that can't be drawn at all (missing file, or a canvas the browser won't let us read) keeps its
// original src, so the usual placeholder/fallback behaviour still applies.
const cache = new Map()

function draw(src, colour, backdrop) {
  const key = `${src}|${colour}|${backdrop}`
  if (!cache.has(key)) {
    const layers = layersFor(src, backdrop)
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

// The portrait `src` as shown: its layers stacked if it has any, over `backdrop` (an image path, from
// getCharacterBackdrop) and wearing `colour` (from getUniformColour). Null while it is being drawn, so callers keep
// what they showed before rather than flashing the wrong picture. A picture with neither layers nor a colour is
// returned as it is.
export function useUniformImage(src, colour, backdrop = null) {
  const key = src && (colour || getPortraitLayers(src)) ? `${src}|${colour}|${backdrop}` : null
  const [, setReady] = useState(null)

  useEffect(() => {
    if (!key) return undefined
    const entry = draw(src, colour, backdrop)
    if (!entry.promise) return undefined
    let live = true
    entry.promise.then(() => live && setReady(key))
    return () => {
      live = false
    }
  }, [key, src, colour, backdrop])

  if (!key) return src
  return cache.get(key)?.url ?? null
}
