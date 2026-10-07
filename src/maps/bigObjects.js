// Big objects (exploration and Combat Type 1). A 2x2 square of the same object marked big in tiles.json (boulders,
// trees, silos...) is drawn as one object at twice the size: a 2x2 footprint is exactly a single tile's diamond scaled
// by 2, so the tile's own PNG drawn 2x fits it. Presentation only: movement, sight and cover still read the single tiles.
import { getTile } from './mapFormat.js'

export const BIG_SCALE = 2

const key = (x, y) => `${x},${y}`

// Map of 'x,y' -> the group's origin (its top-left tile, { x, y }) for every tile drawn as part of a big object.
// Squares are claimed scanning row by row, so overlapping squares never share a tile; the rest stay single.
export function getBigObjects(map) {
  const groups = new Map()
  const free = (x, y, id) => x < map.width && y < map.height && map.tiles[y][x] === id && !groups.has(key(x, y))
  for (let y = 0; y + 1 < map.height; y++) {
    for (let x = 0; x + 1 < map.width; x++) {
      const id = map.tiles[y][x]
      if (!getTile(id).big || !free(x, y, id) || !free(x + 1, y, id) || !free(x, y + 1, id) || !free(x + 1, y + 1, id)) continue
      const origin = { x, y }
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) groups.set(key(x + dx, y + dy), origin)
    }
  }
  return groups
}

// Every tile ('x,y') of the big objects any of the keys belongs to: a big object fades as one.
export function fadeWholeBigObjects(faded, groups) {
  const whole = new Set(faded)
  for (const tileKey of faded) {
    const origin = groups.get(tileKey)
    if (origin) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) whole.add(key(origin.x + dx, origin.y + dy))
  }
  return whole
}
