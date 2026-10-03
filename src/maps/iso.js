// Isometric projection shared by every map view (the map editor and combat boards): 64x64 world tiles drawn as 64x32 diamonds.
import { getTile, TILE_IMAGE } from './mapFormat.js'

export const TILE_W = 64
export const TILE_H = 32

export const project = ({ x, y }) => ({ x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 })
export const pts = (list) => list.map(([x, y]) => `${x},${y}`).join(' ')

export function diamond(position, lift = 0, scale = 1) {
  const c = project(position)
  const w = (TILE_W / 2) * scale
  const h = (TILE_H / 2) * scale
  return [[c.x, c.y - h - lift], [c.x + w, c.y - lift], [c.x, c.y + h - lift], [c.x - w, c.y - lift]]
}

// Where a tile PNG goes so its floor diamond (the bottom 64x32 of the image) covers the tile.
export function tileImageBox(position) {
  const c = project(position)
  return { x: c.x - TILE_IMAGE.width / 2, y: c.y + TILE_H / 2 - TILE_IMAGE.height, width: TILE_IMAGE.width, height: TILE_IMAGE.height }
}

// World rectangle around a map with some margin, for the camera.
export const mapBounds = (map, margin) => ({
  minX: -(map.height * TILE_W) / 2 - margin,
  maxX: (map.width * TILE_W) / 2 + margin,
  minY: -TILE_H * 2 - margin,
  maxY: ((map.width + map.height) * TILE_H) / 2 + margin,
})

export const isBlock = (tileId) => getTile(tileId).height > 0

// Front bulkheads (bottom row, right column) stay low and interior ones half height, so walls never hide the room.
export function tileImage(map, { x, y }) {
  const tile = getTile(map.tiles[y][x])
  if (tile.heightVariants) {
    if (y === map.height - 1 || x === map.width - 1) return tile.heightVariants.low
    if (y !== 0 && x !== 0) return tile.heightVariants.mid
  }
  if (tile.altImage && (x + y) % 2) return tile.altImage
  return tile.image
}
