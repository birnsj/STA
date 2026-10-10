import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TILE_W } from '../../maps/iso.js'
import { FADE_MS, fadeLevels, retarget } from './fadeLevels.js'
import { MapReadyContext } from './mapReady.js'
import { DARK_MARGIN, darknessOpacity, frameAt } from '../../maps/tileArt.js'
import {
  animatedArea,
  animatedTiles,
  blockAreaOf,
  boardBounds,
  changedArea,
  drawBoard,
  drawDarkness,
  emissiveTiles,
  imagesFor,
  isLoaded,
  loadImage,
  mergeAreas,
  snapToPixels,
} from './canvasTiles.js'
import './maps.css'

// Every map view's map (the map editor, exploration, Combat Type 1), drawn into canvases inside the view's SVG so the
// camera's viewBox moves and zooms them with everything else. Bottom up: the floor (tiles, contact shadows, light
// pools); `ground` (SVG lying on the floor under every block: move highlights, markers); the blocks; the animated tiles'
// current frames; `children` (SVG figures standing among the blocks, occlusion.js); the map's darkness. A canvas is one
// element for the browser to draw however big the map. Changes repaint only the area they touch (an edited tile, a
// faded wall, a moved hole), and a timer redraws an animated tile only when its frame changes; with animate off or
// reduced motion every tile holds its loop's first frame.
// layout: canvasTiles.js boardLayout. ghost: blocks drawn see-through (the editor's See-through blocks). lighting:
// shadows, light pools and darkness drawn. faded: Set of 'x,y' keys drawn see-through (wallFade.js), each easing in
// and out while the tiles animate; holes:
// [{ area, depth }] (occlusion.js), the blocks deeper than depth left out inside area for the SVG to draw over the
// figures. Both kept the same while their contents are.
// Presentation only; never takes pointer input.

// The floor and blocks are drawn at up to twice world size so zooming in stays sharp, within this many pixels each.
const PIXEL_BUDGET = 12_000_000
const MAX_SCALE = 2
// The animation layer is drawn coarser on a big map; the darkness, soft everywhere, coarser still.
const LAYER_PIXEL_BUDGET = 12_000_000
const DARK_PIXEL_BUDGET = 4_000_000
// More changed tiles than this in one tick repaint a whole layer instead.
const MAX_TILE_REPAINTS = 60
const NONE = new Set()
const NO_HOLES = []

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const padded = (bounds, margin) => ({ x: bounds.x - margin, y: bounds.y - margin, width: bounds.width + 2 * margin, height: bounds.height + 2 * margin })
const transformFor = (bounds, scale) => [scale, 0, 0, scale, -bounds.x * scale, -bounds.y * scale]
const sameArea = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
// The world area the view's camera (its SVG viewBox) shows, with a margin for the letterboxing round it and the camera
// moving on before the next tick; null when the SVG has no viewBox.
function visibleArea(element) {
  const view = element?.ownerSVGElement?.viewBox?.baseVal
  if (!view?.width || !view?.height) return null
  return padded(view, Math.max(view.width, view.height) / 4 + TILE_W)
}
const sizeCanvas = (canvas, area, scale) => Object.assign(canvas, { width: Math.ceil(area.width * scale), height: Math.ceil(area.height * scale) })

