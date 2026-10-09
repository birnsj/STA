// Exploration navigation on a map file's tile grid with continuous positions ({ x, y } in tiles, tile centres at whole
// numbers). Characters are circles that may not overlap a solid tile (walls, obstacles; anything outside the map counts
// as solid). Doorways are walkable tiles, so they need nothing special. Routes come from A* over the tiles and are then
// straightened wherever a character can walk directly.
import { blocksMovement } from '../combat/battleMap.js'
import data from '../data/adaptation/exploration/partyControl.json'

export const RADIUS = data.movement.radius
const SAMPLE_STEP = 0.1
const SQRT2 = Math.SQRT2

export const tileOf = (point) => ({ x: Math.round(point.x), y: Math.round(point.y) })
const solid = (map, x, y) => blocksMovement(map, { x, y })
export const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

// True when a circle of radius r at point overlaps no solid tile. Tile (tx, ty) covers tx - 0.5 .. tx + 0.5.
export function isClear(map, point, r = RADIUS) {
  for (let ty = Math.round(point.y - r); ty <= Math.round(point.y + r); ty++) {
    for (let tx = Math.round(point.x - r); tx <= Math.round(point.x + r); tx++) {
      if (!solid(map, tx, ty)) continue
      const dx = point.x - Math.min(Math.max(point.x, tx - 0.5), tx + 0.5)
      const dy = point.y - Math.min(Math.max(point.y, ty - 0.5), ty + 0.5)
      if (dx * dx + dy * dy < r * r) return false
    }
  }
  return true
}

// Whether a character could walk the straight line from a to b without touching a solid tile.
export function isClearLine(map, a, b) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / SAMPLE_STEP))
  for (let i = 1; i <= steps; i++) {
    if (!isClear(map, { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps })) return false
  }
  return true
}

// The farthest point along a -> b a character could walk to before touching a solid tile.
export function clearUpTo(map, a, b) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / SAMPLE_STEP))
  let last = a
  for (let i = 1; i <= steps; i++) {
    const point = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }
    if (!isClear(map, point)) return last
    last = point
  }
  return b
}

// Moves by delta one axis at a time, so a character pressed against a wall slides along it instead of stopping.
export function slide(map, from, delta) {
  if (!isClear(map, from)) return { x: from.x + delta.x, y: from.y + delta.y }
  let { x, y } = from
  if (isClear(map, { x: x + delta.x, y })) x += delta.x
  if (isClear(map, { x, y: y + delta.y })) y += delta.y
  return { x, y }
}

// The walkable tile nearest to a point (the point's own tile when it is walkable).
export function nearestWalkableTile(map, point) {
  const centre = tileOf(point)
  const maxRing = Math.max(map.width, map.height)
  for (let ring = 0; ring <= maxRing; ring++) {
    let best = null
    for (let y = centre.y - ring; y <= centre.y + ring; y++) {
      for (let x = centre.x - ring; x <= centre.x + ring; x++) {
        if (Math.max(Math.abs(x - centre.x), Math.abs(y - centre.y)) !== ring || solid(map, x, y)) continue
        const d = distance(point, { x, y })
        if (!best || d < best.d) best = { x, y, d }
      }
    }
    if (best) return { x: best.x, y: best.y }
  }
  return centre
}

const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
]

// Minimal binary heap of [priority, key].
function push(heap, item) {
  heap.push(item)
  let i = heap.length - 1
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (heap[parent][0] <= heap[i][0]) break
    ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
    i = parent
  }
}
function pop(heap) {
  const top = heap[0]
  const last = heap.pop()
  if (heap.length) {
    heap[0] = last
    let i = 0
    for (;;) {
      const l = i * 2 + 1
      const r = l + 1
      let smallest = i
      if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l
      if (r < heap.length && heap[r][0] < heap[smallest][0]) smallest = r
      if (smallest === i) break
      ;[heap[smallest], heap[i]] = [heap[i], heap[smallest]]
      i = smallest
    }
  }
  return top
}

