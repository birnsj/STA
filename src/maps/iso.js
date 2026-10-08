// Isometric projection shared by every map view (the map editor and combat boards): 64x64 world tiles drawn as 64x32 diamonds.
import { getTile, TILE_IMAGE } from './mapFormat.js'

export const TILE_W = 64
export const TILE_H = 32

export const project = ({ x, y }) => ({ x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 })
// The inverse of project: a world (screen-space) point back to continuous tile coordinates.
export const unproject = ({ x, y }) => ({ x: x / TILE_W + y / TILE_H, y: y / TILE_H - x / TILE_W })
export const pts = (list) => list.map(([x, y]) => `${x},${y}`).join(' ')

export function diamond(position, lift = 0, scale = 1) {
  const c = project(position)
  const w = (TILE_W / 2) * scale
  const h = (TILE_H / 2) * scale
  return [[c.x, c.y - h - lift], [c.x + w, c.y - lift], [c.x, c.y + h - lift], [c.x - w, c.y - lift]]
}

// Where a tile PNG of this size (mapFormat.js imageSize) goes so its floor diamond (the bottom 64x32 of the image)
// covers the tile.
export function tileImageBox(position, size = TILE_IMAGE) {
  const c = project(position)
  return { x: c.x - size.width / 2, y: c.y + TILE_H / 2 - size.height, width: size.width, height: size.height }
}

// World rectangle around a map with some margin, for the camera.
export const mapBounds = (map, margin) => ({
  minX: -(map.height * TILE_W) / 2 - margin,
  maxX: (map.width * TILE_W) / 2 + margin,
  minY: -TILE_H * 2 - margin,
  maxY: ((map.width + map.height) * TILE_H) / 2 + margin,
})

export const isBlock = (tileId) => getTile(tileId).height > 0

// A tile's image at a position: floors with an alternate image alternate in a checkerboard.
export function tileImage(map, { x, y }) {
  const tile = getTile(map.tiles[y][x])
  if (tile.altImage && (x + y) % 2) return tile.altImage
  return tile.image
}
