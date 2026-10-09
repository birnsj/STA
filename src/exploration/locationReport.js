// The location and environment part of a Scan report (designer decision, 2026-10-09): only what the map already holds
// (its name and location type, the named area, biome, weather, light, scene traits); nothing new is authored for it.
import { biomeFor, generatorFor, usesBiome } from '../maps/mapGenerators.js'
import { FULL_LIGHT } from '../maps/mapFormat.js'
import { isIndoors, weatherFor } from '../maps/mapWeather.js'

// Implementation detail: areas are named points on the map, so "the area you stand in" is the nearest one.
function nearestArea(map, position) {
  const areas = map.areas ?? []
  if (!areas.length) return null
  const distance = (area) => Math.hypot(area.position.x - position.x, area.position.y - position.y)
  return areas.reduce((best, area) => (distance(area) < distance(best) ? area : best))
}

// { mapName, locationType, area, biome, weather, light, traits }: biome is null away from a planet's surface, weather
// null indoors; light is the map's ambient light (0-100).
export function locationReport(map, scenario, position) {
  return {
    mapName: map.name,
    locationType: generatorFor(map.mapType).label,
    area: nearestArea(map, position)?.name ?? null,
    biome: usesBiome(map) ? biomeFor(map.biome).label : null,
    weather: isIndoors(map) ? null : weatherFor(map.weather).label,
    light: map.ambient ?? FULL_LIGHT,
    traits: scenario.traits.map((trait) => trait.name),
  }
}
