import { useEffect, useRef } from 'react'

// Palette cell frame (design CSS size). Backing store is HiDPI so CSS stretch stays sharp — same idea as TileThumbnail.
const FRAME_W = 64
const FRAME_H = 96

function thumbnailResolution() {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  return Math.max(3, Math.min(6, Math.round(dpr * 3)))
}

// Smoothly fit the 4× template PNG into a HiDPI canvas; CSS then sizes it to the thumb / preview box.
export default function TemplatePieceThumbnail({ piece, className = '', large = false }) {
  const ref = useRef(null)
  const href = piece?.href
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !href) return
    let cancelled = false
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      if (cancelled) return
      const res = thumbnailResolution()
      // Large Properties preview: taller frame so long walls / props keep detail.
      const frameW = large ? 128 : FRAME_W
      const frameH = large ? 160 : FRAME_H
      const width = Math.max(1, Math.round(frameW * res))
      const height = Math.max(1, Math.round(frameH * res))
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, width, height)
      // Source is 4× AA art — bilinear shrink into the thumb, not nearest-neighbour (that made walls look jagged).
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
      const w = Math.max(1, Math.round(image.naturalWidth * scale))
      const h = Math.max(1, Math.round(image.naturalHeight * scale))
      ctx.drawImage(image, Math.floor((width - w) / 2), Math.floor(height - h), w, h)
    }
    image.src = href
    return () => {
      cancelled = true
    }
  }, [href, large])
  return <canvas ref={ref} className={className} aria-hidden="true" />
}
