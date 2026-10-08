// Landing Field: a paved landing pad with a marked touchdown circle, one or two parked shuttles and cargo on it, fuel
// tanks along its edge and a control hut beside it. The biome supplies the surrounding ground, hut walls, boulders, plants
// and some of its natural features.
import { FLOOR_TILE } from '../mapFormat.js'
import {
  allCells,
  applyFeatures,
  besideCells,
  CRATE_TILE,
  cornerMarkers,
  furnishRoom,
  grow,
  isFree,
  key,
  labelPlaces,
  makeGrid,
  placeBuildings,
  placeSolid,
  randomInt,
  ringAround,
  roomCells,
  scatter,
  shuffle,
} from './shared.js'

const SIDES = ['top', 'bottom', 'left', 'right']
const FEATURE_SCALE = 0.4

export function generateLandingField(map, random, areaNames, biome) {
  const { width, height } = map
  const { ground } = biome
  const wall = biome.walls.prefab
  const tiles = makeGrid(width, height, () => ground)
  const keep = new Set()

  // The pad covers the middle of the map, leaving a margin of open ground for the hut and the approach.
  const [padW, padH] = [Math.max(4, Math.round(width * 0.55)), Math.max(4, Math.round(height * 0.5))]
  const x0 = randomInt(random, 2, Math.max(2, width - 2 - padW))
  const y0 = randomInt(random, 2, Math.max(2, height - 2 - padH))
  const pad = { x0, x1: Math.min(width - 3, x0 + padW - 1), y0, y1: Math.min(height - 3, y0 + padH - 1) }
  roomCells(pad).forEach(({ x, y }) => (tiles[y][x] = 'landingPad'))
  const middle = { x: Math.floor((pad.x0 + pad.x1) / 2), y: Math.floor((pad.y0 + pad.y1) / 2) }
  roomCells(pad)
    .filter(({ x, y }) => Math.round(Math.hypot(x - middle.x, (y - middle.y) * 1.2)) === Math.min(2, Math.floor((pad.y1 - pad.y0) / 2)))
    .forEach(({ x, y }) => (tiles[y][x] = 'padMarking'))

  // Shuttles: 2 x 3 blocks parked on the pad, off the marked circle.
  const shuttles = []
  const shuttleCount = randomInt(random, 1, 2)
  for (let attempt = 0; attempt < 60 && shuttles.length < shuttleCount; attempt++) {
    const along = random() < 0.5
    const [w, h] = along ? [3, 2] : [2, 3]
    const sx = randomInt(random, pad.x0 + 1, pad.x1 - w)
    const sy = randomInt(random, pad.y0 + 1, pad.y1 - h)
    const cells = roomCells({ x0: sx, x1: sx + w - 1, y0: sy, y1: sy + h - 1 })
    const clear = roomCells(grow(tiles, { x0: sx, x1: sx + w - 1, y0: sy, y1: sy + h - 1 }, 1)).every(({ x, y }) => tiles[y][x] === 'landingPad')
    if (clear && placeSolid(tiles, cells, 'shuttleHull')) shuttles.push(cells)
  }
  scatter(tiles, keep, Math.max(2, Math.round(roomCells(pad).length / 25)), CRATE_TILE, random, 'landingPad')
  shuffle(ringAround(tiles, pad), random)
    .filter((cell) => isFree(tiles, keep, cell, ground))
    .slice(0, randomInt(random, 2, 4))
    .forEach((cell) => placeSolid(tiles, [cell], 'fuelTank'))

  const huts = placeBuildings(tiles, keep, 1, { minW: 6, maxW: 6, minH: 6, maxH: 6 }, random, ground, () => SIDES[randomInt(random, 0, 3)], { wall })
  huts.forEach((hut) => {
    furnishRoom(tiles, keep, hut.room, random, { floor: FLOOR_TILE, walls: new Set([wall]), density: 5 })
    roomCells(grow(tiles, hut.rect, 1)).forEach((cell) => keep.add(key(cell)))
  })

  applyFeatures(tiles, keep, biome.features, ground, random, FEATURE_SCALE)
  const area = width * height
  scatter(tiles, keep, Math.round(area / 80), biome.boulder, random, ground)
  biome.plants.forEach((plant) => scatter(tiles, keep, Math.round(area / 70 / biome.plants.length), plant, random, ground))

  const markers = cornerMarkers(tiles, random)
  // areaNames: { pad, hut, fuel } lists; the fuel label goes beside the fuel tanks.
  const tanks = allCells(tiles).filter(({ x, y }) => tiles[y][x] === 'fuelTank')
  const areas = labelPlaces(
    tiles,
    [
      { kind: 'pad', cells: roomCells(pad) },
      ...huts.map((hut) => ({ kind: 'hut', cells: roomCells(hut.room) })),
      ...(tanks.length ? [{ kind: 'fuel', cells: besideCells(tanks) }] : []),
    ],
    areaNames,
    random,
  )
  return { ...map, tiles, areas, markers }
}
