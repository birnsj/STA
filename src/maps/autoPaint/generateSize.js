// Auto-Paint Generate Map size snap — Template Deck / Starship Deck presets only.
import { sizeFor, sizeIdOf } from '../mapGenerators.js'

/**
 * Prefer Template Deck size presets (same kit as locked Generate Map).
 * Picks the closest preset by area, then by manhattan size delta.
 */
export function snapAutoPaintGenerateSize(mapType, width, height) {
  const typeId = mapType === 'templateDeck' ? 'templateDeck' : 'starshipDeck'
  const currentId = sizeIdOf({ mapType: typeId, width, height })
  if (currentId && currentId !== 'custom') {
    return { width, height, sizeId: currentId, snapped: false }
  }

  const candidates = ['small', 'medium', 'large', 'huge', 'gigantic'].map((id) => {
    const size = sizeFor(typeId, id)
    const areaDelta = Math.abs(size.width * size.height - width * height)
    const manhattan = Math.abs(size.width - width) + Math.abs(size.height - height)
    return { id, ...size, areaDelta, manhattan }
  })
  candidates.sort((a, b) => a.areaDelta - b.areaDelta || a.manhattan - b.manhattan)
  const best = candidates[0]
  const snapped = best.width !== width || best.height !== height
  return { width: best.width, height: best.height, sizeId: best.id, snapped }
}
