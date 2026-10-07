// Indoor and alien locations built from the existing layouts with their own tiles: a research lab and an alien vessel are
// decks (a grid of rooms), a cantina, a detention block and an alien temple are stations (a central hall with rooms
// opening onto it), and an alien hive is a cave. None of them uses a biome.
import { generateCave } from './cave.js'
import { furnishRoom, isFree, key, placeProp, placeSolid, randomInt, roomCells, shuffle } from './shared.js'
import { makeStationGenerator } from './spaceStation.js'
import { makeDeckGenerator } from './starshipDeck.js'

export const generateLaboratory = makeDeckGenerator({ floor: 'labFloor', wall: 'labWall', crate: 'labBench', machinery: 'containmentPod' })

export const generateAlienVessel = makeDeckGenerator({ floor: 'alienDeck', wall: 'alienBulkhead', crate: 'bioPod', machinery: 'alienConsole', hazard: false })

// Single solid tiles on free floor, none touching another, about one per `every` tiles of the rect.
function spacedProps(tiles, keep, rect, random, floor, tileId, every) {
  const placed = new Set()
  let budget = Math.floor(roomCells(rect).length / every)
  for (const cell of shuffle(roomCells(rect), random)) {
    if (budget <= 0) break
    const crowded = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => placed.has(key({ x: cell.x + dx, y: cell.y + dy }))))
    if (crowded || !isFree(tiles, keep, cell, floor)) continue
    if (placeProp(tiles, [cell], tileId, rect)) {
      placed.add(key(cell))
      budget--
    }
  }
}

// The bar runs along part of one long wall of the hall, a tile out from it so staff can stand behind; tables fill the rest.
function furnishCantinaHall(tiles, keep, hall, random, { floor }) {
  const width = hall.x1 - hall.x0 + 1
  const height = hall.y1 - hall.y0 + 1
  if (height >= 4 && width >= 6) {
    const length = Math.max(3, Math.round(width * 0.35))
    const start = randomInt(random, hall.x0 + 1, hall.x1 - length)
    const y = random() < 0.5 ? hall.y0 + 1 : hall.y1 - 1
    for (let x = start; x < start + length; x++) {
      if (isFree(tiles, keep, { x, y }, floor)) placeSolid(tiles, [{ x, y }], 'barCounter')
    }
  }
  spacedProps(tiles, keep, hall, random, floor, 'table', 9)
}

export const generateCantina = makeStationGenerator({
  floor: 'plankFloor',
  wall: 'cantinaWall',
  crate: 'crate',
  machinery: 'crate',
  hazard: false,
  furnishHall: furnishCantinaHall,
})

// Narrow cells, each with a bunk against its back wall, behind lowered forcefields.
function furnishCells(tiles, keep, cells, random, { floor }) {
  cells.forEach((cell) => {
    const spots = shuffle(roomCells(cell), random).filter((spot) => isFree(tiles, keep, spot, floor))
    spots.some((spot) => placeProp(tiles, [spot], 'cellBunk', cell))
  })
}

export const generateDetention = makeStationGenerator({ door: 'forceField', span: 3, furnishRooms: furnishCells })

// Two rows of pillars down the nave and an altar on glyph stones at one end; side chapels hold a glyph and an offering.
function furnishNave(tiles, keep, hall, random, { floor }) {
  const height = hall.y1 - hall.y0 + 1
  if (height >= 5) {
    for (let x = hall.x0 + 2; x <= hall.x1 - 2; x += 3) {
      for (const y of [hall.y0 + 1, hall.y1 - 1]) if (isFree(tiles, keep, { x, y }, floor)) placeSolid(tiles, [{ x, y }], 'templePillar')
    }
  }
  const y = Math.floor((hall.y0 + hall.y1) / 2)
  const x = random() < 0.5 ? hall.x0 + 1 : hall.x1 - 1
  roomCells({ x0: x - 1, x1: x + 1, y0: y - 1, y1: y + 1 }).forEach((cell) => isFree(tiles, keep, cell, floor) && (tiles[cell.y][cell.x] = 'glyphTile'))
  if (!keep.has(key({ x, y }))) placeSolid(tiles, [{ x, y }], 'altar')
}
function furnishChapels(tiles, keep, chapels, random, style) {
  chapels.forEach((chapel) => {
    furnishRoom(tiles, keep, chapel, random, { floor: style.floor, walls: new Set([style.wall]), density: 8, crate: 'altar', machinery: 'templePillar' })
    const spot = shuffle(roomCells(chapel), random).find((cell) => isFree(tiles, keep, cell, style.floor))
    if (spot) tiles[spot.y][spot.x] = 'glyphTile'
  })
}

export const generateAlienTemple = makeStationGenerator({
  floor: 'templeFloor',
  wall: 'templeWall',
  hazard: false,
  span: 5,
  furnishHall: furnishNave,
  furnishRooms: furnishChapels,
})

const HIVE = {
  cave: { floor: 'hiveFloor', wall: 'hiveWall', boulder: 'eggPod' },
  caveFeatures: [
    { kind: 'blob', tiles: ['slimePool'], per: 110, size: [3, 7] },
    { kind: 'scatter', tile: 'eggPod', per: 60 },
  ],
}
export const generateAlienHive = (map, random, areaNames) => generateCave(map, random, areaNames, HIVE)
