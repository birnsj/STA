import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { boardBounds, boardLayout, changedArea, drawBoard, imagesFor, isLoaded, LIGHT_LAYERS, lightLayersIn, loadImage } from './canvasTiles.js'

// The map editor's tiles (floor, shadows and light pools, blocks) as one canvas inside the board's SVG, so the camera's
// viewBox moves and zooms it with everything else. A new map, or a change of See-through blocks or Lighting, repaints
// it all; a brush stroke repaints only the area it changed. Over it, a light layer canvas for each animation and timing
// group the map uses (canvasTiles.js LIGHT_LAYERS), animated by CSS (mapEditor.css), so the lights move without any
// redrawing; with Tile animations off they hold a steady brightness. Presentation only; never takes pointer input.

// The board is drawn at up to twice world size so zooming in stays sharp, but never more than this many pixels.
const PIXEL_BUDGET = 24_000_000
const MAX_SCALE = 2
// All the light layers together share this many pixels (on a big map they are drawn coarser than the board).
const LIGHT_PIXEL_BUDGET = 16_000_000

export default function EditorCanvas({ map, ghost, lighting }) {
  const canvasRef = useRef(null)
  const layerCanvases = useRef(new Map())
  // What each canvas currently shows: { canvas, layout, ghost, lighting, width, height }; 'board' and the layers' ids.
  const drawn = useRef(new Map())
  // Bumped when images finish loading, to draw the map they were needed for.
  const [imagesReady, setImagesReady] = useState(0)
  const bounds = useMemo(() => boardBounds({ width: map.width, height: map.height }), [map.width, map.height])
  const scale = Math.min(MAX_SCALE, Math.sqrt(PIXEL_BUDGET / (bounds.width * bounds.height)))
  const layout = useMemo(() => boardLayout(map), [map])
  const usedLayers = useMemo(() => lightLayersIn(layout), [layout])
  const layers = LIGHT_LAYERS.filter((layer) => usedLayers.has(layer.id))
  const layerScale = Math.min(scale, Math.sqrt(LIGHT_PIXEL_BUDGET / (Math.max(1, layers.length) * bounds.width * bounds.height)))
  const layerKey = layers.map((layer) => layer.id).join(' ')

  // Before the browser paints, so a brush stroke shows on the same frame.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const missing = imagesFor(map).filter((href) => !isLoaded(href))
    if (missing.length) {
      let cancelled = false
      Promise.all(missing.map(loadImage)).then(() => !cancelled && setImagesReady((n) => n + 1))
      return () => {
        cancelled = true
      }
    }
    const records = drawn.current
    records.set('board', repaint(canvas, records.get('board'), layout, bounds, scale, { ghost, lighting }))
    for (const id of [...records.keys()]) if (id !== 'board' && !layerCanvases.current.has(id)) records.delete(id)
    for (const layer of LIGHT_LAYERS) {
      const layerCanvas = layerCanvases.current.get(layer.id)
      if (layerCanvas) records.set(layer.id, repaint(layerCanvas, records.get(layer.id), layout, bounds, layerScale, { ghost, pass: layer }))
    }
    return undefined
  }, [map, layout, ghost, lighting, imagesReady, bounds, scale, layerScale, layerKey])

  const layerRef = (id) => (element) => {
    if (element) layerCanvases.current.set(id, element)
    else layerCanvases.current.delete(id)
  }

  return (
    <foreignObject x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} pointerEvents="none">
      <div className="me-canvas">
        <canvas ref={canvasRef} />
        {layers.map((layer) => (
          <canvas key={layer.id} ref={layerRef(layer.id)} className={`me-light-layer is-${layer.style}`} style={{ animationDelay: `${layer.delay}s` }} />
        ))}
      </div>
    </foreignObject>
  )
}

// Brings one canvas up to date with `layout` and returns what it now shows. It repaints all of it when it is a new
// canvas or its setup (size, See-through blocks, Lighting) changed, otherwise only the area the tiles changed; renaming,
// markers, weather and the like leave the tiles alone and repaint nothing.
function repaint(canvas, record, layout, bounds, scale, { ghost, lighting = true, pass = null }) {
  const width = Math.ceil(bounds.width * scale)
  const height = Math.ceil(bounds.height * scale)
  const sameSetup =
    record?.canvas === canvas && record.ghost === ghost && record.lighting === lighting && record.width === width && record.height === height
  let area = bounds
  if (sameSetup) {
    const before = record.layout.map
    if (before.tiles === layout.map.tiles && before.rotated === layout.map.rotated) return { ...record, layout }
    const changed = changedArea(record.layout, layout)
    if (!changed) return { ...record, layout }
    if (changed !== 'all') area = snapToPixels(changed, bounds, scale)
  } else {
    canvas.width = width
    canvas.height = height
  }
  drawBoard(canvas.getContext('2d'), [scale, 0, 0, scale, -bounds.x * scale, -bounds.y * scale], layout, area, { ghost, lighting, pass })
  return { canvas, layout, ghost, lighting, width, height }
}

// A world rect grown out to whole canvas pixels, so a partial repaint leaves no seam at its edges.
function snapToPixels(area, bounds, scale) {
  const x0 = Math.floor((area.x - bounds.x) * scale) / scale + bounds.x
  const y0 = Math.floor((area.y - bounds.y) * scale) / scale + bounds.y
  const x1 = Math.ceil((area.x + area.width - bounds.x) * scale) / scale + bounds.x
  const y1 = Math.ceil((area.y + area.height - bounds.y) * scale) / scale + bounds.y
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}
