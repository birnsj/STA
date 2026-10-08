// Tall walls and objects and see-through blocks (exploration and Combat Type 1). Presentation only: nothing here changes
// movement, sight or cover. tiles.json: height (how tall a block stands), imageHeight (walls' and tall objects' taller
// images), big (2x2 squares drawn as one object twice the size, bigObjects.js), fade (see-through while hiding a party
// member).
import { BIG_IMAGE } from './bigObjects.js'
import { project, TILE_H, TILE_W } from './iso.js'
import { getTile, imageSize, TILE_IMAGE, TILES } from './mapFormat.js'

// How far above a standing figure's feet it is drawn (the portrait token is about 52px tall, the lead badge above it).
const FIGURE_TOP = 60
const FIGURE_HALF_WIDTH = 17

// The most any tile's drawing reaches above a standard tile image on the same tile (taller images, and big objects'
// images, which stand on a 2x2 footprint one row further forward), for camera bounds.
const tallest = Math.max(...TILES.map((tile) => imageSize(tile).height))
const bigReach = TILES.some((tile) => tile.big) ? BIG_IMAGE.height - TILE_IMAGE.height - TILE_H : 0
export const TALL_WALL_EXTRA = Math.max(tallest - TILE_IMAGE.height, bigReach)

// The screen shape a block is drawn in: depth (painter's x + y of its nearest tile), centre x, top, bottom, half width.
function blockShape({ x, y }, tile, origin) {
  if (origin) {
    const centre = project({ x: origin.x + 0.5, y: origin.y + 0.5 })
    return { depth: origin.x + origin.y + 2, x: centre.x, top: centre.y - TILE_H - tile.big.height, bottom: centre.y + TILE_H, halfWidth: TILE_W }
  }
  const base = project({ x, y })
  return { depth: x + y, x: base.x, top: base.y - TILE_H / 2 - tile.height, bottom: base.y + TILE_H / 2, halfWidth: TILE_W / 2 }
}

// A block hides a figure drawn behind it (figure depth x + y + 0.5, as the boards sort them) when the figure's token
// overlaps the block's drawn shape.
function hides(shape, point) {
  if (point.x + point.y + 0.5 >= shape.depth) return false
  const figure = project(point)
  return Math.abs(figure.x - shape.x) < shape.halfWidth + FIGURE_HALF_WIDTH && figure.y > shape.top && figure.y - FIGURE_TOP < shape.bottom
}

// Keys ('x,y') of the fading blocks that hide any of the points (party members' tile positions).
// bigGroups: getBigObjects(map) when big objects are drawn, so their tiles are tested against the whole object.
export function fadedBlockKeys(map, points, bigGroups = null) {
  const keys = new Set()
  if (!points.length) return keys
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = getTile(map.tiles[y][x])
      if (!tile.fade || tile.height <= 0) continue
      const shape = blockShape({ x, y }, tile, bigGroups?.get(`${x},${y}`))
      if (points.some((point) => hides(shape, point))) keys.add(`${x},${y}`)
    }
  }
  return keys
}
