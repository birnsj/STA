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
import { generateCrashSite } from './generators/crashSite.js'
import { generateDerelict } from './generators/derelict.js'
import { generateFarm } from './generators/farm.js'
import { generateFieldCamp } from './generators/fieldCamp.js'
import {
  generateAlienHive,
  generateAlienTemple,
  generateAlienVessel,
  generateCantina,
  generateDetention,
  generateLaboratory,
} from './generators/interiors.js'
import { generateKlingonShip, generateKlingonStation } from './generators/klingon.js'
import { generateLandingField } from './generators/landingField.js'
import { generateMiningSite } from './generators/miningSite.js'
import { generateOutpost } from './generators/outpost.js'
import { generateSpaceStation } from './generators/spaceStation.js'
import { generateStarshipDeck } from './generators/starshipDeck.js'
import { generateSurfaceSite } from './generators/surfaceSite.js'
import { generateWilderness } from './generators/wilderness.js'
import { withLayoutScale } from './generators/shared.js'
import { applyWallVariants } from './generators/wallVariants.js'
import { pickCard } from './episodeCards.js'
import { DEFAULT_BIOME, mapFileId } from './mapFormat.js'

const locationList = (categoryId) => locationNames.categories.find((category) => category.id === categoryId)?.names ?? []

// The editor's Location list. group: its heading in the list (LOCATION_GROUPS). nameCategory: the locationNames.json
// category Generate Name and Generate Map draw the map's name from. areaNames: its area labels. setting: 'space' (ships
// and stations), 'ground' (built in the chosen biome) or 'interior' (indoors on a world, no biome). biomeNames:
// Wilderness takes its name and area labels from the biome instead.
// generate(map, random, areaNames, biome) returns the map with new tiles, areas and markers at the same size.
const own = (id) => ({ nameCategory: id, areaNames: areaNames[id] ?? [] })
// The station's side rooms use the stationRoom list, less the names kept for its promenade.
const stationHall = areaNames.spaceStation.hall
const stationAreaNames = { hall: stationHall, room: locationList('stationRoom').filter((name) => !stationHall.includes(name)) }
export const MAP_GENERATORS = [
  { id: 'starshipDeck', label: 'Starship Deck', group: 'space', setting: 'space', nameCategory: 'shipRoom', areaNames: locationList('shipRoom'), generate: generateStarshipDeck },
  { id: 'spaceStation', label: 'Space Station', group: 'space', setting: 'space', nameCategory: 'stationRoom', areaNames: stationAreaNames, generate: generateSpaceStation },
  { id: 'derelict', label: 'Derelict Ship', group: 'space', setting: 'space', nameCategory: 'derelict', areaNames: locationList('shipRoom'), generate: generateDerelict },
  { id: 'klingonShip', label: 'Klingon Ship', group: 'klingon', setting: 'space', ...own('klingonShip'), generate: generateKlingonShip },
  { id: 'klingonStation', label: 'Klingon Station', group: 'klingon', setting: 'space', ...own('klingonStation'), generate: generateKlingonStation },
  { id: 'colony', label: 'Small Colony', group: 'surface', setting: 'ground', ...own('colony'), generate: generateColony },
  { id: 'outpost', label: 'Outpost', group: 'surface', setting: 'ground', ...own('outpost'), generate: generateOutpost },
  { id: 'city', label: 'Small City', group: 'surface', setting: 'ground', ...own('city'), generate: generateCity },
  { id: 'farm', label: 'Farmstead', group: 'surface', setting: 'ground', ...own('farm'), generate: generateFarm },
  { id: 'miningSite', label: 'Mining Site', group: 'surface', setting: 'ground', ...own('miningSite'), generate: generateMiningSite },
  { id: 'landingField', label: 'Landing Field', group: 'surface', setting: 'ground', ...own('landingField'), generate: generateLandingField },
  { id: 'fieldCamp', label: 'Field Camp', group: 'surface', setting: 'ground', ...own('fieldCamp'), generate: generateFieldCamp },
  { id: 'crashSite', label: 'Crash Site', group: 'surface', setting: 'ground', ...own('crashSite'), generate: generateCrashSite },
  { id: 'surfaceSite', label: 'Ruins', group: 'surface', setting: 'ground', ...own('surfaceSite'), generate: generateSurfaceSite },
  { id: 'wilderness', label: 'Wilderness', group: 'surface', setting: 'ground', biomeNames: true, generate: generateWilderness },
  { id: 'cave', label: 'Cave', group: 'surface', setting: 'ground', ...own('cave'), generate: generateCave },
  { id: 'laboratory', label: 'Research Lab', group: 'indoor', setting: 'interior', ...own('laboratory'), generate: generateLaboratory },
  { id: 'cantina', label: 'Cantina', group: 'indoor', setting: 'interior', ...own('cantina'), generate: generateCantina },
  { id: 'detention', label: 'Detention Block', group: 'indoor', setting: 'interior', ...own('detention'), generate: generateDetention },
  { id: 'alienTemple', label: 'Alien Temple', group: 'alien', setting: 'interior', ...own('alienTemple'), generate: generateAlienTemple },
  { id: 'alienHive', label: 'Alien Hive', group: 'alien', setting: 'interior', ...own('alienHive'), generate: generateAlienHive },
  { id: 'alienVessel', label: 'Alien Vessel', group: 'alien', setting: 'interior', ...own('alienVessel'), generate: generateAlienVessel },
]
// The Location list's groups, in order.
export const LOCATION_GROUPS = [
  { id: 'space', label: 'Space' },
  { id: 'klingon', label: 'Klingon' },
  { id: 'surface', label: 'Planet Surface' },
  { id: 'indoor', label: 'Indoor' },
  { id: 'alien', label: 'Alien' },
]

export const BIOMES = biomeData.biomes
// The Biome list's groups, by each biome's world.
export const BIOME_WORLDS = [
  { id: 'earth', label: 'Earth-like' },
  { id: 'alien', label: 'Alien' },
]

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

// Size presets: each location has its own dimensions for Small / Medium / Large / Huge / Gigantic (the biome doesn't change them).
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
// be reproduced. scale: { rooms, buildings }, the editor's size sliders as multipliers (1 = each generator's own sizes).
export function generateMap(map, random = Math.random, scale = {}) {
  const generator = generatorFor(map.mapType)
  const biome = biomeFor(map.biome)
  const layout = withLayoutScale(scale, () => generator.generate(map, random, areaNamesOf(map), biome))
  return { ...applyWallVariants(layout, random), mapType: generator.id, biome: biome.id }
}

// A complete, playable map: a layout plus a location name no existing map file uses, an episode name and a card.
// takenIds: the ids (file names) of the maps already saved.
export function generateNamedMap(map, takenIds, random = Math.random, scale = {}) {
  const taken = new Set(takenIds.map((id) => id.toLowerCase()))
  const name = randomUnusedLocationName(nameCategoryOf(map), (candidate) => taken.has(mapFileId(candidate).toLowerCase()), random)
  const layout = generateMap(map, random, scale)
  return { ...layout, name, id: mapFileId(name), episodeName: randomEpisodeName('', random, name), card: randomEpisodeCard({ ...layout, card: null }, random) }
}
