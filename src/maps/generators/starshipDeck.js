// Starship Deck: a bulkhead hull split into a grid of rooms joined by doorways.
// Built in the order a deck is drawn by hand: hull, rooms, doorways, props, hazard, markers, labels.
// makeDeckGenerator builds the same layout from other tiles (a research lab, an alien vessel).
import { FLOOR_TILE, WALL_TILE } from '../mapFormat.js'
import {
  CRATE_TILE,
  DOOR_TILE,
  furnishRoom,
  key,
  labelRegions,
  MACHINERY_TILE,
  MARKERS_PER_SIDE,
  makeGrid,
  markerCells,
  pickMarkers,
  placeHazard,
  randomInt,
  roomCells,
  shuffle,
  splitAxis,
} from './shared.js'

// One doorway in every wall two rooms share, so each room is reachable. Returns the tiles either side of each
// doorway, which stay clear floor.
function connectRooms(tiles, grid, random) {
  const keep = new Set()
  grid.forEach((row) =>
    row.forEach((room, col) => {
      if (row[col + 1]) {
        const door = { x: room.x1 + 1, y: randomInt(random, room.y0, room.y1) }
        tiles[door.y][door.x] = DOOR_TILE
        keep.add(key({ x: door.x - 1, y: door.y })).add(key({ x: door.x + 1, y: door.y }))
      }
      if (grid[room.row + 1]?.[col]) {
        const door = { x: randomInt(random, room.x0, room.x1), y: room.y1 + 1 }
        tiles[door.y][door.x] = DOOR_TILE
        keep.add(key({ x: door.x, y: door.y - 1 })).add(key({ x: door.x, y: door.y + 1 }))
      }
    }),
  )
  return keep
}

// Player starts in one room and enemy spawns in the other; a single-room deck puts them at opposite corners.
function placeMarkers(tiles, playerRoom, enemyRoom, random) {
  const openIn = (room) => markerCells(tiles, roomCells(room))
  if (playerRoom === enemyRoom) {
    const cells = openIn(playerRoom).sort((a, b) => a.x + a.y - (b.x + b.y))
    const players = Math.min(MARKERS_PER_SIDE, Math.floor(cells.length / 2))
    return { playerStarts: cells.slice(0, players), enemySpawns: cells.slice(Math.max(players, cells.length - MARKERS_PER_SIDE)).reverse() }
  }
  return pickMarkers(openIn(playerRoom), openIn(enemyRoom), random)
}

// style: { floor, wall, crate, machinery, hazard (whether to place the EPS grating and control) }.
export function makeDeckGenerator({ floor = FLOOR_TILE, wall = WALL_TILE, crate = CRATE_TILE, machinery = MACHINERY_TILE, hazard = true } = {}) {
  const walls = new Set([wall])
  return function generateDeck(map, random, areaNames) {
    const { width, height } = map
    const tiles = makeGrid(width, height, (x, y) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? wall : floor))

    const columns = splitAxis(1, width - 2, random)
    const rows = splitAxis(1, height - 2, random)
    const grid = rows.map(([y0, y1], row) => columns.map(([x0, x1], col) => ({ row, col, x0, x1, y0, y1 })))
    const rooms = grid.flat()
    columns.slice(0, -1).forEach(([, x1]) => {
      for (let y = 1; y < height - 1; y++) tiles[y][x1 + 1] = wall
    })
    rows.slice(0, -1).forEach(([, y1]) => {
      for (let x = 1; x < width - 1; x++) tiles[y1 + 1][x] = wall
    })

    const keep = connectRooms(tiles, grid, random)

    // Players start in a corner room and enemies in the opposite one.
    const playerRow = random() < 0.5 ? 0 : rows.length - 1
    const playerCol = random() < 0.5 ? 0 : columns.length - 1
    const playerRoom = grid[playerRow][playerCol]
    const enemyRoom = grid[rows.length - 1 - playerRow][columns.length - 1 - playerCol]

    rooms.forEach((room) => furnishRoom(tiles, keep, room, random, { floor, walls, crate, machinery }))

    if (hazard) {
      const markerRooms = new Set([playerRoom, enemyRoom])
      const hazardRooms = [...shuffle(rooms.filter((room) => !markerRooms.has(room)), random), ...shuffle([...markerRooms], random)]
      placeHazard(tiles, keep, hazardRooms, random, floor)
    }

    const markers = placeMarkers(tiles, playerRoom, enemyRoom, random)
    const areas = labelRegions(tiles, rooms.map(roomCells), areaNames, random)
    return { ...map, tiles, areas, markers }
  }
}

export const generateStarshipDeck = makeDeckGenerator()
