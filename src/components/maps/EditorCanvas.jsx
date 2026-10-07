import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { boardBounds, boardLayout, changedArea, drawBoard, imagesFor, isLoaded, loadImage } from './canvasTiles.js'

// The map editor's tiles (floor, shadows and light pools, blocks) as one canvas inside the board's SVG, so the camera's
// viewBox moves and zooms it with everything else. A new map, or a change of See-through blocks or Lighting, repaints
// it all; a brush stroke repaints only the area it changed. Presentation only; never takes pointer input.

// Drawn at up to twice world size so zooming in stays sharp, but never more than this many pixels.
const PIXEL_BUDGET = 24_000_000
const MAX_SCALE = 2

export default function EditorCanvas({ map, ghost, lighting }) {
  const canvasRef = useRef(null)
  // What the canvas currently shows: { layout, ghost, lighting, width, height }.
  const drawn = useRef(null)
  // Bumped when images finish loading, to draw the map they were needed for.
  const [imagesReady, setImagesReady] = useState(0)
  const bounds = useMemo(() => boardBounds({ width: map.width, height: map.height }), [map.width, map.height])
  const scale = Math.min(MAX_SCALE, Math.sqrt(PIXEL_BUDGET / (bounds.width * bounds.height)))
  const width = Math.ceil(bounds.width * scale)
  const height = Math.ceil(bounds.height * scale)

  // Before the browser paints, so a brush stroke shows on the same frame.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const previous = drawn.current
    const sameSetup = previous && previous.ghost === ghost && previous.lighting === lighting && previous.width === width && previous.height === height
    // Renaming, markers, weather and the like leave the tiles alone.
    if (sameSetup && previous.layout.map.tiles === map.tiles && previous.layout.map.rotated === map.rotated) return undefined
    const missing = imagesFor(map).filter((href) => !isLoaded(href))
    if (missing.length) {
      let cancelled = false
      Promise.all(missing.map(loadImage)).then(() => !cancelled && setImagesReady((n) => n + 1))
      return () => {
        cancelled = true
      }
    }
    const layout = boardLayout(map)
    let area = bounds
    if (sameSetup) {
      const changed = changedArea(previous.layout, layout)
      if (!changed) {
        drawn.current = { ...previous, layout }
        return undefined
      }
      if (changed !== 'all') area = snapToPixels(changed, bounds, scale)
    } else {
      canvas.width = width
      canvas.height = height
    }
    drawBoard(canvas.getContext('2d'), [scale, 0, 0, scale, -bounds.x * scale, -bounds.y * scale], layout, area, { ghost, lighting })
    drawn.current = { layout, ghost, lighting, width, height }
    return undefined
  }, [map, ghost, lighting, imagesReady, width, height, scale, bounds])

  return (
    <foreignObject x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} pointerEvents="none">
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </foreignObject>
  )
}

// A world rect grown out to whole canvas pixels, so a partial repaint leaves no seam at its edges.
function snapToPixels(area, bounds, scale) {
  const x0 = Math.floor((area.x - bounds.x) * scale) / scale + bounds.x
  const y0 = Math.floor((area.y - bounds.y) * scale) / scale + bounds.y
  const x1 = Math.ceil((area.x + area.width - bounds.x) * scale) / scale + bounds.x
  const y1 = Math.ceil((area.y + area.height - bounds.y) * scale) / scale + bounds.y
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}
