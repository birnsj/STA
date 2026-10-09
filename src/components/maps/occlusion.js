// The play views draw the map into canvases (MapCanvas.jsx) and their figures (units, markers) in SVG over it. So that
// a wall in front of a figure still hides it, each group of figures gets a window: inside it the canvas leaves out the
// blocks in front of the group's nearest-back figure (a hole), and the SVG draws those blocks itself, clipped to the
// window and depth-sorted with the figures in painter's order. Everywhere else the canvas draws every block.
// Windows are snapped out to a coarse grid, so a walking figure changes its hole (and the canvas repaints) only now and
// then. Presentation only.
import { useMemo } from 'react'
import { project } from '../../maps/iso.js'

const GRID = 32

// The world rect a figure is drawn in round its ground point: left, top, right and bottom of it.
export function around(position, left, top, right = left, bottom = 16) {
  const c = project(position)
  return { x: c.x - left, y: c.y - top, width: left + right, height: top + bottom }
}
// Half the width of a line of the figures' small labels.
export const labelHalfWidth = (text) => (text ? text.length * 3 + 8 : 0)

const snapOut = ({ x, y, width, height }) => {
  const x0 = Math.floor(x / GRID) * GRID
  const y0 = Math.floor(y / GRID) * GRID
  return { x: x0, y: y0, width: Math.ceil((x + width) / GRID) * GRID - x0, height: Math.ceil((y + height) / GRID) * GRID - y0 }
}
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
function union(a, b) {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
}

// figures: [{ depth (painter's, as the blocks' x + y), box (the world rect it is drawn in) }]. Returns the windows,
// none overlapping: [{ area, depth (blocks deeper than this are drawn over the figures), figures (their indexes) }].
export function occlusionGroups(figures) {
  let groups = figures.map((figure, i) => ({ area: snapOut(figure.box), figures: [i] }))
  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < groups.length && !merged; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (!overlaps(groups[i].area, groups[j].area)) continue
        groups[i] = { area: union(groups[i].area, groups[j].area), figures: [...groups[i].figures, ...groups[j].figures] }
        groups = groups.filter((_, k) => k !== j)
        merged = true
        break
      }
    }
  }
  return groups.map((group) => ({ ...group, depth: Math.floor(Math.min(...group.figures.map((i) => figures[i].depth))) }))
}

// The windows as MapCanvas holes ([{ area, depth }]), kept the same array while their contents are, since the views
// work the windows out every render and the canvas repaints when its holes change.
export function useHoles(groups) {
  const key = groups.map(({ area, depth }) => [area.x, area.y, area.width, area.height, depth].join(',')).join(';')
  return useMemo(
    () =>
      key
        ? key.split(';').map((part) => {
            const [x, y, width, height, depth] = part.split(',').map(Number)
            return { area: { x, y, width, height }, depth }
          })
        : [],
    [key],
  )
}
