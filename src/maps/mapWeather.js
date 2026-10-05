import weatherData from '../data/adaptation/maps/weather.json'
import { generatorFor, settingOf } from './mapGenerators.js'

export const DEFAULT_WEATHER = weatherData.default
const BY_ID = new Map(weatherData.weather.map((entry) => [entry.id, entry]))

export const weatherFor = (weatherId) => BY_ID.get(weatherId) ?? BY_ID.get(DEFAULT_WEATHER)
export const isIndoors = (map) => settingOf(map) !== 'ground' || weatherData.indoorLocations.includes(generatorFor(map.mapType).id)

// Generate Map's odds for the map: indoor locations have their own atmospheres, outdoor ones follow the biome.
const oddsFor = (map) => (isIndoors(map) ? weatherData.byLocation[generatorFor(map.mapType).id] : weatherData.byBiome[map.biome]) ?? {}

// The weathers the map offers, in catalogue order (always at least Clear).
export function weatherOptions(map) {
  const odds = oddsFor(map)
  const options = weatherData.weather.filter((entry) => odds[entry.id])
  return options.length ? options : [weatherFor(DEFAULT_WEATHER)]
}

// Keeps a weather the map's location and biome still offer; anything else becomes Clear.
export function settleWeather(map) {
  const weather = weatherOptions(map).some((entry) => entry.id === map.weather) ? map.weather : DEFAULT_WEATHER
  return weather === map.weather ? map : { ...map, weather }
}

const STORMY_KINDS = new Set(['rain', 'snow', 'sand', 'fog'])
const tintAlpha = (tint) => Number(/,\s*([\d.]+)\)\s*$/.exec(tint ?? '')?.[1] ?? 0)
const isStormy = (fx) => Boolean(fx) && (tintAlpha(fx.tint) >= 0.15 || (fx.layers ?? []).some((layer) => STORMY_KINDS.has(layer.kind) && layer.angle !== 180))

// Generate Card: the skies a weather's picture may use, or null for any of the biome's skies.
export function cardSkiesFor(weatherId) {
  const weather = weatherFor(weatherId)
  return weather.cardSkies ?? (isStormy(weather.fx) ? weatherData.stormySkies : null)
}

// Generate Map: a weather from the map's odds.
export function randomWeather(map, random = Math.random) {
  const odds = Object.entries(oddsFor(map))
  let roll = random() * odds.reduce((sum, [, weight]) => sum + weight, 0)
  for (const [id, weight] of odds) {
    roll -= weight
    if (roll < 0) return id
  }
  return DEFAULT_WEATHER
}
