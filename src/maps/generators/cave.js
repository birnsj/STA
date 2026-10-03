// Cave: solid rock with oval chambers carved out and joined by winding tunnels, boulders inside the chambers for cover.
// No hazard. Players start in one chamber and enemies in the chamber farthest from it on foot. The biome supplies the
// floor, walls and boulders, plus its cave features (flooded pools, lava, snow drifts).
import { applyFeatures, key, labelRegions, makeGrid, markerCells, markersAtEnds, pickMarkers, placeSolid, randomInt, shuffle, walkDistances } from './shared.js'

// Oval chambers that don't overlap, kept a tile in from the map edge.
function carveChambers(tiles, random, floor) {
  const width = tiles[0].length
  const height = tiles.length
  const area = width * height
  const count = Math.max(area >= 300 ? 3 : 1, Math.min(6, Math.round(area / 90)))
  const maxRx = Math.max(1, Math.min(5, Math.floor((width - 2) / 3)))
  const maxRy = Math.max(1, Math.min(4, Math.floor((height - 2) / 3)))
  const chambers = []
  for (let attempt = 0; attempt < 150 && chambers.length < count; attempt++) {
    const rx = randomInt(random, Math.min(2, maxRx), maxRx)
    const ry = randomInt(random, Math.min(2, maxRy), maxRy)
    const centre = { x: randomInt(random, 1, width - 2), y: randomInt(random, 1, height - 2) }
    const apart = chambers.every((other) => Math.abs(other.centre.x - centre.x) > other.rx + rx || Math.abs(other.centre.y - centre.y) > other.ry + ry)
    if (!apart) continue
    const cells = []
    for (let y = Math.max(1, centre.y - ry); y <= Math.min(height - 2, centre.y + ry); y++) {
      for (let x = Math.max(1, centre.x - rx); x <= Math.min(width - 2, centre.x + rx); x++) {
        if (((x - centre.x) / (rx + 0.5)) ** 2 + ((y - centre.y) / (ry + 0.5)) ** 2 <= 1) cells.push({ x, y })
      }
    }
    cells.forEach(({ x, y }) => (tiles[y][x] = floor))
    chambers.push({ centre, rx, ry, cells })
  }
  return chambers
}

// Walks from a to b mostly toward b, wandering sideways now and then, carving cave floor (two wide on big maps).
function carveTunnel(tiles, a, b, random, wide, floor) {
  const width = tiles[0].length
  const height = tiles.length
  const inside = ({ x, y }) => x >= 1 && y >= 1 && x <= width - 2 && y <= height - 2
  const carve = ({ x, y }) => {
    tiles[y][x] = floor
    if (wide && inside({ x: x + 1, y })) tiles[y][x + 1] = floor
  }
  let cell = { ...a }
  carve(cell)
  for (let steps = 0; (cell.x !== b.x || cell.y !== b.y) && steps < (width + height) * 6; steps++) {
    const toward = []
    if (cell.x !== b.x) toward.push({ x: cell.x + Math.sign(b.x - cell.x), y: cell.y })
    if (cell.y !== b.y) toward.push({ x: cell.x, y: cell.y + Math.sign(b.y - cell.y) })
    const sideways = [
      { x: cell.x + 1, y: cell.y },
      { x: cell.x - 1, y: cell.y },
      { x: cell.x, y: cell.y + 1 },
      { x: cell.x, y: cell.y - 1 },
    ].filter(inside)
    cell = random() < 0.25 && sideways.length ? shuffle(sideways, random)[0] : shuffle(toward, random)[0]
    carve(cell)
  }
  // A wander that ran out of steps finishes in a straight L.
  while (cell.x !== b.x) carve((cell = { x: cell.x + Math.sign(b.x - cell.x), y: cell.y }))
  while (cell.y !== b.y) carve((cell = { x: cell.x, y: cell.y + Math.sign(b.y - cell.y) }))
}

export function generateCave(map, random, areaNames, biome) {
  const { width, height } = map
  const { floor, wall, boulder } = biome.cave
  const tiles = makeGrid(width, height, () => wall)
  const chambers = carveChambers(tiles, random, floor)
  const wide = Math.min(width, height) >= 24

  // Each chamber joins the nearest one already joined, so the whole cave is one network.
  const distance = (a, b) => Math.abs(a.centre.x - b.centre.x) + Math.abs(a.centre.y - b.centre.y)
  chambers.slice(1).forEach((chamber, i) => {
    const nearest = chambers.slice(0, i + 1).reduce((best, other) => (distance(chamber, other) < distance(chamber, best) ? other : best))
    carveTunnel(tiles, nearest.centre, chamber.centre, random, wide, floor)
  })

  // Farthest chamber on foot, measured before boulders go in (every chamber centre is still open floor).
  const start = chambers[0].centre
  const walk = walkDistances(tiles, start)
  const enemyChamber = chambers.reduce((best, chamber) => ((walk.get(key(chamber.centre)) ?? 0) > (walk.get(key(best.centre)) ?? 0) ? chamber : best))

  chambers.forEach((chamber) => {
    let boulders = Math.floor(chamber.cells.length / 14)
    for (const cell of shuffle(chamber.cells, random)) {
      if (boulders <= 0) break
      if (tiles[cell.y][cell.x] === floor && placeSolid(tiles, [cell], boulder)) boulders--
    }
  })
  applyFeatures(tiles, new Set(), biome.caveFeatures, floor, random)

  const markers =
    enemyChamber === chambers[0]
      ? markersAtEnds(markerCells(tiles, chambers[0].cells), ({ x, y }) => x + y, random)
      : pickMarkers(markerCells(tiles, chambers[0].cells), markerCells(tiles, enemyChamber.cells), random)
  const areas = labelRegions(
    tiles,
    chambers.map((chamber) => chamber.cells),
    areaNames,
    random,
  )
  return { ...map, tiles, areas, markers }
}
