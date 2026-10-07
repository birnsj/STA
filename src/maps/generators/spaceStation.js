// Space Station: a bulkhead hull with a wide promenade across the middle and rooms above and below it, each opening
// onto the promenade. Small maps drop the lower band of rooms, then the rooms altogether.
// makeStationGenerator builds the same layout from other tiles (a cantina's hall and back rooms, a cell block).
import { FLOOR_TILE, WALL_TILE } from '../mapFormat.js'
import {
  CRATE_TILE,
  cutDoorway,
  DOOR_TILE,
  doorwayOffsets,
  furnishRoom,
  labelRegions,
  MACHINERY_TILE,
  makeGrid,
  markerCells,
  markersAtEnds,
  MIN_ROOM,
  pickMarkers,
  placeHazard,
  randomInt,
  roomCells,
  shuffle,
  splitAxis,
} from './shared.js'

const MIN_PROMENADE = 2

// Rows (inclusive ranges) for the upper rooms, the promenade and the lower rooms; a band is null when it doesn't fit.
function bands(innerHeight, random) {
  if (innerHeight >= MIN_ROOM * 2 + 2 + MIN_PROMENADE) {
    const promenade = Math.min(6, Math.max(MIN_PROMENADE, Math.round(innerHeight * 0.3)), innerHeight - MIN_ROOM * 2 - 2)
    const rooms = innerHeight - promenade - 2
    let upper = Math.floor(rooms / 2)
    const shift = randomInt(random, -1, 1)
    if (upper + shift >= MIN_ROOM && rooms - upper - shift >= MIN_ROOM) upper += shift
    const promenadeTop = 1 + upper + 1
    return { upper: [1, upper], promenade: [promenadeTop, promenadeTop + promenade - 1], lower: [promenadeTop + promenade + 1, innerHeight] }
  }
  if (innerHeight >= MIN_ROOM + 1 + MIN_PROMENADE) {
    const upper = innerHeight - 1 - MIN_PROMENADE
    return { upper: [1, upper], promenade: [upper + 2, innerHeight], lower: null }
  }
  return { upper: null, promenade: [1, innerHeight], lower: null }
}

// overrides: { floor, wall, door, crate, machinery, hazard (place the EPS grating and control), span (room width),
// furnishHall(tiles, keep, hall, random, style) / furnishRooms(tiles, keep, rooms, random, style) instead of the default
// crates and consoles }.
export function makeStationGenerator(overrides = {}) {
  const style = { floor: FLOOR_TILE, wall: WALL_TILE, door: DOOR_TILE, crate: CRATE_TILE, machinery: MACHINERY_TILE, hazard: true, span: 6, ...overrides }
  return (map, random, areaNames) => buildStation(map, random, areaNames, style)
}

// Crates and consoles line the promenade's walls; the rooms are furnished like deck rooms.
function defaultFurnishHall(tiles, keep, hall, random, { floor, wall, crate, machinery }) {
  furnishRoom(tiles, keep, hall, random, { floor, walls: new Set([wall]), density: 10, crate, machinery })
}
function defaultFurnishRooms(tiles, keep, rooms, random, { floor, wall, crate, machinery }) {
  rooms.forEach((room) => furnishRoom(tiles, keep, room, random, { floor, walls: new Set([wall]), crate, machinery }))
}

function buildStation(map, random, areaNames, style) {
  const { floor, wall, door: doorTile } = style
  const { width, height } = map
  const tiles = makeGrid(width, height, (x, y) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? wall : floor))
  const keep = new Set()
  const layout = bands(height - 2, random)
  const promenade = { x0: 1, x1: width - 2, y0: layout.promenade[0], y1: layout.promenade[1] }

  // Each band of rooms: walls between rooms, a wall along the promenade, and one doorway per room onto it.
  const roomBand = (rows, facesDown) => {
    if (!rows) return []
    const wallY = facesDown ? rows[1] + 1 : rows[0] - 1
    for (let x = 1; x < width - 1; x++) tiles[wallY][x] = wall
    const rooms = splitAxis(1, width - 2, random, style.span).map(([x0, x1]) => ({ x0, x1, y0: rows[0], y1: rows[1] }))
    rooms.slice(0, -1).forEach((room) => {
      for (let y = rows[0]; y <= rows[1]; y++) tiles[y][room.x1 + 1] = wall
    })
    rooms.forEach((room) => {
      const cells = doorwayOffsets(random, room.x0, room.x1).map((x) => ({ x, y: wallY }))
      cutDoorway(tiles, keep, cells, [0, 1], doorTile)
    })
    return rooms
  }
  const upperRooms = roomBand(layout.upper, true)
  const lowerRooms = roomBand(layout.lower, false)
  const rooms = [...upperRooms, ...lowerRooms]

  ;(style.furnishHall ?? defaultFurnishHall)(tiles, keep, promenade, random, style)
  ;(style.furnishRooms ?? defaultFurnishRooms)(tiles, keep, rooms, random, style)

  // Players in a room at one end and enemies in a room at the other (in the other band when there is one).
  const leftFirst = random() < 0.5
  const ends = (band) => (leftFirst ? [band[0], band[band.length - 1]] : [band[band.length - 1], band[0]])
  let playerRoom = null
  let enemyRoom = null
  if (upperRooms.length && lowerRooms.length) {
    const [upperEnd] = ends(upperRooms)
    const [, lowerEnd] = ends(lowerRooms)
    ;[playerRoom, enemyRoom] = random() < 0.5 ? [upperEnd, lowerEnd] : [lowerEnd, upperEnd]
  } else if (rooms.length > 1) {
    ;[playerRoom, enemyRoom] = ends(rooms)
  }

  if (style.hazard) {
    const markerRooms = new Set([playerRoom, enemyRoom])
    const sideRooms = shuffle(rooms.filter((room) => !markerRooms.has(room)), random)
    placeHazard(tiles, keep, [...sideRooms, promenade, ...shuffle(rooms.filter((room) => markerRooms.has(room)), random)], random, floor)
  }

  const markers = playerRoom
    ? pickMarkers(markerCells(tiles, roomCells(playerRoom)), markerCells(tiles, roomCells(enemyRoom)), random)
    : markersAtEnds(markerCells(tiles, roomCells(promenade)), ({ x }) => (leftFirst ? x : -x), random)
  const areas = labelRegions(tiles, [roomCells(promenade), ...rooms.map(roomCells)], areaNames, random)
  return { ...map, tiles, areas, markers }
}

export const generateSpaceStation = makeStationGenerator()
