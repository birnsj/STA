import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FULL_LIGHT } from '../../maps/mapFormat.js'
import { frameAt } from '../../maps/tileArt.js'
import { animatedTiles, boardBounds, boardLayout, changedArea, drawBoard, imagesFor, isLoaded, loadImage } from './canvasTiles.js'

// The map editor's tiles (floor, shadows and light pools, blocks) as one canvas inside the board's SVG, so the camera's
// viewBox moves and zooms it with everything else. A new map, or a change of See-through blocks or Lighting, repaints
// it all; a brush stroke repaints only the area it changed. Animated tiles (tileArt.js flipbooks) are on two
// animation layers over it (canvasTiles.js ANIMATION_LAYERS): their sprites under the map's darkness and, when the map
// is dark, their lit parts over it, so lights stay at full brightness. A timer redraws a tile on them only when its
// frame changes; with Tile animations off (animate false) or reduced motion, every tile holds its loop's first frame.
// Presentation only; never takes pointer input.
// darkness: the map's darkness (IsoTiles AmbientDarkness), drawn between the two animation layers.

// The board is drawn at up to twice world size so zooming in stays sharp, but never more than this many pixels.
const PIXEL_BUDGET = 24_000_000
const MAX_SCALE = 2
// The animation layers together share this many pixels (on a big map they are drawn coarser than the board).
const LAYER_PIXEL_BUDGET = 16_000_000
// More changed tiles than this in one tick repaint a whole layer instead.
const MAX_TILE_REPAINTS = 40

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function EditorCanvas({ map, ghost, lighting, animate = true, darkness = null }) {
  const canvasRef = useRef(null)
  const layerCanvases = useRef(new Map())
  // What each canvas currently shows: { canvas, layout, ghost, lighting, width, height }; 'board' and the layers' ids.
  const drawn = useRef(new Map())
  // Bumped when images finish loading, to draw the map they were needed for.
  const [imagesReady, setImagesReady] = useState(0)
  const bounds = useMemo(() => boardBounds({ width: map.width, height: map.height }), [map.width, map.height])
  const scale = Math.min(MAX_SCALE, Math.sqrt(PIXEL_BUDGET / (bounds.width * bounds.height)))
  const layout = useMemo(() => boardLayout(map), [map])
  const animatedList = useMemo(() => animatedTiles(layout), [layout])
  const dark = lighting && (map.ambient ?? FULL_LIGHT) < FULL_LIGHT
  const hasAnimation = animatedList.length > 0
  const layers = useMemo(() => (hasAnimation ? (dark ? ['frames', 'lit'] : ['frames']) : []), [hasAnimation, dark])
  const layerScale = Math.min(scale, Math.sqrt(LAYER_PIXEL_BUDGET / (Math.max(1, layers.length) * bounds.width * bounds.height)))
  const playing = animate && !reducedMotion()

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
    // The clock the layers are drawn at: seconds, or null for every loop's first frame.
    const time = playing ? performance.now() / 1000 : null
    for (const layer of layers) {
      const layerCanvas = layerCanvases.current.get(layer)
      if (layerCanvas) records.set(layer, repaint(layerCanvas, records.get(layer), layout, bounds, layerScale, { ghost, pass: { layer, time }, playing }))
    }
    return undefined
  }, [map, layout, ghost, lighting, imagesReady, bounds, scale, layerScale, layers, playing])

  // Each animated tile's frame as last drawn ('x,y' -> image index), so a tick redraws only the tiles that moved on.
  const shownFrames = useRef(new Map())
  useEffect(() => {
    if (!playing || !layers.length) return undefined
    let request = 0
    const tick = () => {
      request = requestAnimationFrame(tick)
      const time = performance.now() / 1000
      const changed = []
      for (const item of animatedList) {
        const index = frameAt(item.book, time + item.offset)
        if (shownFrames.current.get(item.key) === index) continue
        shownFrames.current.set(item.key, index)
        changed.push(item.area)
      }
      if (!changed.length) return
      for (const layer of layers) {
        const record = drawn.current.get(layer)
        if (!record || record.layout !== layout) continue
        const context = record.canvas.getContext('2d')
        const transform = [layerScale, 0, 0, layerScale, -bounds.x * layerScale, -bounds.y * layerScale]
        const areas = changed.length > MAX_TILE_REPAINTS ? [bounds] : changed.map((area) => snapToPixels(area, bounds, layerScale))
        for (const area of areas) drawBoard(context, transform, layout, area, { ghost, pass: { layer, time } })
      }
    }
    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
  }, [playing, layers, animatedList, layout, ghost, bounds, layerScale])

  const layerRef = (id) => (element) => {
    if (element) layerCanvases.current.set(id, element)
    else layerCanvases.current.delete(id)
  }

  const box = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, pointerEvents: 'none' }
  return (
    <>
      <foreignObject {...box}>
        <div className="me-canvas">
          <canvas ref={canvasRef} />
          {layers.includes('frames') && <canvas ref={layerRef('frames')} />}
        </div>
      </foreignObject>
      {darkness}
      {layers.includes('lit') && (
        <foreignObject {...box}>
          <div className="me-canvas">
            <canvas ref={layerRef('lit')} />
          </div>
        </foreignObject>
      )}
    </>
  )
}

// Brings one canvas up to date with `layout` and returns what it now shows. It repaints all of it when it is a new
// canvas or its setup (size, See-through blocks, Lighting, animations playing) changed, otherwise only the area the
// tiles changed; renaming, markers, weather and the like leave the tiles alone and repaint nothing.
function repaint(canvas, record, layout, bounds, scale, { ghost, lighting = true, pass = null, playing = null }) {
  const width = Math.ceil(bounds.width * scale)
  const height = Math.ceil(bounds.height * scale)
  const sameSetup =
    record?.canvas === canvas &&
    record.ghost === ghost &&
    record.lighting === lighting &&
    record.playing === playing &&
    record.width === width &&
    record.height === height
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
  return { canvas, layout, ghost, lighting, playing, width, height }
}

// A world rect grown out to whole canvas pixels, so a partial repaint leaves no seam at its edges.
function snapToPixels(area, bounds, scale) {
  const x0 = Math.floor((area.x - bounds.x) * scale) / scale + bounds.x
  const y0 = Math.floor((area.y - bounds.y) * scale) / scale + bounds.y
  const x1 = Math.ceil((area.x + area.width - bounds.x) * scale) / scale + bounds.x
  const y1 = Math.ceil((area.y + area.height - bounds.y) * scale) / scale + bounds.y
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}
