// Field Camp: a ring of tents around a campfire, a sensor mast and supply crates, pitched in open terrain. The biome
// supplies the ground, boulders, plants and most of its natural features.
import {
  applyFeatures,
  besideCells,
  CRATE_TILE,
  cornerMarkers,
  grow,
  isFree,
  key,
  labelPlaces,
  makeGrid,
  placeSolid,
  randomInt,
  ringAround,
  roomCells,
  scatter,
  shuffle,
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
  const tentCells = []
  for (let i = 0; i < tents; i++) {
    const angle = turn + (i / tents) * Math.PI * 2
    const cell = { x: fire.x + Math.round(Math.cos(angle) * radius), y: fire.y + Math.round(Math.sin(angle) * radius) }
    if (isFree(tiles, keep, cell, ground) && placeSolid(tiles, [cell], 'tent')) tentCells.push(cell)
  }
  const camp = grow(tiles, { x0: fire.x, x1: fire.x, y0: fire.y, y1: fire.y }, radius + 1)
  const outside = shuffle(ringAround(tiles, camp), random).filter((cell) => isFree(tiles, keep, cell, ground))
  const mast = outside.slice(0, 1).filter((cell) => placeSolid(tiles, [cell], 'sensorMast'))
  const crates = outside.slice(1, randomInt(random, 3, 6)).filter((cell) => placeSolid(tiles, [cell], CRATE_TILE))
  roomCells(grow(tiles, camp, 1)).forEach((cell) => keep.add(key(cell)))

  applyFeatures(tiles, keep, biome.features, ground, random, FEATURE_SCALE)
  scatter(tiles, keep, Math.round(area / 60), biome.boulder, random, ground)
  biome.plants.forEach((plant) => scatter(tiles, keep, Math.round(area / 50 / biome.plants.length), plant, random, ground))

  const markers = cornerMarkers(tiles, random)
  // areaNames: { campfire, tent, mast, stores } lists, each label beside the thing it names. Only one tent is named so
  // the labels round the fire don't pile up.
  const areas = labelPlaces(
    tiles,
    [
      { kind: 'campfire', cells: besideCells([fire]) },
      ...tentCells.slice(0, 1).map((tent) => ({ kind: 'tent', cells: besideCells([tent]) })),
      ...mast.map((cell) => ({ kind: 'mast', cells: besideCells([cell]) })),
      ...(crates.length ? [{ kind: 'stores', cells: besideCells(crates) }] : []),
    ],
    areaNames,
    random,
  )
  return { ...map, tiles, areas, markers }
}
