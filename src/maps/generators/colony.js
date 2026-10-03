// Small Colony: open ground with a main path, buildings opening onto it, fenced yards, cargo and plants near the edges.
// The EPS grating and its control sit beside one building as its power junction. The biome supplies the ground, path,
// building walls, fences (if any), edge plants and a light scattering of its natural features.
import { FLOOR_TILE } from '../mapFormat.js'
import {
  applyFeatures,
  CRATE_TILE,
  DOOR_STEP,
  furnishRoom,
  grow,
  isFree,
  key,
  labelRegions,
  layLine,
  makeGrid,
  markerCells,
  markersAtEnds,
  placeBuildings,
  placeHazard,
  placeSolid,
  randomInt,
  ringAround,
  roomCells,
  scatter,
  shuffle,
} from './shared.js'

const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
// A colony is cleared ground, so only a little of the biome's wild features shows.
const FEATURE_SCALE = 0.3

// A fence line two tiles off the building's back wall (leaving a walkway), with one gap as a gate.
function fenceYard(tiles, keep, building, side, random, ground, fence) {
  const { rect } = building
  const horizontal = side === 'top' || side === 'bottom'
  const offset = { top: rect.y0 - 2, bottom: rect.y1 + 2, left: rect.x0 - 2, right: rect.x1 + 2 }[side]
  const cells = horizontal
    ? Array.from({ length: rect.x1 - rect.x0 + 1 }, (_, i) => ({ x: rect.x0 + i, y: offset }))
    : Array.from({ length: rect.y1 - rect.y0 + 1 }, (_, i) => ({ x: offset, y: rect.y0 + i }))
  const gate = randomInt(random, 0, cells.length - 1)
  cells.forEach((cell, i) => i !== gate && isFree(tiles, keep, cell, ground) && placeSolid(tiles, [cell], fence))
}

export function generateColony(map, random, areaNames, biome) {
  const { width, height } = map
  const { ground, path } = biome
  const wall = biome.walls.prefab
  const tiles = makeGrid(width, height, () => ground)
  const keep = new Set()

  // Main path along the long axis, near the middle.
  const horizontal = width >= height
  const across = horizontal ? height : width
  const pathWidth = across >= 14 ? 2 : 1
  const middle = Math.floor((across - pathWidth) / 2) + randomInt(random, -Math.floor(across / 8), Math.floor(across / 8))
  const pathStart = Math.max(1, Math.min(across - 1 - pathWidth, middle))
  tiles.forEach((row, y) =>
    row.forEach((_, x) => {
      const offset = (horizontal ? y : x) - pathStart
      if (offset >= 0 && offset < pathWidth) tiles[y][x] = path
    }),
  )

  // Buildings face the main path.
  const doorSide = (rect) => (horizontal ? (rect.y1 < pathStart ? 'bottom' : 'top') : rect.x1 < pathStart ? 'right' : 'left')
  const count = Math.max(2, Math.min(5, Math.round((width * height) / 110)))
  const buildings = placeBuildings(tiles, keep, count, { minW: 4, maxW: 8, minH: 4, maxH: 6 }, random, ground, doorSide, { wall })
  buildings.forEach((building) => {
    const side = doorSide(building.rect)
    layLine(tiles, building.outside, DOOR_STEP[side], path, ground)
    if (biome.fence && random() < 0.5) fenceYard(tiles, keep, building, OPPOSITE[side], random, ground, biome.fence)
    const crates = randomInt(random, 1, 3)
    shuffle(ringAround(tiles, building.rect), random)
      .filter((cell) => isFree(tiles, keep, cell, ground))
      .slice(0, crates)
      .forEach((cell) => placeSolid(tiles, [cell], CRATE_TILE))
    furnishRoom(tiles, keep, building.room, random, { floor: FLOOR_TILE, walls: new Set([wall]), density: 8 })
  })

  placeHazard(
    tiles,
    keep,
    shuffle(buildings, random).map((building) => grow(tiles, building.rect, 3)),
    random,
    ground,
  )

  // Nothing wild grows within two tiles of a building, so every yard and doorway stays clear.
  buildings.forEach((building) => roomCells(grow(tiles, building.rect, 2)).forEach((cell) => keep.add(key(cell))))
  applyFeatures(tiles, keep, biome.features, ground, random, FEATURE_SCALE)
  const edge = ({ x, y }) => Math.min(x, y, width - 1 - x, height - 1 - y) <= 1
  biome.plants.forEach((plant) => scatter(tiles, keep, Math.round(((width + height) * 0.4) / biome.plants.length), plant, random, ground, edge))

  // Players at one end of the main path and enemies at the other, outside the buildings.
  const flip = random() < 0.5 ? 1 : -1
  const outdoors = markerCells(
    tiles,
    tiles.flatMap((row, y) => row.map((_, x) => ({ x, y }))),
  ).filter(({ x, y }) => tiles[y][x] !== FLOOR_TILE)
  const markers = markersAtEnds(outdoors, (cell) => flip * (horizontal ? cell.x : cell.y), random)

  const areas = labelRegions(
    tiles,
    buildings.map((building) => roomCells(building.room)),
    areaNames,
    random,
  )
  return { ...map, tiles, areas, markers }
}
