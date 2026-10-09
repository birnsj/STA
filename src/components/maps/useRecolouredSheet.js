import { useEffect, useState } from 'react'
import { getDivisionColour } from '../../rules/uniform.js'
import { recolourWithMask } from '../useUniformImage.js'

// `${sheet}|${colour}` -> { url } once drawn, or { promise } while drawing. A sheet that can't be recoloured (missing
// mask, or a canvas the browser won't let us read) is shown as drawn.
const cache = new Map()

function draw(set, colour) {
  const key = `${set.sheet}|${colour}`
  if (!cache.has(key)) {
    const promise = recolourWithMask(set.sheet, set.uniformMask, colour)
      .catch(() => set.sheet)
      .then((url) => {
        cache.set(key, { url })
      })
    cache.set(key, { promise })
  }
  return cache.get(key)
}

// A sprite set's sheet (characterSprites.json) wearing `colour` (from getUniformColour). The sheet itself when it needs
// no change (no colour, no mask, or already that colour); null while the recoloured copy is drawn, so the figure
// doesn't flash the wrong colour.
export default function useRecolouredSheet(set, colour) {
  const recolours = Boolean(set?.uniformMask && colour && colour !== getDivisionColour(set.uniformDivision))
  const key = recolours ? `${set.sheet}|${colour}` : null
  const [, setReady] = useState(null)

  useEffect(() => {
    if (!key) return undefined
    const entry = draw(set, colour)
    if (!entry.promise) return undefined
    let live = true
    entry.promise.then(() => live && setReady(key))
    return () => {
      live = false
    }
  }, [key, set, colour])

  if (!set) return null
  if (!key) return set.sheet
  return cache.get(key)?.url ?? null
}
