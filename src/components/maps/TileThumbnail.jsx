import { useEffect, useRef } from 'react'
import { animationOffset, bigFlipbook, frameAt, panelFlipbook, tileFlipbook } from '../../maps/tileArt.js'
import { drawLoneTiles } from './canvasTiles.js'

// A tile as the board draws it, for the editor palette / Properties preview. Animated tiles advance their flipbook
// when animate is on (tied to the editor Animate toolbar). Presentation only.
// Resolution tracks devicePixelRatio so large Asset-grid cells stay sharp on HiDPI (was fixed at 2 and looked soft).
function thumbnailResolution() {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  return Math.max(3, Math.min(6, Math.round(dpr * 3)))
}

function thumbnailBook(tile) {
  if (tile.panels) return panelFlipbook(tile, 'x') || tileFlipbook(tile)
  return tileFlipbook(tile) || bigFlipbook(tile)
}

export default function TileThumbnail({ tile, className, animate = true }) {
  const ref = useRef(null)
  useEffect(() => {
    let cancelled = false
    let raf = 0
    let paintGen = 0
    const positions = tile.panels ? [{ x: 0, y: 0 }, { x: 1, y: 0 }] : [{ x: 0, y: 0 }]
    const map = { width: positions.length, height: 1, tiles: [positions.map(() => tile.id)] }
    const hasWindow = tile.windows !== false
    const panels = new Map(tile.panels ? positions.map((position, half) => [`${position.x},${position.y}`, { axis: 'x', half, window: hasWindow }]) : [])
    const layout = { map, panels, bigGroups: new Map() }
    const resolution = thumbnailResolution()
    const book = thumbnailBook(tile)
    const offset = animationOffset({ x: 0, y: 0 })

    const paint = async (time) => {
      const gen = ++paintGen
      const drawn = await drawLoneTiles(layout, positions, resolution, time)
      if (cancelled || gen !== paintGen) return
      const canvas = drawn.canvas
      const target = ref.current
      if (!target) return
      if (target.width !== canvas.width || target.height !== canvas.height) {
        target.width = canvas.width
        target.height = canvas.height
      }
      const context = target.getContext('2d')
      context.imageSmoothingEnabled = true
      context.clearRect(0, 0, target.width, target.height)
      context.drawImage(canvas, 0, 0)
    }

    const playing = Boolean(animate && book)
    paint(playing ? performance.now() / 1000 : null)

    if (!playing) {
      return () => {
        cancelled = true
      }
    }

    let shown = null
    const tick = (now) => {
      if (cancelled) return
      const seconds = now / 1000
      const index = frameAt(book, seconds + offset)
      if (index !== shown) {
        shown = index
        paint(seconds)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [tile, animate])
  return <canvas ref={ref} className={className} aria-hidden="true" />
}
