import { useId, useMemo } from 'react'
import { blocksIn } from './canvasTiles.js'
import { WallBlock } from './IsoTiles.jsx'
import { occlusionGroups, useHoles } from './occlusion.js'

// The play views' figures standing among the map's blocks (occlusion.js): figures ([{ depth, box, element }], depth
// as the blocks' painter's x + y, box the world rect it is drawn in) gathered into windows, each drawn with the blocks
// in front of its figures, clipped to the window. Returns { holes } for MapCanvas and { windows }, its children.
// layout: canvasTiles.js boardLayout; faded: the Set of faded block keys MapCanvas draws.
export default function useFigureWindows(layout, faded, figures) {
  const clipPrefix = useId()
  const groups = occlusionGroups(figures)
  const holes = useHoles(groups)
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
            <g key={`b${block.key}`} clipPath={`url(#${clipPrefix}-window-${index})`}>
              <WallBlock map={map} position={block.position} faded={faded} panels={panels} bigGroups={bigGroups} />
            </g>
          ),
        })),
    )
  }, [layout, faded, holes, clipPrefix])
  const windows = groups.map((group, index) => {
    const clipId = `${clipPrefix}-window-${index}`
    const items = [...group.figures.map((i) => figures[i]), ...windowBlocks[index]].sort((a, b) => a.depth - b.depth)
    // A pixel wider than the canvas's hole, so no seam shows round it.
    const { x, y, width, height } = group.area
    return (
      <g key={clipId}>
        <clipPath id={clipId}>
          <rect x={x - 1} y={y - 1} width={width + 2} height={height + 2} />
        </clipPath>
        {items.map((item) => item.element)}
      </g>
    )
  })
  return { holes, windows }
}
