// Outpost: one or two small huts in rough ground, a short path from each door, a cargo pile, and scattered boulders and
// plants. Sometimes an EPS junction beside a hut. The biome supplies the ground, path, hut walls, boulders, plants and
// some of its natural features.
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

const SIDES = ['top', 'bottom', 'left', 'right']
// Rougher than a colony, so more of the biome shows.
const FEATURE_SCALE = 0.5

export function generateOutpost(map, random, areaNames, biome) {
  const { width, height } = map
  const { ground, path } = biome
  const wall = biome.walls.prefab
  const tiles = makeGrid(width, height, () => ground)
  const keep = new Set()

  const sides = new Map()
  const doorSide = (rect) => {
    const side = SIDES[randomInt(random, 0, SIDES.length - 1)]
    sides.set(rect, side)
    return side
  }
  const huts = placeBuildings(tiles, keep, randomInt(random, 1, 2), { minW: 4, maxW: 6, minH: 4, maxH: 5 }, random, ground, doorSide, { wall })
  huts.forEach((hut) => {
    layLine(tiles, hut.outside, DOOR_STEP[sides.get(hut.rect)], path, ground, randomInt(random, 2, 4))
    furnishRoom(tiles, keep, hut.room, random, { floor: FLOOR_TILE, walls: new Set([wall]), density: 6 })
  })

  // A cargo pile against one hut.
  if (huts.length) {
    const hut = huts[randomInt(random, 0, huts.length - 1)]
    shuffle(ringAround(tiles, hut.rect), random)
      .filter((cell) => isFree(tiles, keep, cell, ground))
      .slice(0, randomInt(random, 2, 4))
      .forEach((cell) => placeSolid(tiles, [cell], CRATE_TILE))
  }

  if (random() < 0.5) {
    placeHazard(
      tiles,
      keep,
      shuffle(huts, random).map((hut) => grow(tiles, hut.rect, 3)),
      random,
      ground,
    )
  }

  // The ground right around each hut stays clear.
  huts.forEach((hut) => roomCells(grow(tiles, hut.rect, 1)).forEach((cell) => keep.add(key(cell))))
  applyFeatures(tiles, keep, biome.features, ground, random, FEATURE_SCALE)
  const area = width * height
  scatter(tiles, keep, Math.round(area / 40), biome.boulder, random, ground)
  biome.plants.forEach((plant) => scatter(tiles, keep, Math.round(area / 45 / biome.plants.length), plant, random, ground))

  // Players at one side and enemies at the other, along the map's long axis.
  const horizontal = width >= height
  const flip = random() < 0.5 ? 1 : -1
  const outdoors = markerCells(
    tiles,
    tiles.flatMap((row, y) => row.map((_, x) => ({ x, y }))),
  ).filter(({ x, y }) => tiles[y][x] !== FLOOR_TILE)
  const markers = markersAtEnds(outdoors, (cell) => flip * (horizontal ? cell.x : cell.y), random)

  const areas = labelRegions(
    tiles,
    huts.map((hut) => roomCells(hut.room)),
    areaNames,
    random,
  )
  return { ...map, tiles, areas, markers }
}
