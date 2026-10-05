// Map files: combat-independent layouts (tiles, area labels, player starts and enemy spawns) saved in the project's maps/ folder.
// A combat mode loads a map and adds its own rules, roster and objectives; nothing here belongs to a combat type.
// The name doubles as the mission location; episodeName is the title Load Episode lists it under.
// mapType: the location (a Generate Map layout id, see mapGenerators.js); it picks the names and layout Generate uses.
// biome: the terrain a ground location is built in (an id from biomes.json).
// weather: the outdoor weather shown over the map (an id from weather.json); indoor locations are always clear.
// card: the episode's picture in Load Episode: an id from episodeCards.json, the path of a picture Generate Card drew, or null.
// In memory a map is { id, name, episodeName, card, mapType, biome, weather, width, height, tiles: tile id grid [y][x], areas, markers } with { x, y } positions;
// on disk the tiles are rows of catalogue symbols and positions are [x, y].
import catalogue from '../data/adaptation/maps/tiles.json'

export const MAP_SCHEMA_VERSION = 1
export const TILES = catalogue.tiles
export const TILE_IMAGE = catalogue.imageSize
export const PALETTE_GROUPS = catalogue.paletteGroups ?? []
export const FLOOR_TILE = 'floor'
export const WALL_TILE = 'bulkhead'
export const MIN_SIZE = 4
export const MAX_SIZE = 48
// Maps saved before map types existed are starship decks.
export const DEFAULT_MAP_TYPE = 'starshipDeck'
// Maps saved before biomes existed are temperate (ships and stations keep a biome too, but don't use it).
export const DEFAULT_BIOME = 'temperate'
// Maps saved before weather existed are clear (an id from weather.json).
const CLEAR_WEATHER = 'clear'
// Map types from before the location / biome split that were really biomes: they load as Wilderness in that biome.
const BIOME_MAP_TYPES = new Set(['forest', 'swamp', 'desert', 'iceField', 'volcanic'])

const BY_ID = new Map(TILES.map((tile) => [tile.id, tile]))
const BY_SYMBOL = new Map(TILES.map((tile) => [tile.symbol, tile]))
export const getTile = (id) => BY_ID.get(id) ?? BY_ID.get(FLOOR_TILE)
export const tileIdForSymbol = (symbol) => BY_SYMBOL.get(symbol)?.id ?? FLOOR_TILE

const toPosition = ([x, y]) => ({ x, y })
const fromPosition = ({ x, y }) => [x, y]
const isInside = (width, height, { x, y }) => x >= 0 && y >= 0 && x < width && y < height

// A map's id is its file name (maps/{id}.json): the map name without the characters Windows forbids in file names.
// Mirrors tools/mapStore.cjs, which refuses anything else.
const FORBIDDEN = new Set('<>:"/\\|?*')
export function mapFileId(name) {
  return (
    [...String(name ?? '')]
      .filter((char) => !FORBIDDEN.has(char) && char.charCodeAt(0) >= 32)
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\.+$/, '')
      .slice(0, 60)
  )
}

export const episodeTitle = (map) => map.episodeName?.trim() || 'Untitled Episode'

export function createBlankMap({ name = 'Untitled Map', width = 16, height = 12 } = {}) {
  const tiles = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? WALL_TILE : FLOOR_TILE)),
  )
  return {
    id: mapFileId(name),
    name,
    episodeName: '',
    card: null,
    mapType: DEFAULT_MAP_TYPE,
    biome: DEFAULT_BIOME,
    weather: CLEAR_WEATHER,
    width,
    height,
    tiles,
    areas: [],
    markers: { playerStarts: [], enemySpawns: [] },
  }
}

// id: the file name the map was loaded from.
export function parseMapFile(file, id) {
  const rows = file.rows ?? []
  const width = Math.max(...rows.map((row) => row.length), 0)
  const tiles = rows.map((row) => Array.from({ length: width }, (_, x) => tileIdForSymbol(row[x] ?? '.')))
  const inside = (position) => isInside(width, rows.length, position)
  const oldBiomeType = BIOME_MAP_TYPES.has(file.mapType)
  return {
    id,
    name: file.name ?? id,
    episodeName: file.episodeName ?? '',
    card: file.card ?? null,
    mapType: oldBiomeType ? 'wilderness' : (file.mapType ?? DEFAULT_MAP_TYPE),
    biome: oldBiomeType ? file.mapType : (file.biome ?? DEFAULT_BIOME),
    weather: file.weather ?? CLEAR_WEATHER,
    width,
    height: rows.length,
    tiles,
    areas: (file.areas ?? []).map((area) => ({ name: area.name, position: toPosition(area.position) })).filter((area) => inside(area.position)),
    markers: {
      playerStarts: (file.markers?.playerStarts ?? []).map(toPosition).filter(inside),
      enemySpawns: (file.markers?.enemySpawns ?? []).map(toPosition).filter(inside),
    },
  }
}

export function serializeMap(map) {
  return {
    schemaVersion: MAP_SCHEMA_VERSION,
    name: map.name,
    episodeName: map.episodeName.trim(),
    card: map.card ?? null,
    mapType: map.mapType ?? DEFAULT_MAP_TYPE,
    biome: map.biome ?? DEFAULT_BIOME,
    weather: map.weather ?? CLEAR_WEATHER,
    rows: map.tiles.map((row) => row.map((id) => getTile(id).symbol).join('')),
    areas: map.areas.map((area) => ({ name: area.name, position: fromPosition(area.position) })),
    markers: {
      playerStarts: map.markers.playerStarts.map(fromPosition),
      enemySpawns: map.markers.enemySpawns.map(fromPosition),
    },
  }
}

// Keeps the top-left corner; new tiles are floor and anything that falls outside is dropped.
export function resizeMap(map, width, height) {
  const w = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(width)))
  const h = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(height)))
  const inside = (position) => isInside(w, h, position)
  return {
    ...map,
    width: w,
    height: h,
    tiles: Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => map.tiles[y]?.[x] ?? FLOOR_TILE)),
    areas: map.areas.filter((area) => inside(area.position)),
    markers: { playerStarts: map.markers.playerStarts.filter(inside), enemySpawns: map.markers.enemySpawns.filter(inside) },
  }
}

// Warnings only: a map can be saved in any state. requirements come from whichever mode will play it.
export function validateMap(map, { enemySpawns = 0, label = 'this mode' } = {}) {
  const warnings = []
  const tileAt = ({ x, y }) => getTile(map.tiles[y][x])
  const { playerStarts, enemySpawns: spawns } = map.markers
  if (!mapFileId(map.name)) warnings.push('The map needs a name before it can be saved.')
  if (!playerStarts.length) warnings.push('No player start.')
  if (spawns.length < enemySpawns) warnings.push(`${spawns.length} enemy spawn${spawns.length === 1 ? '' : 's'}; ${label} needs ${enemySpawns}.`)
  ;[...playerStarts, ...spawns].forEach((position) => {
    if (tileAt(position).solid) warnings.push(`A marker at ${position.x}, ${position.y} is on a solid tile.`)
  })
  const roles = new Set(map.tiles.flat().map((id) => getTile(id).role))
  if (roles.has('hazard') && !roles.has('hazardControl')) warnings.push('Hazard tiles but no hazard control, so the hazard can never be set off.')
  if (roles.has('hazardControl') && !roles.has('hazard')) warnings.push('A hazard control but no hazard tiles.')
  return warnings
}
