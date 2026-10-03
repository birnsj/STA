// Combat Type 2 grid: its own tile types, movement, distance and line of sight (independent of Combat Type 1's battleMap).
// Positions are { x, y } (x = column, y = row). Diagonal steps cost 1 and distance counts diagonals as 1 (implementer default).
const TILE_TYPES = {
  '#': 'bulkhead',
  M: 'machinery',
  c: 'crate',
  E: 'epsControl',
  h: 'grating',
  D: 'doorway',
  '.': 'floor',
}

const SOLID = new Set(['bulkhead', 'machinery', 'crate', 'epsControl'])
const BLOCKS_SIGHT = new Set(['bulkhead', 'machinery'])
const GIVES_COVER = new Set(['machinery', 'crate', 'epsControl'])

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
export const tileAt = (map, position) => (isInside(map, position) ? map.tiles[position.y][position.x] : 'bulkhead')
export const isSolid = (map, position) => SOLID.has(tileAt(map, position))
export const blocksSight = (map, position) => BLOCKS_SIGHT.has(tileAt(map, position))
export const givesCover = (map, position) => GIVES_COVER.has(tileAt(map, position))

export const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
export const isAdjacent = (a, b) => distance(a, b) === 1

export const OFFSETS = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
  [1, -1], [1, 1], [-1, 1], [-1, -1],
]
export const neighbours = (position) => OFFSETS.map(([dx, dy]) => ({ x: position.x + dx, y: position.y + dy }))

export function tilesOfType(map, type) {
  const found = []
  map.tiles.forEach((row, y) => row.forEach((tile, x) => tile === type && found.push({ x, y })))
  return found
}

// Samples the straight line between tile centres; a bulkhead or machinery tile it crosses (other than the two ends) blocks sight.
export function lineOfSight(map, from, to) {
  if (samePosition(from, to)) return { clear: true, blockedAt: null }
  const steps = distance(from, to) * 4
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const point = { x: Math.round(from.x + (to.x - from.x) * t), y: Math.round(from.y + (to.y - from.y) * t) }
    if (samePosition(point, from) || samePosition(point, to)) continue
    if (blocksSight(map, point)) return { clear: false, blockedAt: point }
  }
  return { clear: true, blockedAt: null }
}

// A diagonal step may not cut the corner of a solid tile.
function canStep(map, from, [dx, dy], blocked) {
  const to = { x: from.x + dx, y: from.y + dy }
  if (isSolid(map, to) || blocked.has(tileKey(to))) return null
  if (dx && dy && (isSolid(map, { x: from.x + dx, y: from.y }) || isSolid(map, { x: from.x, y: from.y + dy }))) return null
  return to
}

// Breadth-first search. blocked: Set of tile keys that cannot be entered (other units, active hazard).
// Returns Map(key -> { position, steps, previousKey }).
export function reachableTiles(map, start, maxSteps, blocked = new Set()) {
  const visited = new Map([[tileKey(start), { position: start, steps: 0, previousKey: null }]])
  const queue = [start]
  while (queue.length) {
    const current = queue.shift()
    const { steps } = visited.get(tileKey(current))
    if (steps >= maxSteps) continue
    for (const offset of OFFSETS) {
      const next = canStep(map, current, offset, blocked)
      if (!next || visited.has(tileKey(next))) continue
      visited.set(tileKey(next), { position: next, steps: steps + 1, previousKey: tileKey(current) })
      queue.push(next)
    }
  }
  return visited
}

export function pathFrom(search, destination) {
  let entry = search.get(tileKey(destination))
  if (!entry) return null
  const path = []
  while (entry) {
    path.unshift(entry.position)
    entry = entry.previousKey ? search.get(entry.previousKey) : null
  }
  return path
}
