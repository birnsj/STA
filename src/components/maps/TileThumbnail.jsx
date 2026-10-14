import { useEffect, useRef } from 'react'
import { drawLoneTiles } from './canvasTiles.js'

// A tile as the board draws it, for the editor palette: walls and tall objects at their full height, and a wall with
// panels as a two-tile panel, with a window unless the wall has none (tiles.json windows). Drawn by canvasTiles.js
// drawLoneTiles, so it matches the board. Presentation only.
const RESOLUTION = 2

export default function TileThumbnail({ tile, className }) {
  const ref = useRef(null)
  useEffect(() => {
    let cancelled = false
    const positions = tile.panels ? [{ x: 0, y: 0 }, { x: 1, y: 0 }] : [{ x: 0, y: 0 }]
    const map = { width: positions.length, height: 1, tiles: [positions.map(() => tile.id)] }
    const hasWindow = tile.windows !== false
    const panels = new Map(tile.panels ? positions.map((position, half) => [`${position.x},${position.y}`, { axis: 'x', half, window: hasWindow }]) : [])
    drawLoneTiles({ map, panels, bigGroups: new Map() }, positions, RESOLUTION).then(({ canvas }) => {
      const target = ref.current
      if (cancelled || !target) return
      target.width = canvas.width
      target.height = canvas.height
      target.getContext('2d').drawImage(canvas, 0, 0)
    })
    return () => {
      cancelled = true
    }
  }, [tile])
  return <canvas ref={ref} className={className} aria-hidden="true" />
}
