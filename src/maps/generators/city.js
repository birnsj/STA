// Small City: a grid of roads around pavement blocks. Each block holds one or two buildings (doorways facing a road where
// possible), except the plaza, a small park with a fountain. The biome supplies the building walls and the park's ground
// and plants. The idea comes from the Captain's Log civilization tables (settled, industrial and information-age
// societies); the street layout is prototype.
// Players and enemies start at opposite ends of the long axis.
import areaNameLists from '../../data/adaptation/maps/areaNames.json'
import { FLOOR_TILE } from '../mapFormat.js'
import {
  allCells,
  CRATE_TILE,
  furnishRoom,
  labelRegions,
  markerCells,
  markersAtEnds,
  neighboursOf,
  placeBuilding,
  placeHazard,
  placeSolid,
  randomInt,
  roomCells,
  scatter,
  shuffle,
} from './shared.js'

const ROAD = 'path'
const PAVEMENT = 'pavement'
const ROAD_WIDTH = 2
// A block is at least this many tiles across: a one-tile pavement margin around a building of at least 4 (a 2 x 2 room).
const MIN_BLOCK = 6

// Splits a run of tiles into blocks about `span` across separated by roads; returns [first, last] per block.
function blocksAlong(length, random, span = 9) {
  const count = Math.max(1, Math.min(Math.round((length + ROAD_WIDTH) / (span + ROAD_WIDTH)), Math.floor((length + ROAD_WIDTH) / (MIN_BLOCK + ROAD_WIDTH))))
  const total = length - (count - 1) * ROAD_WIDTH
  const sizes = Array.from({ length: count }, (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0))
  for (let i = 0; i < count - 1; i++) {
    const shift = randomInt(random, -1, 1)
    if (sizes[i] + shift >= MIN_BLOCK && sizes[i + 1] - shift >= MIN_BLOCK) {
      sizes[i] += shift
      sizes[i + 1] -= shift
    }
  }
  let next = 0
  return sizes.map((size) => {
    const range = [next, next + size - 1]
    next += size + ROAD_WIDTH
    return range
  })
}

// One building, or two side by side with an alley between when the block is long enough.
function buildingRects(block, random) {
  const inner = { x0: block.x0 + 1, x1: block.x1 - 1, y0: block.y0 + 1, y1: block.y1 - 1 }
  const width = inner.x1 - inner.x0 + 1
  const height = inner.y1 - inner.y0 + 1
  if (width < 4 || height < 4) return []
  if (width >= 9 && width >= height && random() < 0.7) {
    const split = inner.x0 + Math.floor((width - 1) / 2)
    return [
      { ...inner, x1: split - 1 },
      { ...inner, x0: split + 1 },
    ]
  }
  if (height >= 9 && random() < 0.7) {
    const split = inner.y0 + Math.floor((height - 1) / 2)
    return [
      { ...inner, y1: split - 1 },
      { ...inner, y0: split + 1 },
    ]
  }
  return [inner]
}

// A doorway on a wall facing a road, if the building has one (blocks on the map's edge don't face a road there).
function doorSide(tiles, rect, random) {
  const width = tiles[0].length
  const height = tiles.length
  const facing = [
    rect.y0 > 1 && 'top',
    rect.y1 < height - 2 && 'bottom',
    rect.x0 > 1 && 'left',
    rect.x1 < width - 2 && 'right',
  ].filter(Boolean)
  return shuffle(facing.length ? facing : ['top', 'bottom', 'left', 'right'], random)[0]
}

// The plaza is a little park of the biome's ground, with a fountain in the middle and the biome's plants at its corners.
function buildPlaza(tiles, block, biome) {
  const width = block.x1 - block.x0 + 1
  const height = block.y1 - block.y0 + 1
  roomCells(block).forEach(({ x, y }) => (tiles[y][x] = biome.ground))
  const size = Math.min(width, height) >= 8 ? 2 : 1
  const x0 = block.x0 + Math.floor((width - size) / 2)
  const y0 = block.y0 + Math.floor((height - size) / 2)
  placeSolid(tiles, roomCells({ x0, x1: x0 + size - 1, y0, y1: y0 + size - 1 }), 'fountain')
  let i = 0
  for (const x of [block.x0 + 1, block.x1 - 1]) for (const y of [block.y0 + 1, block.y1 - 1]) placeSolid(tiles, [{ x, y }], biome.plants[i++ % biome.plants.length])
}

export function generateCity(map, random, areaNames, biome) {
  const { width, height } = map
  const wall = biome.walls.city
  const tiles = Array.from({ length: height }, () => Array(width).fill(ROAD))
  const keep = new Set()
  const area = width * height

  const columns = blocksAlong(width, random)
  const rows = blocksAlong(height, random)
  const blocks = rows.flatMap(([y0, y1]) => columns.map(([x0, x1]) => ({ x0, x1, y0, y1 })))
  blocks.forEach((block) => roomCells(block).forEach(({ x, y }) => (tiles[y][x] = PAVEMENT)))

  const plaza = blocks.length > 1 ? shuffle(blocks, random)[0] : null
  const buildings = blocks
    .filter((block) => block !== plaza)
    .flatMap((block) => buildingRects(block, random))
    .map((rect) => placeBuilding(tiles, keep, rect, doorSide(tiles, rect, random), random, { wall, floor: FLOOR_TILE }))
  if (plaza) buildPlaza(tiles, plaza, biome)

  buildings.forEach(({ room }) => furnishRoom(tiles, keep, room, random, { floor: FLOOR_TILE, walls: new Set([wall]) }))
  // Street furniture: planters along the kerb and the odd stack of crates.
  const kerb = (cell) => neighboursOf(cell).some(({ x, y }) => tiles[y]?.[x] === ROAD)
  scatter(tiles, keep, Math.round(area / 80), 'planter', random, PAVEMENT, kerb)
  scatter(tiles, keep, Math.round(area / 120), CRATE_TILE, random, PAVEMENT)
  if (random() < 0.6) placeHazard(tiles, keep, shuffle(blocks, random), random, PAVEMENT)

  const horizontal = width >= height
  const along = ({ x, y }) => (horizontal ? x : y)
  const outside = markerCells(tiles, allCells(tiles)).filter(({ x, y }) => tiles[y][x] !== FLOOR_TILE)
  const markers = markersAtEnds(outside, along, random)

  const areas = [
    ...(plaza ? labelRegions(tiles, [roomCells(plaza)], areaNameLists.cityPlaza, random) : []),
    ...labelRegions(
      tiles,
      buildings.map(({ room }) => roomCells(room)),
      areaNames,
      random,
    ),
  ]
  return { ...map, tiles, areas, markers }
}
