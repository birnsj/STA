// Farmstead: a farm track across the map with a farmhouse and a barn on it, fenced crop fields (rows of low and tall
// crops), a silo and hay bales by the barn. The biome supplies the ground, track, farmhouse walls, fences and edge plants.
import { FLOOR_TILE } from '../mapFormat.js'
import {
  applyFeatures,
  DOOR_STEP,
  furnishRoom,
  grow,
  isFree,
  key,
  labelPlaces,
  layLine,
  makeGrid,
  markerCells,
  markersAtEnds,
  placeBuildings,
  placeSolid,
  randomInt,
  rectIsClear,
  ringAround,
  roomCells,
  scatter,
  shuffle,
} from './shared.js'

const FEATURE_SCALE = 0.2

// Crop rows with every other row grown tall, fenced with a gate on two sides.
function plantField(tiles, keep, rect, random, ground, fence) {
  roomCells(rect).forEach(({ x, y }) => (tiles[y][x] = 'cropRows'))
  roomCells(rect)
    .filter(({ y }) => (y - rect.y0) % 2 === 1)
    .forEach((cell) => placeSolid(tiles, [cell], 'tallCrop'))
  const ring = ringAround(tiles, rect)
  const gates = new Set(shuffle(ring, random).slice(0, 2).map(key))
  ring.forEach((cell) => !gates.has(key(cell)) && isFree(tiles, keep, cell, ground) && placeSolid(tiles, [cell], fence))
}

export function generateFarm(map, random, areaNames, biome) {
  const { width, height } = map
  const { ground, path } = biome
  const tiles = makeGrid(width, height, () => ground)
  const keep = new Set()

  // The farm track along the long axis, a little off centre.
  const horizontal = width >= height
  const across = horizontal ? height : width
  const track = Math.max(2, Math.min(across - 3, Math.floor(across / 2) + randomInt(random, -2, 2)))
  tiles.forEach((row, y) => row.forEach((_, x) => (horizontal ? y : x) === track && (tiles[y][x] = path)))

  // Farmhouse and barn face the track.
  const doorSide = (rect) => (horizontal ? (rect.y1 < track ? 'bottom' : 'top') : rect.x1 < track ? 'right' : 'left')
  const [house] = placeBuildings(tiles, keep, 1, { minW: 6, maxW: 7, minH: 6, maxH: 6 }, random, ground, doorSide, { wall: biome.walls.prefab })
  const [barn] = placeBuildings(tiles, keep, 1, { minW: 6, maxW: 8, minH: 6, maxH: 7 }, random, ground, doorSide, { wall: 'barnWall' })
  const buildings = [house, barn].filter(Boolean)
  buildings.forEach((building) => {
    layLine(tiles, building.outside, DOOR_STEP[doorSide(building.rect)], path, ground)
    furnishRoom(tiles, keep, building.room, random, { floor: FLOOR_TILE, walls: new Set([building === barn ? 'barnWall' : biome.walls.prefab]), density: 6, machinery: 'hayBale' })
  })
  if (barn) {
    const beside = shuffle(ringAround(tiles, barn.rect), random).filter((cell) => isFree(tiles, keep, cell, ground))
    beside.slice(0, 1).forEach((cell) => placeSolid(tiles, [cell], 'silo'))
    beside.slice(1, randomInt(random, 3, 5)).forEach((cell) => placeSolid(tiles, [cell], 'hayBale'))
  }
  buildings.forEach((building) => roomCells(grow(tiles, building.rect, 1)).forEach((cell) => keep.add(key(cell))))

  // Fields wherever there's room, each kept a tile clear of the track and the other fields.
  const fields = []
  const fence = biome.fence ?? 'fence'
  for (let attempt = 0; attempt < 120 && fields.length < 4; attempt++) {
    const [w, h] = [randomInt(random, 3, 7), randomInt(random, 3, 5)]
    const x0 = randomInt(random, 2, Math.max(2, width - 3 - w))
    const y0 = randomInt(random, 2, Math.max(2, height - 3 - h))
    const rect = { x0, x1: x0 + w - 1, y0, y1: y0 + h - 1 }
    const outer = grow(tiles, rect, 1)
    if (!rectIsClear(tiles, outer, ground) || roomCells(outer).some((cell) => keep.has(key(cell)))) continue
    plantField(tiles, keep, rect, random, ground, fence)
    roomCells(grow(tiles, rect, 2)).forEach((cell) => keep.add(key(cell)))
    fields.push(rect)
  }

  applyFeatures(tiles, keep, biome.features, ground, random, FEATURE_SCALE)
  const edge = ({ x, y }) => Math.min(x, y, width - 1 - x, height - 1 - y) <= 1
  biome.plants.forEach((plant) => scatter(tiles, keep, Math.round(((width + height) * 0.3) / biome.plants.length), plant, random, ground, edge))

  // Players at one end of the track and enemies at the other, outdoors.
  const flip = random() < 0.5 ? 1 : -1
  const outdoors = markerCells(tiles, tiles.flatMap((row, y) => row.map((_, x) => ({ x, y })))).filter(({ x, y }) => tiles[y][x] !== FLOOR_TILE)
  const markers = markersAtEnds(outdoors, (cell) => flip * (horizontal ? cell.x : cell.y), random)

  // areaNames: { farmhouse, barn, field } lists.
  const areas = labelPlaces(
    tiles,
    [
      ...(house ? [{ kind: 'farmhouse', cells: roomCells(house.room) }] : []),
      ...(barn ? [{ kind: 'barn', cells: roomCells(barn.room) }] : []),
      ...fields.map((field) => ({ kind: 'field', cells: roomCells(field) })),
    ],
    areaNames,
    random,
  )
  return { ...map, tiles, areas, markers }
}
