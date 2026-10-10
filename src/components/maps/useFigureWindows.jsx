import { useEffect, useId, useMemo, useState } from 'react'
import { blocksIn } from './canvasTiles.js'
import { fadeLevels, retarget, settle } from './fadeLevels.js'
import { WallBlock } from './IsoTiles.jsx'
import { occlusionGroups, useHoles } from './occlusion.js'

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// The play views' figures standing among the map's blocks (occlusion.js): figures ([{ depth, box, element }], depth
// as the blocks' painter's x + y, box the world rect it is drawn in) gathered into windows, each drawn with the blocks
// in front of its figures, clipped to the window. Returns { holes } for MapCanvas and { windows }, its children: one
// list of every window's figures and blocks in painter's order (the windows never overlap, so one order serves them
// all), so a figure walking from one window into another stays the same element and keeps its state and animation.
// layout: canvasTiles.js boardLayout; faded: the Set of faded block keys MapCanvas draws. The window blocks fade in
// and out on MapCanvas's timing (fadeLevels.js), so the part of a wall inside a window never fades apart from the rest.
export default function useFigureWindows(layout, faded, figures) {
  const clipPrefix = useId()
  const groups = occlusionGroups(figures)
  const holes = useHoles(groups)
  // { fade (fadeLevels.js), now: the time it is drawn at }.
  const [{ fade, now }, setFade] = useState(() => ({ fade: { target: faded, changes: new Map() }, now: 0 }))
  // On the next frame, while the canvas's fade (started as MapCanvas renders) has barely begun.
  useEffect(() => {
    const request = requestAnimationFrame((time) => setFade((current) => ({ fade: retarget(current.fade, faded, time, !reducedMotion()), now: time })))
    return () => cancelAnimationFrame(request)
  }, [faded])
  // While blocks fade, a frame at a time until they have finished.
  const fading = fade.changes.size > 0
  useEffect(() => {
    if (!fading) return undefined
    let request = requestAnimationFrame(function step(time) {
      setFade((current) => ({ fade: settle(current.fade, time), now: time }))
      request = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(request)
  }, [fading])
  const shown = fading ? fadeLevels(fade, now) : fade.target
  // The blocks drawn in each window only change when the windows or the faded blocks do, not as the figures move
  // within them, so they are kept the same elements and React skips them.
  const windowBlocks = useMemo(() => {
    const { map, panels, bigGroups } = layout
    return holes.map((hole, index) =>
      blocksIn(layout, hole.area)
        .filter((block) => block.depth > hole.depth)
        .map((block) => ({
          depth: block.depth,
          element: (
            <g key={`w${index}b${block.key}`} clipPath={`url(#${clipPrefix}-window-${index})`}>
              <WallBlock map={map} position={block.position} faded={shown} panels={panels} bigGroups={bigGroups} />
            </g>
          ),
        })),
    )
  }, [layout, shown, holes, clipPrefix])
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
