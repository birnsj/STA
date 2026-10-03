// The hidden square logical grid under the battlefield. Positions are { x, y } (x = column, y = row).
// The map comes from a shared map file (src/maps/mapFormat.js); what each tile does comes from the shared tile catalogue.
import { getTile, WALL_TILE } from '../maps/mapFormat.js'

// Combat only needs the grid of a parsed map file.
export const toBattleMap = (mapFile) => ({ width: mapFile.width, height: mapFile.height, tiles: mapFile.tiles })

export const tileKey = ({ x, y }) => `${x},${y}`
export const samePosition = (a, b) => a.x === b.x && a.y === b.y
export const toPosition = ([x, y]) => ({ x, y })

export const isInside = (map, { x, y }) => x >= 0 && y >= 0 && x < map.width && y < map.height
export const tileAt = (map, position) => (isInside(map, position) ? map.tiles[position.y][position.x] : WALL_TILE)

// Solid tiles (walls, crates, machinery...) block movement; only tiles that block sight block line of fire.
export const blocksMovement = (map, position) => getTile(tileAt(map, position)).solid
export const blocksLineOfFire = (map, position) => getTile(tileAt(map, position)).blocksSight
export const givesCover = (map, position) => getTile(tileAt(map, position)).cover

export const NEIGHBOUR_OFFSETS = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
  [1, -1], [1, 1], [-1, 1], [-1, -1],
]

export const neighbours = (position) => NEIGHBOUR_OFFSETS.map(([dx, dy]) => ({ x: position.x + dx, y: position.y + dy }))
