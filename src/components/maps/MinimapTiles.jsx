import { useLayoutEffect, useRef } from 'react'
import { getTile, imageSize } from '../../maps/mapFormat.js'
import { loadImage } from './canvasTiles.js'
import './maps.css'

// Canvas pixels per tile: as many as fit MAX_PIXELS across the map, up to MAX_TILE_PIXELS.
const MAX_PIXELS = 2048
const MAX_TILE_PIXELS = 16

// A tile PNG (iso, 64 wide, mapFormat.js imageSize) seen from above: its top face (the floor diamond, raised by the
// block height for walls) unskewed onto a size x size square. The transform maps the face's corners top / right / left
// to the square's (0,0) / (1,0) / (0,1).
function topFace(tile, image, size) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  if (!image) return canvas
  const { width, height } = imageSize(tile)
  const top = height - 32 - (tile.height ?? 0)
  const context = canvas.getContext('2d')
  context.setTransform(size / 64, -size / 64, size / 32, size / 32, (-0.5 - top / 32) * size, (0.5 - top / 32) * size)
  context.drawImage(image, 0, 0, width, height)
  return canvas
}

// A map's tiles top down, one unit per tile with tile (x, y) centred on (x, y), for the minimaps (exploration, map editor).
// Drawn into one canvas, redrawn only when the tiles change: a big map has thousands of tiles, too many to keep as SVG
// elements in a view that re-renders as people move.
export default function MinimapTiles({ tiles }) {
  const canvasRef = useRef(null)
  const rows = tiles.length
  const columns = tiles[0]?.length ?? 0

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !rows || !columns) return undefined
    let cancelled = false
    const size = Math.max(1, Math.min(MAX_TILE_PIXELS, Math.floor(MAX_PIXELS / Math.max(rows, columns))))
    const ids = [...new Set(tiles.flat())]
    Promise.all(ids.map((id) => loadImage(getTile(id).image))).then((images) => {
      if (cancelled) return
      const faces = new Map(ids.map((id, i) => [id, topFace(getTile(id), images[i], size)]))
      canvas.width = columns * size
      canvas.height = rows * size
      const context = canvas.getContext('2d')
      tiles.forEach((row, y) => row.forEach((id, x) => context.drawImage(faces.get(id), x * size, y * size)))
    })
    return () => {
      cancelled = true
    }
  }, [tiles, rows, columns])

  return (
    <foreignObject x={-0.5} y={-0.5} width={columns} height={rows} pointerEvents="none">
      <div className="tile-canvas">
        <canvas ref={canvasRef} />
      </div>
    </foreignObject>
  )
}
