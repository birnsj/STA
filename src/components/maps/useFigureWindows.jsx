import { useEffect, useId, useMemo, useState } from 'react'
import { blocksIn } from './canvasTiles.js'
import { fadeLevels, retarget, settle } from './fadeLevels.js'
import { FadingWallBlock } from './IsoTiles.jsx'
import { occlusionGroups, useHoles } from './occlusion.js'

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// The window blocks' fade on MapCanvas's timing (fadeLevels.js), kept out of React state: while a wall fades, only the
// blocks subscribed to it (FadingWallBlock) re-render each frame. Holding it in the board's state re-rendered the whole
// board every frame of every fade, which made exploration and combat choppy.
function createFadeClock(faded) {
  let fade = { target: faded, changes: new Map() }
  let shown = faded
  let request = 0
  const listeners = new Set()
  const show = (time) => {
    fade = settle(fade, time)
    shown = fadeLevels(fade, time)
    listeners.forEach((listener) => listener())
    request = fade.changes.size ? requestAnimationFrame(show) : 0
  }
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get: () => shown,
    // On the next frame, while the canvas's fade (started as MapCanvas renders) has barely begun.
    retarget(next) {
      cancelAnimationFrame(request)
      request = requestAnimationFrame((time) => {
        fade = retarget(fade, next, time, !reducedMotion())
        show(time)
      })
    },
    stop: () => cancelAnimationFrame(request),
  }
}
// The play views' figures standing among the map's blocks (occlusion.js): figures ([{ depth, box, element }], depth
// as the blocks' painter's x + y, box the world rect it is drawn in) gathered into windows, each drawn with the blocks
// in front of its figures, clipped to the window. Returns { holes } for MapCanvas and { windows }, its children: one
// list of every window's figures and blocks in painter's order (the windows never overlap, so one order serves them
// all), so a figure walking from one window into another stays the same element and keeps its state and animation.
// layout: canvasTiles.js boardLayout; faded: the Set of faded block keys MapCanvas draws. The window blocks fade in
// and out on MapCanvas's timing (createFadeClock), so the part of a wall inside a window never fades apart from the rest.
export default function useFigureWindows(layout, faded, figures) {
  const clipPrefix = useId()
  const groups = occlusionGroups(figures)
  const holes = useHoles(groups)
  const [clock] = useState(() => createFadeClock(faded))
  useEffect(() => {
    clock.retarget(faded)
    return clock.stop
  }, [clock, faded])
  // The blocks drawn in each window only change when the windows do, not as the figures move within them or walls
  // fade, so they are kept the same elements and React skips them.
  const windowBlocks = useMemo(() => {
    const { map, panels, bigGroups } = layout
    return holes.map((hole, index) =>
      blocksIn(layout, hole.area)
        .filter((block) => block.depth > hole.depth)
        .map((block) => ({
          depth: block.depth,
          element: (
            <g key={`w${index}b${block.key}`} clipPath={`url(#${clipPrefix}-window-${index})`}>
              <FadingWallBlock fade={clock} map={map} position={block.position} panels={panels} bigGroups={bigGroups} />
            </g>
          ),
        })),
    )
  }, [layout, clock, holes, clipPrefix])
  const clips = groups.map((group, index) => {
    const clipId = `${clipPrefix}-window-${index}`
    // A pixel wider than the canvas's hole, so no seam shows round it.
    const { x, y, width, height } = group.area
    return (
      <clipPath key={clipId} id={clipId}>
        <rect x={x - 1} y={y - 1} width={width + 2} height={height + 2} />
      </clipPath>
    )
  })
  const items = groups.flatMap((group, index) => [...group.figures.map((i) => figures[i]), ...windowBlocks[index]]).sort((a, b) => a.depth - b.depth)
  const windows = [<defs key={`${clipPrefix}-clips`}>{clips}</defs>, ...items.map((item) => item.element)]
  return { holes, windows }
}
