// Crash Site: a scorched impact scar across open ground with the broken hull lying along it, burning wreckage and debris
// strewn around it, in otherwise untouched terrain. The biome supplies the ground and most of its natural features.
import { applyFeatures, cornerMarkers, growBlob, makeGrid, placeSolid, randomInt, scatter, zoneLabels } from './shared.js'

const FEATURE_SCALE = 0.7

export function generateCrashSite(map, random, areaNames, biome) {
  const { width, height } = map
  const { ground } = biome
  const tiles = makeGrid(width, height, () => ground)
  const keep = new Set()
  const area = width * height

  // The scar runs along the long axis from the hull, which came to rest near the middle.
  const horizontal = width >= height
  const centre = { x: Math.floor(width / 2) + randomInt(random, -3, 3), y: Math.floor(height / 2) + randomInt(random, -2, 2) }
  const length = Math.max(4, Math.round((horizontal ? width : height) * 0.6))
  const direction = random() < 0.5 ? 1 : -1
  for (let i = 0; i < length; i++) {
    const along = (horizontal ? centre.x : centre.y) - direction * i
    const spot = horizontal ? { x: along, y: centre.y + randomInt(random, -1, 1) } : { x: centre.x + randomInt(random, -1, 1), y: along }
    if (tiles[spot.y]?.[spot.x] === undefined) break
    growBlob(tiles, keep, spot, randomInt(random, 2, 5), 'scorched', ground, random)
  }

  // The hull: a short broken line of hull sections at the head of the scar, then fires and debris in and around it.
  const sections = randomInt(random, 3, 6)
  for (let i = 0; i < sections; i++) {
    const cell = horizontal ? { x: centre.x + direction * (i - 1), y: centre.y } : { x: centre.x, y: centre.y + direction * (i - 1) }
    if (tiles[cell.y]?.[cell.x] !== undefined && random() < 0.85) placeSolid(tiles, [cell], 'hullWreck')
  }
  scatter(tiles, keep, randomInt(random, 3, 6), 'burningWreck', random, 'scorched')
  scatter(tiles, keep, Math.round(area / 60), 'debris', random, 'scorched')
  scatter(tiles, keep, Math.round(area / 90), 'debris', random, ground)

  applyFeatures(tiles, keep, biome.features, ground, random, FEATURE_SCALE)
  scatter(tiles, keep, Math.round(area / 70), biome.boulder, random, ground)

  const markers = cornerMarkers(tiles, random)
  const areas = zoneLabels(tiles, areaNames, random)
  return { ...map, tiles, areas, markers }
}