export default function MapCanvas({ layout, ghost = false, lighting = true, animate = true, faded = NONE, holes = NO_HOLES, ground = null, children = null }) {
  const { map } = layout
  const floorRef = useRef(null)
  const blocksRef = useRef(null)
  const framesRef = useRef(null)
  const darkRef = useRef(null)
  // What the canvases show: { layout, faded, holes, setup, darkSetup }.
  const drawn = useRef(null)
  // Bumped when images finish loading, to draw the map they were needed for.
  const [imagesReady, setImagesReady] = useState(0)
  const bounds = useMemo(() => boardBounds({ width: map.width, height: map.height }), [map.width, map.height])
  const darkBounds = useMemo(() => padded(bounds, DARK_MARGIN), [bounds])
  const scale = Math.min(MAX_SCALE, Math.sqrt(PIXEL_BUDGET / (bounds.width * bounds.height)))
  const frameScale = Math.min(scale, Math.sqrt(LAYER_PIXEL_BUDGET / (bounds.width * bounds.height)))
  const darkScale = Math.min(1, Math.sqrt(DARK_PIXEL_BUDGET / (darkBounds.width * darkBounds.height)))
  const animatedList = useMemo(() => animatedTiles(layout), [layout])
  const hasFrames = animatedList.length > 0
  const darkness = lighting ? darknessOpacity(map) : 0
  const playing = animate && !reducedMotion()
  // The tick reads the latest holes and See-through blocks without restarting.
  const live = useRef({ holes, ghost })
  const fade = useRef({ target: faded, changes: new Map() })
  // Repaints blocks part way through fading ('x,y' keys), set by the layout effect for the fade's frames.
  const repaintFading = useRef(null)
  const fadeFrame = useRef(0)
  useEffect(() => () => cancelAnimationFrame(fadeFrame.current), [])
  const onMapReady = useContext(MapReadyContext)

  // Before the browser paints, so an edit, or the figures and the blocks left out for them, never show out of step.
  useLayoutEffect(() => {
    live.current = { holes, ghost }
    const fadeState = fade.current
    const fadeKeys = fadeState.target === faded ? [] : [...faded].filter((key) => !fadeState.target.has(key)).concat([...fadeState.target].filter((key) => !faded.has(key)))
    Object.assign(fadeState, retarget(fadeState, faded, performance.now(), playing))
    const floor = floorRef.current
    const blocks = blocksRef.current
    if (!floor || !blocks) return undefined
    const missing = imagesFor(map).filter((href) => !isLoaded(href))
    if (missing.length) {
      let cancelled = false
      Promise.all(missing.map(loadImage)).then(() => !cancelled && setImagesReady((n) => n + 1))
      return () => {
        cancelled = true
      }
    }
    const frames = framesRef.current
    const dark = darkRef.current
    const time = playing ? performance.now() / 1000 : null
    // at: the animation time to draw the animated tiles' frames at.
    const paintTiles = (area, withFloor = true, at = time) => {
      const shown = fadeLevels(fadeState, performance.now())
      if (withFloor) drawBoard(floor.getContext('2d'), transformFor(bounds, scale), layout, snapToPixels(area, bounds, scale), { lighting, part: 'floor' })
      drawBoard(blocks.getContext('2d'), transformFor(bounds, scale), layout, snapToPixels(area, bounds, scale), { ghost, faded: shown, holes, part: 'blocks' })
      if (frames) {
        const pass = { layer: 'frames', time: at }
        drawBoard(frames.getContext('2d'), transformFor(bounds, frameScale), layout, snapToPixels(area, bounds, frameScale), { ghost, faded: shown, holes, pass })
      }
    }
    const paintDark = (area, at = time) => {
      const shown = fadeLevels(fadeState, performance.now())
      if (dark) drawDarkness(dark.getContext('2d'), transformFor(darkBounds, darkScale), layout, snapToPixels(area, darkBounds, darkScale), { faded: shown, time: at })
    }
    const paintFading = (keys) => {
      const at = playing ? performance.now() / 1000 : null
      for (const area of mergeAreas(keys.map((key) => blockAreaOf(layout, key)).filter(Boolean))) {
        paintTiles(area, false, at)
        paintDark(area, at)
      }
    }
    repaintFading.current = paintFading

    const setup = [map.width, map.height, scale, frameScale, Boolean(frames), imagesReady, ghost, lighting, playing].join('|')
    const darkSetup = [setup, Boolean(dark), darkScale, darkness].join('|')
    const before = drawn.current
    const repaint = !before || before.setup !== setup
    drawn.current = { layout, holes, setup, darkSetup, paintedAt: repaint ? time : before.paintedAt }
    if (repaint) {
      sizeCanvas(floor, bounds, scale)
      sizeCanvas(blocks, bounds, scale)
      if (frames) sizeCanvas(frames, bounds, frameScale)
      paintTiles(bounds)
    }
    if (!before || before.darkSetup !== darkSetup) {
      if (dark) sizeCanvas(dark, darkBounds, darkScale)
      paintDark(darkBounds)
    }
    if (repaint) {
      onMapReady?.()
      return undefined
    }

    if (before.layout !== layout) {
      const changed = changedArea(before.layout, layout)
      if (changed === 'all') {
        paintTiles(bounds)
        paintDark(darkBounds)
      } else if (changed) {
        paintTiles(changed)
        paintDark(changed)
      }
    }
    if (fadeKeys.length && !playing) paintFading(fadeKeys)
    if (before.holes !== holes) {
      const kept = (hole, list) => list.some((other) => other.depth === hole.depth && sameArea(other.area, hole.area))
      for (const hole of holes) if (!kept(hole, before.holes)) paintTiles(hole.area, false)
      for (const hole of before.holes) if (!kept(hole, holes)) paintTiles(hole.area, false)
    }
    return undefined
  }, [map, layout, ghost, lighting, faded, holes, imagesReady, bounds, darkBounds, scale, frameScale, darkScale, darkness, playing, onMapReady])

  // Blocks that started fading in or out are repainted every frame until they finish (after the layout effect, so it
  // has set repaintFading for this render).
  useEffect(() => {
    const fadeState = fade.current
    if (fadeState.changes.size && !fadeFrame.current) {
      // Each frame repaints the fading blocks at their opacity then, until they have all finished.
      const step = () => {
        const finished = [...fadeState.changes].filter(([, change]) => performance.now() - change.start >= FADE_MS).map(([key]) => key)
        repaintFading.current?.([...fadeState.changes.keys()])
        for (const key of finished) fadeState.changes.delete(key)
        fadeFrame.current = fadeState.changes.size ? requestAnimationFrame(step) : 0
      }
      fadeFrame.current = requestAnimationFrame(step)
    }
  }, [faded])

  // Each animated tile's frame as last drawn ('x,y' -> image index), so a tick redraws only the tiles that moved on, and
  // only where their frames differ (canvasTiles.js animatedArea).
  const shownFrames = useRef(new Map())
  const anchorRef = useRef(null)
  useEffect(() => {
    if (!playing || !hasFrames) return undefined
    const emissive = new Set(emissiveTiles(layout).map((item) => item.key))
    let request = 0
    const tick = () => {
      request = requestAnimationFrame(tick)
      if (drawn.current?.layout !== layout) return
      const time = performance.now() / 1000
      const view = visibleArea(anchorRef.current)
      const changed = []
      for (const item of animatedList) {
        // Off-screen tiles keep their last frame until they are in view again.
        if (view && !overlaps(item.area, view)) continue
        const index = frameAt(item.book, time + item.offset)
        const shown = shownFrames.current.get(item.key) ?? frameAt(item.book, (drawn.current.paintedAt ?? time) + item.offset)
        shownFrames.current.set(item.key, index)
        if (index === shown) continue
        const area = animatedArea(layout, item)
        if (area) changed.push({ ...item, area })
      }
      if (!changed.length) return
      const lit = changed.filter((item) => emissive.has(item.key))
      const { holes: liveHoles, ghost: liveGhost } = live.current
      const liveFaded = fadeLevels(fade.current, performance.now())
      const frames = framesRef.current
      if (frames) {
        const context = frames.getContext('2d')
        const areas = changed.length > MAX_TILE_REPAINTS ? [snapToPixels(view ?? bounds, bounds, frameScale)] : changed.map((item) => snapToPixels(item.area, bounds, frameScale))
        const pass = { layer: 'frames', time }
        for (const area of areas) drawBoard(context, transformFor(bounds, frameScale), layout, area, { ghost: liveGhost, faded: liveFaded, holes: liveHoles, pass })
      }
      const dark = darkRef.current
      if (dark && lit.length) {
        const context = dark.getContext('2d')
        const areas = lit.length > MAX_TILE_REPAINTS ? [snapToPixels(view ?? darkBounds, darkBounds, darkScale)] : lit.map((item) => snapToPixels(item.area, darkBounds, darkScale))
        for (const area of areas) drawDarkness(context, transformFor(darkBounds, darkScale), layout, area, { faded: liveFaded, time })
      }
    }
    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
  }, [playing, hasFrames, animatedList, layout, bounds, darkBounds, frameScale, darkScale])

  const box = (area) => ({ x: area.x, y: area.y, width: area.width, height: area.height, pointerEvents: 'none' })
  return (
    <>
      <foreignObject ref={anchorRef} {...box(bounds)}>
        <div className="tile-canvas">
          <canvas ref={floorRef} />
        </div>
      </foreignObject>
      {ground}
      <foreignObject {...box(bounds)}>
        <div className="tile-canvas">
          <canvas ref={blocksRef} />
          {hasFrames && <canvas ref={framesRef} />}
        </div>
      </foreignObject>
      {children}
      {darkness > 0 && (
        <foreignObject {...box(darkBounds)}>
          <div className="tile-canvas">
            <canvas ref={darkRef} />
          </div>
        </foreignObject>
      )}
    </>
  )
}
