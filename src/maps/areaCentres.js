import { getTile } from './mapFormat.js'
import { DOOR_TILE } from './generators/shared.js'

// The most of the map one area's room may cover before it counts as open ground (no walls around it), where the
// label stays on its own tile.
const MAX_ROOM_SHARE = 0.25

// Doorways are at most two tiles wide (designer decision, Oct 2026): a gap this narrow between two walls is a doorway
// even when it's plain floor (hand-drawn maps often leave a gap rather than a doorway tile).
const MAX_DOORWAY = 2

const key = (x, y) => `${x},${y}`
// A wall, as against a prop: it blocks sight and gives no cover (crates, consoles and chairs give cover).
const isWall = (id) => {
  const tile = getTile(id)
  return tile.solid && tile.blocksSight && !tile.cover
}

// The room around a tile: the walkable tiles reachable from it without crossing a wall or a doorway (a doorway tile, or
// a gap of up to MAX_DOORWAY tiles between walls). Null when it spills over more than MAX_ROOM_SHARE of the map.
export function roomAround(tiles, start) {
  const height = tiles.length
  const width = tiles[0]?.length ?? 0
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height
  // How many tiles in a row, through (x, y) along (dx, dy), lie between two walls; Infinity if the run reaches the edge.
  const runBetweenWalls = (x, y, dx, dy) => {
    let run = 1
    for (const sign of [1, -1]) {
      let cx = x + dx * sign
      let cy = y + dy * sign
      while (inside(cx, cy) && !isWall(tiles[cy][cx])) {
        run++
        cx += dx * sign
        cy += dy * sign
      }
      if (!inside(cx, cy)) return Infinity
    }
    return run
  }
  const isDoorway = (x, y) => tiles[y][x] === DOOR_TILE || runBetweenWalls(x, y, 1, 0) <= MAX_DOORWAY || runBetweenWalls(x, y, 0, 1) <= MAX_DOORWAY
  const open = (x, y) => inside(x, y) && !getTile(tiles[y][x]).solid && !isDoorway(x, y)
  if (!open(start.x, start.y)) return null
  const limit = Math.max(1, Math.floor(width * height * MAX_ROOM_SHARE))
  const seen = new Set([key(start.x, start.y)])
  const queue = [start]
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i]
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      if (!open(nx, ny) || seen.has(key(nx, ny))) continue
      seen.add(key(nx, ny))
      queue.push({ x: nx, y: ny })
      if (queue.length > limit) return null
    }
  }
  return queue
}

// Room floor around a point that may itself be a solid wall or prop: try the point, then its orthogonal neighbours,
// so an Environmental Control wall panel can still name the room beside it.
export function roomAroundProp(tiles, origin) {
  const direct = roomAround(tiles, origin)
  if (direct) return direct
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const room = roomAround(tiles, { x: origin.x + dx, y: origin.y + dy })
    if (room) return room
  }
  return null
}

// Where to draw each area's name on a top-down map: the middle of the room its tile is in (the box around the room's
// floor), or the area's own tile on open ground. Area positions are single tiles, often a room's corner (the
// generators label a room at its first walkable tile), so drawing at the position puts the name in a corner.
export function areaLabelCentres(tiles, areas) {
  return areas.map((area) => {
    const room = roomAround(tiles, area.position)
    if (!room) return area.position
    const xs = room.map((cell) => cell.x)
    const ys = room.map((cell) => cell.y)
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
  })
}
