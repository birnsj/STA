// Mining Site: an open quarry pit ringed by ore veins with drill rigs in it, a rail line with ore carts running across the
// map, and one or two site huts with an EPS junction. The biome supplies the ground, hut walls, boulders and some of its
// natural features.
import { FLOOR_TILE } from '../mapFormat.js'
import {
  allCells,
  applyFeatures,
  besideCells,
  CRATE_TILE,
  cornerMarkers,
  furnishRoom,
  grow,
  growBlob,
  isFree,
  key,
  labelPlaces,
  makeGrid,
  placeBuildings,
  placeHazard,
  placeSolid,
  randomInt,
  ringAround,
  roomCells,
  scatter,
  shuffle,
  wanderAcross,
} from './shared.js'

const SIDES = ['top', 'bottom', 'left', 'right']
const FEATURE_SCALE = 0.3

export function generateMiningSite(map, random, areaNames, biome) {
  const { width, height } = map
  const { ground } = biome
  const wall = biome.walls.prefab
  const tiles = makeGrid(width, height, () => ground)
  const keep = new Set()
  const area = width * height

  const huts = placeBuildings(tiles, keep, randomInt(random, 1, 2), { minW: 6, maxW: 7, minH: 6, maxH: 6 }, random, ground, () => SIDES[randomInt(random, 0, 3)], { wall })
  huts.forEach((hut) => {
    furnishRoom(tiles, keep, hut.room, random, { floor: FLOOR_TILE, walls: new Set([wall]), density: 6 })
    shuffle(ringAround(tiles, hut.rect), random)
      .filter((cell) => isFree(tiles, keep, cell, ground))
      .slice(0, randomInt(random, 1, 3))
      .forEach((cell) => placeSolid(tiles, [cell], CRATE_TILE))
  })
  placeHazard(tiles, keep, shuffle(huts, random).map((hut) => grow(tiles, hut.rect, 3)), random, ground)
  huts.forEach((hut) => roomCells(grow(tiles, hut.rect, 1)).forEach((cell) => keep.add(key(cell))))

  // The rail line runs the length of the site (through the pit, which is dug around it); carts stand on it here and there.
  wanderAcross(tiles, keep, 'railTrack', ground, random, { horizontal: width >= height })

  // The pit: a big patch of quarry floor near the middle, with ore veins around its rim and rigs inside.
  const centre = { x: Math.floor(width / 2) + randomInt(random, -3, 3), y: Math.floor(height / 2) + randomInt(random, -2, 2) }
  const fromCentre = (cell) => Math.abs(cell.x - centre.x) + Math.abs(cell.y - centre.y)
  const open = allCells(tiles).filter((cell) => isFree(tiles, keep, cell, ground))
  const start = open.length ? open.reduce((best, cell) => (fromCentre(cell) < fromCentre(best) ? cell : best)) : centre
  const pit = growBlob(tiles, keep, start, Math.round(area * 0.22), 'quarryFloor', ground, random)
  applyFeatures(tiles, keep, [{ kind: 'fringe', tile: 'oreVein', around: 'quarryFloor', chance: 0.3 }], ground, random)
  scatter(tiles, keep, randomInt(random, 1, 3), 'drillRig', random, 'quarryFloor')
  scatter(tiles, keep, Math.round(area / 90), biome.boulder, random, 'quarryFloor')
  scatter(tiles, keep, randomInt(random, 2, 4), 'oreCart', random, 'railTrack')

  applyFeatures(tiles, keep, biome.features, ground, random, FEATURE_SCALE)
  scatter(tiles, keep, Math.round(area / 50), biome.boulder, random, ground)

  const markers = cornerMarkers(tiles, random)
  // areaNames: { pit, hut, rig } lists; a rig is labelled beside the first drill rig.
  const rig = allCells(tiles).find(({ x, y }) => tiles[y][x] === 'drillRig')
  const areas = labelPlaces(
    tiles,
    [
      { kind: 'pit', cells: pit },
      ...huts.map((hut) => ({ kind: 'hut', cells: roomCells(hut.room) })),
      ...(rig ? [{ kind: 'rig', cells: besideCells([rig]) }] : []),
    ],
    areaNames,
    random,
  )
  return { ...map, tiles, areas, markers }
}
