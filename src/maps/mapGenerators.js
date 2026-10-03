// The map editor's Generate Map. A map has a location (map.mapType: what was built there, one entry in MAP_GENERATORS
// with its builder in generators/) and, for ground locations, a biome (map.biome: the terrain, from biomes.json).
// Prototype layout logic, not a source-book rule.
import areaNames from '../data/adaptation/maps/areaNames.json'
import biomeData from '../data/adaptation/maps/biomes.json'
import locationNames from '../data/adaptation/maps/locationNames.json'
import mapSizes from '../data/adaptation/maps/mapSizes.json'
import { randomEpisodeName, randomLocationName, randomUnusedLocationName } from '../rules/locationNames.js'
import { generateCave } from './generators/cave.js'
import { generateCity } from './generators/city.js'
import { generateColony } from './generators/colony.js'
import { generateDerelict } from './generators/derelict.js'
import { generateOutpost } from './generators/outpost.js'
import { generateSpaceStation } from './generators/spaceStation.js'
import { generateStarshipDeck } from './generators/starshipDeck.js'
import { generateSurfaceSite } from './generators/surfaceSite.js'
import { generateWilderness } from './generators/wilderness.js'
import { pickCard } from './episodeCards.js'
import { DEFAULT_BIOME, mapFileId } from './mapFormat.js'

const locationList = (categoryId) => locationNames.categories.find((category) => category.id === categoryId)?.names ?? []

// The editor's Location list. nameCategory: the locationNames.json category Generate Name and Generate Map draw the
// map's name from. areaNames: its area labels. setting: 'space' (ships and stations) or 'ground' (built in the chosen
// biome). biomeNames: Wilderness takes its name and area labels from the biome instead.
// generate(map, random, areaNames, biome) returns the map with new tiles, areas and markers at the same size.
export const MAP_GENERATORS = [
  { id: 'starshipDeck', label: 'Starship Deck', setting: 'space', nameCategory: 'shipRoom', areaNames: locationList('shipRoom'), generate: generateStarshipDeck },
  { id: 'spaceStation', label: 'Space Station', setting: 'space', nameCategory: 'stationRoom', areaNames: locationList('stationRoom'), generate: generateSpaceStation },
  { id: 'derelict', label: 'Derelict Ship', setting: 'space', nameCategory: 'derelict', areaNames: locationList('shipRoom'), generate: generateDerelict },
  { id: 'colony', label: 'Small Colony', setting: 'ground', nameCategory: 'colony', areaNames: areaNames.colony, generate: generateColony },
  { id: 'outpost', label: 'Outpost', setting: 'ground', nameCategory: 'outpost', areaNames: areaNames.outpost, generate: generateOutpost },
  { id: 'city', label: 'Small City', setting: 'ground', nameCategory: 'city', areaNames: areaNames.city, generate: generateCity },
  { id: 'surfaceSite', label: 'Ruins', setting: 'ground', nameCategory: 'surfaceSite', areaNames: areaNames.surfaceSite, generate: generateSurfaceSite },
  { id: 'wilderness', label: 'Wilderness', setting: 'ground', biomeNames: true, generate: generateWilderness },
  { id: 'cave', label: 'Cave', setting: 'ground', nameCategory: 'cave', areaNames: areaNames.cave, generate: generateCave },
]

export const BIOMES = biomeData.biomes

// Unknown ids fall back to the first entry.
export const generatorFor = (typeId) => MAP_GENERATORS.find((entry) => entry.id === typeId) ?? MAP_GENERATORS[0]
export const biomeFor = (biomeId) => BIOMES.find((biome) => biome.id === biomeId) ?? BIOMES.find((biome) => biome.id === DEFAULT_BIOME)
// 'space' or 'ground': where the map's location is. Only ground locations use a biome.
export const settingOf = (map) => generatorFor(map.mapType).setting
export const usesBiome = (map) => settingOf(map) === 'ground'

const nameCategoryOf = (map) => {
  const generator = generatorFor(map.mapType)
  return generator.biomeNames ? biomeFor(map.biome).nameCategory : generator.nameCategory
}
const areaNamesOf = (map) => {
  const generator = generatorFor(map.mapType)
  return generator.biomeNames ? (areaNames[biomeFor(map.biome).id] ?? []) : generator.areaNames
}

// Generate Name: a name of the map's kind, never the current one.
export const randomMapName = (map, random = Math.random) => randomLocationName(nameCategoryOf(map), map.name, random)

// Generate Card: the id of a card that suits the map's location (and biome, on the ground), never the current one when
// another suits; null when none do.
export const randomEpisodeCard = (map, random = Math.random) =>
  pickCard(generatorFor(map.mapType).id, usesBiome(map) ? biomeFor(map.biome).id : null, map.card, random)?.id ?? null

// Size presets: each location has its own dimensions for Small / Medium / Large / Huge (the biome doesn't change them).
export const MAP_SIZES = mapSizes.sizes
export const DEFAULT_SIZE = 'medium'
export function sizeFor(typeId, sizeId) {
  const [width, height] = (mapSizes.byType[generatorFor(typeId).id] ?? mapSizes.byType.starshipDeck)[sizeId] ?? [16, 12]
  return { width, height }
}
// The preset the map's current dimensions match for its location, or 'custom'.
export function sizeIdOf(map) {
  const match = MAP_SIZES.find((size) => {
    const { width, height } = sizeFor(map.mapType, size.id)
    return width === map.width && height === map.height
  })
  return match?.id ?? 'custom'
}

// Layout only (tiles, areas, markers) for the map's location and biome, at its size. random: injectable so a layout can
// be reproduced.
export function generateMap(map, random = Math.random) {
  const generator = generatorFor(map.mapType)
  const biome = biomeFor(map.biome)
  return { ...generator.generate(map, random, areaNamesOf(map), biome), mapType: generator.id, biome: biome.id }
}

// A complete, playable map: a layout plus a location name no existing map file uses, an episode name and a card.
// takenIds: the ids (file names) of the maps already saved.
export function generateNamedMap(map, takenIds, random = Math.random) {
  const taken = new Set(takenIds.map((id) => id.toLowerCase()))
  const name = randomUnusedLocationName(nameCategoryOf(map), (candidate) => taken.has(mapFileId(candidate).toLowerCase()), random)
  const layout = generateMap(map, random)
  return { ...layout, name, id: mapFileId(name), episodeName: randomEpisodeName('', random), card: randomEpisodeCard({ ...layout, card: null }, random) }
}
