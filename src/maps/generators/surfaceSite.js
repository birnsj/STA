// Ruins (saved as map type 'surfaceSite'): open ground with fragments of ruined wall (straight and L-shaped) among the
// biome's natural features at reduced density. No buildings and no hazard. Players and enemies start at opposite corners.
import { applyFeatures, cornerMarkers, isFree, makeGrid, placeSolid, randomInt, zoneLabels } from './shared.js'

const RUIN = 'ruinWall'
// The ruins take up room the wild would otherwise fill.
const FEATURE_SCALE = 0.6

// A short run of ruined wall, sometimes turning a corner. Placed whole if the map stays connected, else skipped.
function ruinFragment(tiles, keep, random, ground) {
  const width = tiles[0].length
  const height = tiles.length
  const start = { x: randomInt(random, 1, width - 2), y: randomInt(random, 1, height - 2) }
  const horizontal = random() < 0.5
  const length = randomInt(random, 3, 6)
  const cells = Array.from({ length }, (_, i) => (horizontal ? { x: start.x + i, y: start.y } : { x: start.x, y: start.y + i }))
  if (random() < 0.5) {
    const end = cells[cells.length - 1]
    const turn = randomInt(random, 2, 4)
    const sign = random() < 0.5 ? 1 : -1
    for (let i = 1; i <= turn; i++) cells.push(horizontal ? { x: end.x, y: end.y + sign * i } : { x: end.x + sign * i, y: end.y })
  }
  if (cells.every((cell) => isFree(tiles, keep, cell, ground))) placeSolid(tiles, cells, RUIN)
}

export function generateSurfaceSite(map, random, areaNames, biome) {
  const { width, height } = map
  const tiles = makeGrid(width, height, () => biome.ground)
  const keep = new Set()

  for (let i = Math.round((width * height) / 70); i > 0; i--) ruinFragment(tiles, keep, random, biome.ground)
  applyFeatures(tiles, keep, biome.features, biome.ground, random, FEATURE_SCALE)

  return { ...map, tiles, areas: zoneLabels(tiles, areaNames, random), markers: cornerMarkers(tiles, random) }
}
