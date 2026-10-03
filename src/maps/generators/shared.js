// Helpers shared by Generate Map's layout types. Every helper works on a mutable tile grid (tiles[y][x] = tile id)
// that the layout owns. Rects are { x0, x1, y0, y1 } with inclusive edges.
import { getTile } from '../mapFormat.js'

// Enough for either combat type's roster (Type 1 fields 4 enemies, Type 2 fields 2).
export const MARKERS_PER_SIDE = 4
export const DOOR_TILE = 'doorway'
export const CRATE_TILE = 'crate'
export const MACHINERY_TILE = 'machinery'
export const HAZARD_TILE = 'grating'
export const CONTROL_TILE = 'epsControl'
export const PREFAB_WALL_TILE = 'prefabWall'
// A room's floor is at least MIN_ROOM tiles across.
export const MIN_ROOM = 3

export const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

export const key = ({ x, y }) => `${x},${y}`
export const randomInt = (random, min, max) => min + Math.floor(random() * (max - min + 1))
export function shuffle(list, random) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export const makeGrid = (width, height, tileAt) => Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => tileAt(x, y)))

export function roomCells(room) {
  const cells = []
  for (let y = room.y0; y <= room.y1; y++) for (let x = room.x0; x <= room.x1; x++) cells.push({ x, y })
  return cells
}

export const neighboursOf = ({ x, y }) => NEIGHBOURS.map(([dx, dy]) => ({ x: x + dx, y: y + dy }))

// True when every walkable tile can reach every other, so a placed prop never seals off part of the map.
export function isConnected(tiles) {
  const open = []
  tiles.forEach((row, y) => row.forEach((id, x) => !getTile(id).solid && open.push({ x, y })))
  if (!open.length) return true
  return walkDistances(tiles, open[0]).size === open.length
}

// Walking distance (in steps) from start to every walkable tile it can reach, keyed by key().
export function walkDistances(tiles, start) {
  const distances = new Map([[key(start), 0]])
  const queue = [start]
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i]
    for (const next of neighboursOf(cell)) {
      const id = tiles[next.y]?.[next.x]
      if (id === undefined || getTile(id).solid || distances.has(key(next))) continue
      distances.set(key(next), distances.get(key(cell)) + 1)
      queue.push(next)
    }
  }
  return distances
}

// Places solid tiles only if the map stays connected; returns whether they went in.
export function placeSolid(tiles, cells, tileId) {
  const previous = cells.map(({ x, y }) => tiles[y][x])
  cells.forEach(({ x, y }) => (tiles[y][x] = tileId))
  if (isConnected(tiles)) return true
  cells.forEach(({ x, y }, i) => (tiles[y][x] = previous[i]))
  return false
}

// floor: the tile id that counts as empty ground here. keep: tiles (by key) that must stay clear, like doorway approaches.
export const isFree = (tiles, keep, cell, floor) => tiles[cell.y]?.[cell.x] === floor && !keep.has(key(cell))
const against = (tiles, cell, walls) => neighboursOf(cell).some(({ x, y }) => walls.has(tiles[y]?.[x]))

// Splits a run of floor into rooms about `span` tiles across, separated by one-tile walls; returns [first, last] per room.
export function splitAxis(start, length, random, span = 6) {
  const count = Math.max(1, Math.min(Math.round((length + 1) / (span + 1)), Math.floor((length + 1) / (MIN_ROOM + 1))))
  const floor = length - (count - 1)
  const sizes = Array.from({ length: count }, (_, i) => Math.floor(floor / count) + (i < floor % count ? 1 : 0))
  for (let i = 0; i < count - 1; i++) {
    const shift = randomInt(random, -2, 2)
    if (sizes[i] + shift >= MIN_ROOM && sizes[i + 1] - shift >= MIN_ROOM) {
      sizes[i] += shift
      sizes[i + 1] -= shift
    }
  }
  let next = start
  return sizes.map((size) => {
    const range = [next, next + size - 1]
    next += size + 1
    return range
  })
}

// Crates and machinery stand against the room's walls (any id in `walls`), clear of `keep`, and take at most
// 1 / density of its floor.
export function furnishRoom(tiles, keep, room, random, { floor, walls, density = 6 }) {
  let budget = Math.floor(roomCells(room).length / density)
  const wallSide = () => shuffle(roomCells(room), random).filter((cell) => isFree(tiles, keep, cell, floor) && against(tiles, cell, walls))

  if (budget >= 3 && random() < 0.6) {
    for (const start of wallSide()) {
      // Runs along the wall it is against.
      const horizontal = walls.has(tiles[start.y - 1]?.[start.x]) || walls.has(tiles[start.y + 1]?.[start.x])
      const run = Array.from({ length: randomInt(random, 2, 3) }, (_, i) => (horizontal ? { x: start.x + i, y: start.y } : { x: start.x, y: start.y + i }))
      const fits = run.every((cell) => cell.x <= room.x1 && cell.y <= room.y1 && isFree(tiles, keep, cell, floor) && against(tiles, cell, walls))
      if (fits && placeSolid(tiles, run, MACHINERY_TILE)) {
        budget -= run.length
        break
      }
    }
  }
  for (const cell of wallSide()) {
    if (budget <= 0) break
    if (isFree(tiles, keep, cell, floor) && placeSolid(tiles, [cell], CRATE_TILE)) budget--
  }
}

