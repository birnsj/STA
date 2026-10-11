// Pixel recolouring shared by the page (useUniformImage.js) and the sprite sheet worker (maps/recolourWorker.js), so
// it imports nothing that needs a document.

export const toRgb = (hex) => [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))

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
