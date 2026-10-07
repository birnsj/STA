// Tall walls and objects and see-through blocks (exploration and Combat Type 1). Presentation only: nothing here changes
// movement, sight or cover. tiles.json: wall and tall (drawn wallHeightScale times as tall), big (2x2 squares drawn as
// one object twice the size, bigObjects.js), fade (see-through while hiding a party member).
import { BIG_SCALE } from './bigObjects.js'
import { project, TILE_H, TILE_W } from './iso.js'
import { getTile, TILE_IMAGE, TILES, WALL_HEIGHT_SCALE } from './mapFormat.js'

// How far above a standing figure's feet it is drawn (the portrait token is about 52px tall, the lead badge above it).
const FIGURE_TOP = 60
const FIGURE_HALF_WIDTH = 17

// The drawn height of a single block: walls and tall objects are scaled when tall walls are on.
export const drawnHeight = (tile, tall) => (tall && (tile.wall || tile.tall) ? tile.height * WALL_HEIGHT_SCALE : tile.height)

// The most tall walls, tall objects and big objects reach above a single tile's image, for camera bounds.
const tallestScaled = Math.max(0, ...TILES.filter((tile) => tile.wall || tile.tall).map((tile) => tile.height))
const bigReach = TILES.some((tile) => tile.big) ? (BIG_SCALE - 1) * TILE_IMAGE.height - TILE_H : 0
export const TALL_WALL_EXTRA = Math.max((WALL_HEIGHT_SCALE - 1) * tallestScaled, bigReach)

// The screen shape a block is drawn in: depth (painter's x + y of its nearest tile), centre x, top, bottom, half width.
function blockShape({ x, y }, tile, tall, origin) {
  if (origin) {
    const centre = project({ x: origin.x + 0.5, y: origin.y + 0.5 })
    return { depth: origin.x + origin.y + 2, x: centre.x, top: centre.y - TILE_H - BIG_SCALE * tile.height, bottom: centre.y + TILE_H, halfWidth: TILE_W }
  }
  const base = project({ x, y })
  return { depth: x + y, x: base.x, top: base.y - TILE_H / 2 - drawnHeight(tile, tall), bottom: base.y + TILE_H / 2, halfWidth: TILE_W / 2 }
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
export function fadedBlockKeys(map, points, tall, bigGroups = null) {
  const keys = new Set()
  if (!points.length) return keys
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = getTile(map.tiles[y][x])
      if (!tile.fade || tile.height <= 0) continue
      const shape = blockShape({ x, y }, tile, tall, bigGroups?.get(`${x},${y}`))
      if (points.some((point) => hides(shape, point))) keys.add(`${x},${y}`)
    }
  }
  return keys
}
