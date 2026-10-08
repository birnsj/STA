// Designer spec: movement = floor(Fitness / 2) + 1 tiles on a square grid; diagonal steps cost 1 (no penalty);
// obstacles block; nobody moves through an enemy's tile. Implementation detail: a diagonal step may not cut a wall
// or cover corner, and allies can be passed through but not stopped on.
import { blocksMovement, NEIGHBOUR_OFFSETS, samePosition, tileKey } from './battleMap.js'

// Book (Core pp.288–289): Move goes up to one zone (within Medium range), Sprint two zones (within Long range); no
// attribute sets the distance.
export const getMovementTiles = (character) => Math.floor(character.attributes.fitness / 2) + 1
// Designer decision (Oct 2026): Sprint (no roll, once per turn) goes twice the movement allowance, as two zones are twice one.
export const getSprintTiles = (character) => getMovementTiles(character) * 2

function canStep(map, from, offset, blockedKeys) {
  const [dx, dy] = offset
  const to = { x: from.x + dx, y: from.y + dy }
  if (blocksMovement(map, to) || blockedKeys.has(tileKey(to))) return null
  if (dx !== 0 && dy !== 0) {
    if (blocksMovement(map, { x: from.x + dx, y: from.y }) || blocksMovement(map, { x: from.x, y: from.y + dy })) return null
  }
  return to
}

// Breadth-first search (deterministic neighbour order). blockedKeys: tiles that cannot be entered (enemies);
// occupiedKeys: tiles that can be passed but not ended on (allies). Returns Map(key -> { position, steps, previousKey }).
export function getReachableTiles(map, start, maxSteps, { blockedKeys = new Set(), occupiedKeys = new Set() } = {}) {
  const visited = new Map([[tileKey(start), { position: start, steps: 0, previousKey: null }]])
  const queue = [start]
  while (queue.length) {
    const current = queue.shift()
    const { steps } = visited.get(tileKey(current))
    if (steps >= maxSteps) continue
    for (const offset of NEIGHBOUR_OFFSETS) {
      const next = canStep(map, current, offset, blockedKeys)
      if (!next || visited.has(tileKey(next))) continue
      visited.set(tileKey(next), { position: next, steps: steps + 1, previousKey: tileKey(current) })
      queue.push(next)
    }
  }
  for (const key of occupiedKeys) if (key !== tileKey(start)) visited.delete(key)
  return visited
}

// Passing through an ally's tile is allowed, so the path is rebuilt over the unfiltered search.
export function findPath(map, start, destination, maxSteps, blockers = {}) {
  const search = getReachableTiles(map, start, maxSteps, { blockedKeys: blockers.blockedKeys })
  if (blockers.occupiedKeys?.has(tileKey(destination)) && !samePosition(start, destination)) return null
  let entry = search.get(tileKey(destination))
  if (!entry) return null
  const path = []
  while (entry) {
    path.unshift(entry.position)
    entry = entry.previousKey ? search.get(entry.previousKey) : null
  }
  return path
}

// Steps along a path with no step limit: used by the AI to head toward a target it cannot reach this turn.
export function findPathUnlimited(map, start, destination, blockers = {}) {
  return findPath(map, start, destination, map.width * map.height, blockers)
}
