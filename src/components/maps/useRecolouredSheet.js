import { useEffect, useState } from 'react'
import { getDivisionColour } from '../../rules/uniform.js'
import { recolourWithMask } from '../useUniformImage.js'

// `${file}|${colour}` -> { url } once drawn, or { promise } while drawing. A sheet that can't be recoloured (missing
// mask, or a canvas the browser won't let us read) is shown as drawn.
const cache = new Map()
// Sheets shown as drawn that were already asked for, so the browser has them before a figure switches to them.
const preloaded = new Set()
// Sheets still loading or being recoloured, so a fade-in (MapFadeIn) can wait for the figures.
const loading = new Set()
const track = (promise) => {
  loading.add(promise)
  promise.finally(() => loading.delete(promise))
  return promise
}
// Resolves once every sheet asked for so far has loaded (or failed).
export const sheetsSettled = () => Promise.allSettled([...loading])

function preload(file) {
  const image = new Image()
  track(new Promise((resolve) => {
    image.onload = image.onerror = resolve
  }))
  image.src = file
}

// Sheets are recoloured in workers (recolourWorker.js), two so one character's big sheet doesn't hold up the next
// character; on the page itself where workers can't draw.
const WORKERS = 2
const workers = []
const jobs = new Map()
let nextJob = 0
let workersFailed = false
const canUseWorkers = () => !workersFailed && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'

function workerFor(id) {
  const index = id % WORKERS
  if (!workers[index]) {
    workers[index] = new Worker(new URL('./recolourWorker.js', import.meta.url), { type: 'module' })
    workers[index].onmessage = ({ data: { id: done, blob, error } }) => {
      const job = jobs.get(done)
      jobs.delete(done)
      if (error) job.reject(new Error(error))
      else job.resolve(URL.createObjectURL(blob))
    }
    // A worker that won't start: every waiting sheet is drawn on the page instead, and so is every later one.
    workers[index].onerror = () => {
      workersFailed = true
      for (const job of jobs.values()) job.reject(new Error('Recolour worker failed'))
      jobs.clear()
    }
  }
  return workers[index]
}

function recolourOffPage(file, mask, colour) {
  if (!canUseWorkers()) return recolourWithMask(file, mask, colour)
  const id = nextJob++
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject })
    workerFor(id).postMessage({ id, file, mask, colour })
  }).catch(() => recolourWithMask(file, mask, colour))
}

function draw(file, mask, colour) {
  const key = `${file}|${colour}`
  if (!cache.has(key)) {
    const promise = track(
      recolourOffPage(file, mask, colour)
        .catch(() => file)
        .then((url) => {
          cache.set(key, { url })
        }),
    )
    cache.set(key, { promise })
  }
  return cache.get(key)
}

// One of a sprite set's sheet PNGs (file, its uniform mask or null, and the division colour the sheet already wears)
// wearing `colour` (from getUniformColour). The file itself when it needs no change (no colour, no mask, or already
// that colour); null while the recoloured copy is drawn, so the figure doesn't flash the wrong colour. enabled false:
// not needed yet (null, nothing loaded).
export default function useRecolouredSheet(file, mask, division, colour, enabled = true) {
  const recolours = Boolean(enabled && file && mask && colour && colour !== getDivisionColour(division))
  const key = recolours ? `${file}|${colour}` : null
  const [, setReady] = useState(null)

  useEffect(() => {
    if (!enabled || !file) return undefined
    if (!key) {
      if (!preloaded.has(file) && typeof Image !== 'undefined') {
        preloaded.add(file)
        preload(file)
      }
      return undefined
    }
    const entry = draw(file, mask, colour)
    if (!entry.promise) return undefined
    let live = true
    entry.promise.then(() => live && setReady(key))
    return () => {
      live = false
    }
  }, [enabled, key, file, mask, colour])

  if (!enabled || !file) return null
  if (!key) return file
  return cache.get(key)?.url ?? null
}