// A* over walkable tiles (8 directions; a diagonal step may not cut a solid corner). When the goal can't be reached,
// the route ends at the reachable tile closest to it. Returns the tiles from start to the end, inclusive.
export function findTilePath(map, start, goal) {
  const key = (x, y) => y * map.width + x
  const heuristic = (x, y) => {
    const dx = Math.abs(x - goal.x)
    const dy = Math.abs(y - goal.y)
    return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy)
  }
  const startKey = key(start.x, start.y)
  const cost = new Map([[startKey, 0]])
  const previous = new Map()
  const heap = [[heuristic(start.x, start.y), startKey]]
  let closest = { key: startKey, h: heuristic(start.x, start.y) }
  while (heap.length) {
    const [, current] = pop(heap)
    const x = current % map.width
    const y = Math.floor(current / map.width)
    if (x === goal.x && y === goal.y) {
      closest = { key: current, h: 0 }
      break
    }
    const h = heuristic(x, y)
    if (h < closest.h) closest = { key: current, h }
    for (const [dx, dy, step] of NEIGHBOURS) {
      const nx = x + dx
      const ny = y + dy
      if (solid(map, nx, ny)) continue
      if (dx && dy && (solid(map, x + dx, y) || solid(map, x, y + dy))) continue
      const nextKey = key(nx, ny)
      const nextCost = cost.get(current) + step
      if (nextCost >= (cost.get(nextKey) ?? Infinity)) continue
      cost.set(nextKey, nextCost)
      previous.set(nextKey, current)
      push(heap, [nextCost + heuristic(nx, ny), nextKey])
    }
  }
  const tiles = []
  for (let k = closest.key; k !== undefined; k = previous.get(k)) tiles.unshift({ x: k % map.width, y: Math.floor(k / map.width) })
  return tiles
}

// Walking distance (in tiles) from one tile to every tile, as a Float32Array indexed y * width + x (Infinity =
// unreachable, or farther than `limit`: the search stops there, as on a big open map a whole-map search each time the
// leader steps onto a new tile stalls the game). Cached per map, start tile and limit, because followers ask about the
// same leader tile every frame.
const FIELD_CACHE_SIZE = 64
const fieldCache = new WeakMap()
export function walkingDistances(map, from, limit = Infinity) {
  let cache = fieldCache.get(map)
  if (!cache) fieldCache.set(map, (cache = new Map()))
  const cacheKey = `${from.x},${from.y},${limit}`
  const cached = cache.get(cacheKey)
  if (cached) return cached
  const field = new Float32Array(map.width * map.height).fill(Infinity)
  if (!solid(map, from.x, from.y)) {
    field[from.y * map.width + from.x] = 0
    const heap = [[0, from.y * map.width + from.x]]
    while (heap.length) {
      const [cost, current] = pop(heap)
      if (cost > field[current]) continue
      const x = current % map.width
      const y = Math.floor(current / map.width)
      for (const [dx, dy, step] of NEIGHBOURS) {
        const nx = x + dx
        const ny = y + dy
        if (solid(map, nx, ny) || (dx && dy && (solid(map, x + dx, y) || solid(map, x, y + dy)))) continue
        const next = ny * map.width + nx
        if (cost + step >= field[next] || cost + step > limit) continue
        field[next] = cost + step
        push(heap, [cost + step, next])
      }
    }
  }
  if (cache.size >= FIELD_CACHE_SIZE) cache.delete(cache.keys().next().value)
  cache.set(cacheKey, field)
  return field
}

export const walkingDistanceTo = (map, field, point) => {
  const { x, y } = tileOf(point)
  return x >= 0 && y >= 0 && x < map.width && y < map.height ? field[y * map.width + x] : Infinity
}

// Drops waypoints the character can skip by walking straight, so routes cut across rooms instead of zig-zagging.
function straighten(map, from, points) {
  const result = []
  let current = from
  let i = 0
  while (i < points.length) {
    let j = points.length - 1
    while (j > i && !isClearLine(map, current, points[j])) j--
    result.push(points[j])
    current = points[j]
    i = j + 1
  }
  return result
}

// The waypoints from a position to a target point. Ends on the target itself when it is reachable and clear, otherwise on
// the centre of the nearest reachable walkable tile (so a click on a wall walks up to it).
export function planRoute(map, from, target) {
  if (isClearLine(map, from, target)) return [target]
  const start = solid(map, tileOf(from).x, tileOf(from).y) ? nearestWalkableTile(map, from) : tileOf(from)
  const goal = nearestWalkableTile(map, target)
  const tiles = findTilePath(map, start, goal)
  const end = tiles[tiles.length - 1]
  const reached = end.x === goal.x && end.y === goal.y
  const points = tiles.slice(1)
  const finish = reached && isClear(map, target) ? target : end
  if (points.length) points[points.length - 1] = finish
  else points.push(finish)
  return straighten(map, from, points)
}
