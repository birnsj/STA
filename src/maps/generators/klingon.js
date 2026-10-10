// Klingon Ship and Klingon Station: the Starship Deck and Space Station layouts built from the Klingon tile set, with a
// warp core room and a command chair. The display and conduit walls go in afterwards (generatedWallVariants.json).
import { makeStationGenerator } from './spaceStation.js'
import { makeDeckGenerator } from './starshipDeck.js'
import { furnishRoom, isFree, key, placeProp, shuffle } from './shared.js'

const FLOOR = 'klingonDeck'
const GRATE = 'klingonGrate'

// Doorways are open deck: the Klingon door tile is a closed, solid door.
const tiles = { floor: FLOOR, wall: 'klingonBulkhead', door: FLOOR, crate: 'klingonCrate', machinery: 'klingonConsole', hazard: false }

const centreOf = (room) => ({ x: Math.floor((room.x0 + room.x1) / 2), y: Math.floor((room.y0 + room.y1) / 2) })
const isRoomy = (room) => room.x1 - room.x0 >= 4 && room.y1 - room.y0 >= 4

// The warp core stands in the middle of the room on a ring of lit grates.
function placeWarpCore(map, keep, room) {
  const centre = centreOf(room)
  if (!isFree(map, keep, centre, FLOOR) || !placeProp(map, [centre], 'klingonWarpCore', room)) return false
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const cell = { x: centre.x + dx, y: centre.y + dy }
      if (map[cell.y][cell.x] === FLOOR) map[cell.y][cell.x] = GRATE
    }
  return true
}

const placeChair = (map, keep, room) => {
  const centre = centreOf(room)
  return isFree(map, keep, centre, FLOOR) && placeProp(map, [centre], 'klingonChair', room)
}

// One room gets the warp core and another the command chair; every room then gets consoles and cargo along its walls.
function furnishRooms(map, keep, rooms, random, style) {
  const walls = new Set([style.wall])
  const spacious = shuffle(rooms.filter(isRoomy), random)
  const coreRoom = spacious.find((room) => placeWarpCore(map, keep, room))
  spacious.find((room) => room !== coreRoom && placeChair(map, keep, room))
  rooms.forEach((room) => furnishRoom(map, keep, room, random, { ...style, walls }))
}

// Support struts down both sides of the hall every few tiles, and a line of lit grates along its middle.
function furnishHall(map, keep, hall, random, style) {
  const middle = Math.floor((hall.y0 + hall.y1) / 2)
  for (let x = hall.x0; x <= hall.x1; x++) if (map[middle][x] === FLOOR && !keep.has(key({ x, y: middle }))) map[middle][x] = GRATE
  if (hall.y1 - hall.y0 >= 3)
    for (let x = hall.x0 + 2; x <= hall.x1 - 2; x += 4)
      for (const y of [hall.y0, hall.y1]) if (isFree(map, keep, { x, y }, FLOOR)) placeProp(map, [{ x, y }], 'klingonStrut', hall)
  furnishRoom(map, keep, hall, random, { ...style, walls: new Set([style.wall]), density: 14 })
}

export const generateKlingonShip = makeDeckGenerator({ ...tiles, furnishRooms })
export const generateKlingonStation = makeStationGenerator({ ...tiles, furnishRooms, furnishHall })