// One EPS grating patch with its conduit control beside it, in the first rect (in the order given) with space for it.
// The patch stays a tile clear of the rect's edges so there is room around it. Returns whether it was placed.
export function placeHazard(tiles, keep, rects, random, floor) {
  for (const rect of rects) {
    const width = rect.x1 - rect.x0 + 1
    const height = rect.y1 - rect.y0 + 1
    const size = width >= 5 && height >= 5 ? 3 : width >= 4 && height >= 4 ? 2 : 0
    if (!size) continue
    const corners = []
    for (let y = rect.y0 + 1; y <= rect.y1 - size; y++) for (let x = rect.x0 + 1; x <= rect.x1 - size; x++) corners.push({ x, y })
    for (const corner of shuffle(corners, random)) {
      const patch = roomCells({ x0: corner.x, x1: corner.x + size - 1, y0: corner.y, y1: corner.y + size - 1 })
      if (!patch.every((cell) => isFree(tiles, keep, cell, floor))) continue
      patch.forEach(({ x, y }) => (tiles[y][x] = HAZARD_TILE))
      const inPatch = new Set(patch.map(key))
      const beside = patch.flatMap(neighboursOf).filter((cell) => !inPatch.has(key(cell)) && isFree(tiles, keep, cell, floor))
      if (shuffle(beside, random).some((cell) => placeSolid(tiles, [cell], CONTROL_TILE))) return true
      patch.forEach(({ x, y }) => (tiles[y][x] = floor))
    }
  }
  return false
}

// Markers go on plain walkable tiles: not solid, not a hazard or doorway.
export const isMarkerTile = (id) => id !== DOOR_TILE && !getTile(id).solid && !getTile(id).role
export const markerCells = (tiles, cells) => cells.filter(({ x, y }) => isMarkerTile(tiles[y][x]))

// Up to MARKERS_PER_SIDE distinct tiles from each list; a tile in both goes to the players.
export function pickMarkers(playerCells, enemyCells, random) {
  const playerStarts = shuffle(playerCells, random).slice(0, MARKERS_PER_SIDE)
  const taken = new Set(playerStarts.map(key))
  const enemySpawns = shuffle(
    enemyCells.filter((cell) => !taken.has(key(cell))),
    random,
  ).slice(0, MARKERS_PER_SIDE)
  return { playerStarts, enemySpawns }
}

// Players among the cells with the lowest distance(cell), enemies among the highest; the two pools never overlap.
export function markersAtEnds(cells, distance, random) {
  const sorted = [...cells].sort((a, b) => distance(a) - distance(b))
  const pool = Math.min(MARKERS_PER_SIDE * 3, Math.floor(sorted.length / 2))
  return pickMarkers(sorted.slice(0, pool), sorted.slice(sorted.length - pool), random)
}

// One label per region (while names last), on the region's first walkable tile. regions: arrays of cells.
export function labelRegions(tiles, regions, names, random) {
  const shuffled = shuffle(names, random)
  return regions.slice(0, shuffled.length).flatMap((cells, i) => {
    const position = cells.find(({ x, y }) => !getTile(tiles[y][x]).solid)
    return position ? [{ name: shuffled[i], position }] : []
  })
}

// A prefab building on `rect` (its outer walls): wall ring, deck-plating interior, one doorway on `side`
// ('top' | 'bottom' | 'left' | 'right'), never in a corner. Adds the tiles either side of the doorway to keep.
// Returns { room: interior rect, door, outside: the tile just outside the doorway }.
export function placeBuilding(tiles, keep, rect, side, random, { wall = PREFAB_WALL_TILE, floor = 'floor' } = {}) {
  roomCells(rect).forEach(({ x, y }) => (tiles[y][x] = x === rect.x0 || x === rect.x1 || y === rect.y0 || y === rect.y1 ? wall : floor))
  const along = side === 'top' || side === 'bottom'
  const offset = along ? randomInt(random, rect.x0 + 1, rect.x1 - 1) : randomInt(random, rect.y0 + 1, rect.y1 - 1)
  const door = {
    top: { x: offset, y: rect.y0 },
    bottom: { x: offset, y: rect.y1 },
    left: { x: rect.x0, y: offset },
    right: { x: rect.x1, y: offset },
  }[side]
  const step = DOOR_STEP[side]
  const outside = { x: door.x + step[0], y: door.y + step[1] }
  const inside = { x: door.x - step[0], y: door.y - step[1] }
  tiles[door.y][door.x] = DOOR_TILE
  keep.add(key(outside)).add(key(inside))
  return { room: { x0: rect.x0 + 1, x1: rect.x1 - 1, y0: rect.y0 + 1, y1: rect.y1 - 1 }, door, outside }
}

