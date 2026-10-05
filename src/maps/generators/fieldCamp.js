// Field Camp: a ring of tents around a campfire, a sensor mast and supply crates, pitched in open terrain. The biome
// supplies the ground, boulders, plants and most of its natural features.
import {
  applyFeatures,
  CRATE_TILE,
  cornerMarkers,
  grow,
  isFree,
  key,
  makeGrid,
  placeSolid,
  randomInt,
  ringAround,
  roomCells,
  scatter,
  shuffle,
  zoneLabels,
} from './shared.js'

const FEATURE_SCALE = 0.6

export function generateFieldCamp(map, random, areaNames, biome) {
  const { width, height } = map
  const { ground } = biome
  const tiles = makeGrid(width, height, () => ground)
  const keep = new Set()
  const area = width * height

  // Tents stand on a circle around the fire with gaps between them, so the fire can be reached from every side.
  const fire = { x: randomInt(random, 4, width - 5), y: randomInt(random, 4, height - 5) }
  placeSolid(tiles, [fire], 'campfire')
  const tents = randomInt(random, 3, 6)
  const radius = randomInt(random, 2, 3)
  const turn = random() * Math.PI * 2
  for (let i = 0; i < tents; i++) {
    const angle = turn + (i / tents) * Math.PI * 2
    const cell = { x: fire.x + Math.round(Math.cos(angle) * radius), y: fire.y + Math.round(Math.sin(angle) * radius) }
    if (isFree(tiles, keep, cell, ground)) placeSolid(tiles, [cell], 'tent')
  }
  const camp = grow(tiles, { x0: fire.x, x1: fire.x, y0: fire.y, y1: fire.y }, radius + 1)
  const outside = shuffle(ringAround(tiles, camp), random).filter((cell) => isFree(tiles, keep, cell, ground))
  outside.slice(0, 1).forEach((cell) => placeSolid(tiles, [cell], 'sensorMast'))
  outside.slice(1, randomInt(random, 3, 6)).forEach((cell) => placeSolid(tiles, [cell], CRATE_TILE))
  roomCells(grow(tiles, camp, 1)).forEach((cell) => keep.add(key(cell)))

  applyFeatures(tiles, keep, biome.features, ground, random, FEATURE_SCALE)
  scatter(tiles, keep, Math.round(area / 60), biome.boulder, random, ground)
  biome.plants.forEach((plant) => scatter(tiles, keep, Math.round(area / 50 / biome.plants.length), plant, random, ground))

  const markers = cornerMarkers(tiles, random)
  const areas = zoneLabels(tiles, areaNames, random)
  return { ...map, tiles, areas, markers }
}
