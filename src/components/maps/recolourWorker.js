import { recolourMaskedPixels } from '../recolourPixels.js'

// Recolours a sprite sheet off the page's thread (useRecolouredSheet.js): the sheets are millions of pixels, and
// reading, recolouring and encoding one on the page froze the game for a few hundred milliseconds each.
// { id, file, mask, colour } -> { id, blob } (a PNG), or { id, error }.
const bitmap = (src) =>
  fetch(src).then((response) => {
    if (!response.ok) throw new Error(`${src}: ${response.status}`)
    return response.blob().then((blob) => createImageBitmap(blob))
  })

function pixelsOf(image) {
  const canvas = new OffscreenCanvas(image.width, image.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0)
  return { canvas, context, data: context.getImageData(0, 0, image.width, image.height) }
}

self.onmessage = async ({ data: { id, file, mask, colour } }) => {
  try {
    const [image, maskImage] = await Promise.all([bitmap(file), bitmap(mask)])
    const sheet = pixelsOf(image)
    recolourMaskedPixels(sheet.data.data, pixelsOf(maskImage).data.data, colour)
    sheet.context.putImageData(sheet.data, 0, 0)
    self.postMessage({ id, blob: await sheet.canvas.convertToBlob({ type: 'image/png' }) })
  } catch (error) {
    self.postMessage({ id, error: String(error) })
  }
}