// True when rect plus a one-tile margin lies inside the map (a tile in from the edge) on tiles that are all `floor`.
export function rectIsClear(tiles, rect, floor) {
  const width = tiles[0].length
  const height = tiles.length
  if (rect.x0 < 1 || rect.y0 < 1 || rect.x1 > width - 2 || rect.y1 > height - 2) return false
  return roomCells({ x0: rect.x0 - 1, x1: rect.x1 + 1, y0: rect.y0 - 1, y1: rect.y1 + 1 }).every(({ x, y }) => tiles[y][x] === floor)
}

// Tries random spots for up to `count` buildings whose outer size falls in `size` ({ minW, maxW, minH, maxH }), on clear
// `floor` with a gap around each so the ground between them stays connected. doorSide(rect) picks the doorway's wall.
// Returns the placed buildings: { rect, room, door, outside }.
export function placeBuildings(tiles, keep, count, size, random, floor, doorSide, { wall } = {}) {
  const width = tiles[0].length
  const height = tiles.length
  const placed = []
  for (let attempt = 0; attempt < 200 && placed.length < count; attempt++) {
    const w = randomInt(random, size.minW, size.maxW)
    const h = randomInt(random, size.minH, size.maxH)
    if (w > width - 2 || h > height - 2) continue
    const x0 = randomInt(random, 1, width - 1 - w)
    const y0 = randomInt(random, 1, height - 1 - h)
    const rect = { x0, x1: x0 + w - 1, y0, y1: y0 + h - 1 }
    if (!rectIsClear(tiles, rect, floor)) continue
    placed.push({ rect, ...placeBuilding(tiles, keep, rect, doorSide(rect), random, { wall }) })
  }
  return placed
}

// The ring of tiles just outside a rect, clipped to the map.
export function ringAround(tiles, rect) {
  return roomCells({ x0: rect.x0 - 1, x1: rect.x1 + 1, y0: rect.y0 - 1, y1: rect.y1 + 1 }).filter(
    ({ x, y }) => (x < rect.x0 || x > rect.x1 || y < rect.y0 || y > rect.y1) && tiles[y]?.[x] !== undefined,
  )
}

// A rect grown by `by` tiles on every side, clipped to the map.
export const grow = (tiles, rect, by) => ({
  x0: Math.max(0, rect.x0 - by),
  x1: Math.min(tiles[0].length - 1, rect.x1 + by),
  y0: Math.max(0, rect.y0 - by),
  y1: Math.min(tiles.length - 1, rect.y1 + by),
})

// Lays `tileId` from `start` one step at a time in `step` direction while the tiles are `floor`, for at most `max` tiles.
export function layLine(tiles, start, step, tileId, floor, max = Infinity) {
  let cell = start
  for (let laid = 0; laid < max && tiles[cell.y]?.[cell.x] === floor; laid++) {
    tiles[cell.y][cell.x] = tileId
    cell = { x: cell.x + step[0], y: cell.y + step[1] }
  }
}

export const DOOR_STEP = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }

export const allCells = (tiles) => tiles.flatMap((row, y) => row.map((_, x) => ({ x, y })))

// Grows an irregular patch of up to `size` tiles of `tileId` outward from `start` over free `floor` tiles (a pool, a grove,
// a mesa). Solid tiles go in one at a time and only where the map stays connected. Returns the cells placed.
export function growBlob(tiles, keep, start, size, tileId, floor, random) {
  const solid = getTile(tileId).solid
  const placed = []
  const frontier = [start]
  const seen = new Set([key(start)])
  while (frontier.length && placed.length < size) {
    const cell = frontier.splice(Math.floor(random() * frontier.length), 1)[0]
    if (!isFree(tiles, keep, cell, floor)) continue
    if (solid) {
      if (!placeSolid(tiles, [cell], tileId)) continue
    } else tiles[cell.y][cell.x] = tileId
    placed.push(cell)
    for (const next of neighboursOf(cell)) {
      if (seen.has(key(next)) || tiles[next.y]?.[next.x] === undefined) continue
      seen.add(key(next))
      frontier.push(next)
    }
  }
  return placed
}

