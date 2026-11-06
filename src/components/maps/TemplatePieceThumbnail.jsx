import { useEffect, useRef } from 'react'
import { templateOverlayEmissionAt } from '../../maps/templatePieces.js'

// Palette cell frame (design CSS size). Backing store is HiDPI so CSS stretch stays sharp — same idea as TileThumbnail.
const FRAME_W = 64
const FRAME_H = 96

function thumbnailResolution() {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  return Math.max(3, Math.min(6, Math.round(dpr * 3)))
}

function loadImage(href) {
  return new Promise((resolve) => {
    if (!href) {
      resolve(null)
      return
    }
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = href
  })
}

function drawFitted(ctx, image, lights, width, height) {
  ctx.clearRect(0, 0, width, height)
  // Source is 4× AA art — bilinear shrink into the thumb, not nearest-neighbour (that made walls look jagged).
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
  const w = Math.max(1, Math.round(image.naturalWidth * scale))
  const h = Math.max(1, Math.round(image.naturalHeight * scale))
  const x = Math.floor((width - w) / 2)
  const y = Math.floor(height - h)
  ctx.drawImage(image, x, y, w, h)
  if (lights) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.drawImage(lights, x, y, w, h)
    ctx.globalCompositeOperation = 'source-over'
  }
}

// Smoothly fit the 4× template PNG into a HiDPI canvas; CSS then sizes it to the thumb / preview box.
// When animate is on and the piece has overlay emissions, advances frames like TileThumbnail / board overlays.
export default function TemplatePieceThumbnail({ piece, className = '', large = false, animate = true }) {
  const ref = useRef(null)
  const href = piece?.href
  const animation = piece?.animation ?? null
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !href) return
    let cancelled = false
    let raf = 0
    let paintGen = 0
    const res = thumbnailResolution()
    const frameW = large ? 128 : FRAME_W
    const frameH = large ? 160 : FRAME_H
    const width = Math.max(1, Math.round(frameW * res))
    const height = Math.max(1, Math.round(frameH * res))
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    const emissionHrefs = [...new Set((animation?.images ?? []).map((entry) => entry?.emission).filter(Boolean))]
    const playing = Boolean(animate && animation?.overlay && emissionHrefs.length > 0)

    ;(async () => {
      const [image, ...lights] = await Promise.all([loadImage(href), ...emissionHrefs.map(loadImage)])
      if (cancelled || !image) return
      const byHref = new Map()
      emissionHrefs.forEach((src, index) => {
        if (lights[index]) byHref.set(src, lights[index])
      })

      const paint = (seconds) => {
        const emissionHref = templateOverlayEmissionAt(animation, seconds)
        drawFitted(ctx, image, emissionHref ? byHref.get(emissionHref) ?? null : null, width, height)
      }

      const gen = ++paintGen
      paint(playing ? performance.now() / 1000 : null)
      if (!playing || cancelled || gen !== paintGen) return

      let shown = null
      const tick = (now) => {
        if (cancelled) return
        const seconds = now / 1000
        const emissionHref = templateOverlayEmissionAt(animation, seconds)
        if (emissionHref !== shown) {
          shown = emissionHref
          paint(seconds)
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [href, animation, large, animate])
  return <canvas ref={ref} className={className} aria-hidden="true" />
}
