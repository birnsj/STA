// Wilderness: open country in the chosen biome at full feature density (groves, pools, mesas, crevasses, lava channels),
// with the biome's trail, if it has one, winding across first so the features grow around it. No buildings and no
// hazard. Players and enemies start at opposite corners. Prototype layout, not a source-book rule.
import { applyFeatures, cornerMarkers, makeGrid, wanderAcross, zoneLabels } from './shared.js'

export function generateWilderness(map, random, areaNames, biome) {
  const tiles = makeGrid(map.width, map.height, () => biome.ground)
  const keep = new Set()
  if (biome.trail) wanderAcross(tiles, keep, biome.trail, biome.ground, random)
  applyFeatures(tiles, keep, biome.features, biome.ground, random)
  return { ...map, tiles, areas: zoneLabels(tiles, areaNames, random), markers: cornerMarkers(tiles, random) }
}