// A wandering line `thickness` tiles wide from one edge of the map to the opposite one (a river, a crevasse, a trail).
// Solid tiles that would cut the map in two are skipped, which always leaves one crossing; `crossings` adds more gaps.
export function wanderAcross(tiles, keep, tileId, floor, random, { thickness = 1, horizontal = random() < 0.5, crossings = 0 } = {}) {
  const width = tiles[0].length
  const height = tiles.length
  const [length, span] = horizontal ? [width, height] : [height, width]
  let offset = randomInt(random, Math.floor(span / 4), Math.ceil((span * 3) / 4) - 1)
  const solid = getTile(tileId).solid
  const gaps = new Set(Array.from({ length: crossings }, () => randomInt(random, 1, length - 2)))
  for (let along = 0; along < length; along++) {
    // A sideways step also fills the tile it steps from, so the line joins edge to edge instead of corner to corner.
    const previous = offset
    if (random() < 0.35) offset = Math.min(span - 2, Math.max(1, offset + (random() < 0.5 ? -1 : 1)))
    if (gaps.has(along)) continue
    const first = Math.min(previous, offset)
    for (let t = 0; t < thickness + Math.abs(offset - previous); t++) {
      const cell = horizontal ? { x: along, y: first + t } : { x: first + t, y: along }
      if (!isFree(tiles, keep, cell, floor)) continue
      if (solid) placeSolid(tiles, [cell], tileId)
      else tiles[cell.y][cell.x] = tileId
    }
  }
}

// A biome's natural features (see biomes.json) on free `floor` tiles, in order. scale thins them out for settlements;
// lines (rivers, crevasses) always get at least one when scale is above 0.
export function applyFeatures(tiles, keep, features, floor, random, scale = 1) {
  if (scale <= 0) return
  const area = tiles.length * tiles[0].length
  const spots = shuffle(allCells(tiles), random)
  let next = 0
  for (const feature of features) {
    const count = Math.round((area / (feature.per ?? 1)) * scale)
    if (feature.kind === 'blob') {
      for (let i = count; i > 0; i--) {
        const tile = feature.tiles[randomInt(random, 0, feature.tiles.length - 1)]
        growBlob(tiles, keep, spots[next++ % spots.length], randomInt(random, feature.size[0], feature.size[1]), tile, floor, random)
      }
    } else if (feature.kind === 'scatter') {
      scatter(tiles, keep, count, feature.tile, random, floor)
    } else if (feature.kind === 'line') {
      for (let i = Math.max(1, count); i > 0; i--) wanderAcross(tiles, keep, feature.tile, floor, random, { thickness: feature.thickness, crossings: feature.crossings })
    } else if (feature.kind === 'fringe') {
      const around = allCells(tiles).filter(({ x, y }) => tiles[y][x] === feature.around)
      for (const cell of shuffle(around.flatMap(neighboursOf), random)) {
        if (isFree(tiles, keep, cell, floor) && random() < feature.chance) placeSolid(tiles, [cell], feature.tile)
      }
    }
  }
}

// Open-ground markers: players near one corner, enemies near the diagonally opposite one (either diagonal, either way round).
export function cornerMarkers(tiles, random) {
  const width = tiles[0].length
  const height = tiles.length
  const flipX = random() < 0.5
  const flipY = random() < 0.5
  const corner = ({ x, y }) => (flipX ? width - 1 - x : x) + (flipY ? height - 1 - y : y)
  return markersAtEnds(markerCells(tiles, allCells(tiles)), corner, random)
}

// Labels for three zones of an open map: the top-left third, the bottom-right third and the middle.
export function zoneLabels(tiles, names, random) {
  const width = tiles[0].length
  const height = tiles.length
  const third = (n) => Math.max(1, Math.floor(n / 3))
  const zones = [
    { x0: 0, x1: third(width) - 1, y0: 0, y1: third(height) - 1 },
    { x0: width - third(width), x1: width - 1, y0: height - third(height), y1: height - 1 },
    { x0: third(width), x1: width - 1 - third(width), y0: third(height), y1: height - 1 - third(height) },
  ].filter((zone) => zone.x0 <= zone.x1 && zone.y0 <= zone.y1)
  return labelRegions(tiles, zones.map(roomCells), names, random)
}

// Scatters `count` single solid tiles of `tileId` on free `floor` tiles that `where` accepts, keeping the map connected.
export function scatter(tiles, keep, count, tileId, random, floor, where = () => true) {
  const cells = shuffle(
    tiles.flatMap((row, y) => row.map((_, x) => ({ x, y }))),
    random,
  )
  let placed = 0
  for (const cell of cells) {
    if (placed >= count) break
    if (where(cell) && isFree(tiles, keep, cell, floor) && placeSolid(tiles, [cell], tileId)) placed++
  }
  return placed
}
