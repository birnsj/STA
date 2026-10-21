// Ultima-8-style thin walls (halfBulkhead / halfBulkheadCorner): Generate Map places them for starship layouts, then
// this pass turns L and T junctions into corner pieces and sets rotated so each straight sits on the edge toward open
// floor (R / rotate mirrors onto the opposite edge). Which way a straight runs (x or y) is picked at draw time from
// its wall neighbours (tiles.json runImages). Prototype presentation, not a source-book rule.
import { getTile } from '../mapFormat.js'

export const HALF_WALL = 'halfBulkhead'
export const HALF_WALL_CORNER = 'halfBulkheadCorner'

const isHalf = (id) => id === HALF_WALL || id === HALF_WALL_CORNER

// 'x' when the wall continues along x (or is alone); 'y' when it only continues along y. Corners keep their own art.
export function wallRunAxis(map, { x, y }) {
  const wallAt = (cx, cy) => {
    if (cy < 0 || cy >= map.height || cx < 0 || cx >= map.width) return false
    return Boolean(getTile(map.tiles[cy][cx]).wall)
  }
  const alongX = wallAt(x - 1, y) || wallAt(x + 1, y)
  const alongY = wallAt(x, y - 1) || wallAt(x, y + 1)
  if (alongY && !alongX) return 'y'
  return 'x'
}

// The image for a thin-wall straight at this tile (runImages), or null when the tile has none.
export function wallRunImage(map, position) {
  const tile = getTile(map.tiles[position.y][position.x])
  if (!tile.runImages) return null
  return tile.runImages[wallRunAxis(map, position)] ?? tile.image
}

// After a layout that used halfBulkhead: corners become halfBulkheadCorner, and each piece is rotated so its thin face
// sits toward open floor when that is unambiguous.
export function finishHalfWalls(map) {
  const { width, height, tiles: src } = map
  if (!src.some((row) => row.some(isHalf))) return map

  const tiles = src.map((row) => [...row])
  const rotated = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => Boolean(map.rotated?.[y]?.[x])),
  )
  const wallAt = (x, y) => x >= 0 && y >= 0 && x < width && y < height && Boolean(getTile(tiles[y][x]).wall)
  const openAt = (x, y) => x >= 0 && y >= 0 && x < width && y < height && !getTile(tiles[y][x]).solid

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isHalf(tiles[y][x])) continue
      const n = wallAt(x, y - 1)
      const s = wallAt(x, y + 1)
      const e = wallAt(x + 1, y)
      const w = wallAt(x - 1, y)
      if ((n || s) && (e || w)) {
        tiles[y][x] = HALF_WALL_CORNER
        // Unrotated L sits on a=0 and b=0; mirror when the open corner is the other way.
        rotated[y][x] = openAt(x + 1, y) || openAt(x, y + 1)
      } else {
        tiles[y][x] = HALF_WALL
        // Horizontal run: flip when open floor is on +y. Vertical run: flip when open floor is on +x.
        if (e || w) rotated[y][x] = openAt(x, y + 1) && !openAt(x, y - 1)
        else if (n || s) rotated[y][x] = openAt(x + 1, y) && !openAt(x - 1, y)
        else rotated[y][x] = false
      }
    }
  }
  return { ...map, tiles, rotated }
}
