// The hidden square logical grid under the battlefield. Positions are { x, y } (x = column, y = row).
const TILE_TYPES = { '#': 'wall', c: 'cover', '.': 'floor' }

export function parseMap(rows) {
  return {
    width: rows[0].length,
    height: rows.length,
    tiles: rows.map((row) => [...row].map((symbol) => TILE_TYPES[symbol] ?? 'floor')),
  }
}

export const tileKey = ({ x, y }) => `${x},${y}`
export const samePosition = (a, b) => a.x === b.x && a.y === b.y
export const toPosition = ([x, y]) => ({ x, y })

export const isInside = (map, { x, y }) => x >= 0 && y >= 0 && x < map.width && y < map.height
export const tileAt = (map, position) => (isInside(map, position) ? map.tiles[position.y][position.x] : 'wall')

// Walls and cover objects both block movement; only walls block line of fire.
export const blocksMovement = (map, position) => tileAt(map, position) !== 'floor'
export const blocksLineOfFire = (map, position) => tileAt(map, position) === 'wall'

export const NEIGHBOUR_OFFSETS = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
  [1, -1], [1, 1], [-1, 1], [-1, -1],
]

export const neighbours = (position) => NEIGHBOUR_OFFSETS.map(([dx, dy]) => ({ x: position.x + dx, y: position.y + dy }))
