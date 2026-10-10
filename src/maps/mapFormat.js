// Map files: combat-independent layouts (tiles, area labels, player starts and enemy spawns) saved in the project's maps/ folder.
// A combat mode loads a map and adds its own rules, roster and objectives; nothing here belongs to a combat type.
// The name doubles as the mission location; episodeName is the title Load Episode lists it under.
// mapType: the location (a Generate Map layout id, see mapGenerators.js); it picks the names and layout Generate uses.
// biome: the terrain a ground location is built in (an id from biomes.json).
// weather: the outdoor weather shown over the map (an id from weather.json); indoor locations are always clear.
// ambient: the light level, 0 (pitch dark) to 100 (normal); glowing tiles stay lit in the dark. Presentation only.
// card: the episode's picture in Load Episode: an id from episodeCards.json, the path of a picture Generate Card drew, or null.
// rotated: tiles turned with the editor's right click. A rotated wall with panels runs its panels along y; any other
// rotated tile is drawn mirrored left to right (iso art has one viewing angle). Presentation only.
// npcs: the NPCs placed in the editor, each a world actor referencing an authored character (characters.json) plus how
// this instance behaves: { id, characterId, name (blank: the character's), position, facing (degrees, 0 = +x),
// faction (blank: the character's), disposition (awareness.json), conversationId (conversations/{id}.json or null),
// npcRules, alertGroupId, alertMethod, responseType }. A map with NPCs of its own doesn't get npcs.json's test NPCs.
// objectives: [{ id, title, description, position (the minimap marks it while active; null: no marker), activeWhen,
// completeWhen }]; their progress is a mission flag (exploration/missionFlags.js). activeWhen / completeWhen: mission
// flag conditions (all must hold) that set it active / complete by themselves (missionObjectives.js); empty or left
// out: only actions change it. objectId: a challenge object the objective is marked on (its marker follows the object;
// position is then unused).
// objectPlacements: { [challenge object id]: position } where this map puts the challenge objects authored for it
// (challenges.json); an object left out stands where challenges.json puts it (challengeObjects.js).
// briefing: the Captain's Log opening text (blank lines split paragraphs); stardate: the episode's starting stardate
// (a number, or null for missionLog.json's default). Both are left out on disk when empty.
// In memory a map is { id, name, episodeName, card, mapType, biome, weather, ambient, width, height, tiles: tile id grid [y][x],
// rotated: boolean grid [y][x] (may be missing: nothing rotated), areas, markers, npcs, objectives, briefing, stardate }
// with { x, y } positions (a player start or enemy spawn may also carry facing, in degrees; without one it faces the
// map's middle);
// on disk the tiles are rows of catalogue symbols, rotated lists the rotated tiles, and positions are [x, y].
import catalogue from '../data/adaptation/maps/tiles.json'

export const MAP_SCHEMA_VERSION = 1
export const TILES = catalogue.tiles
export const TILE_IMAGE = catalogue.imageSize
// A tile's image size in design pixels. Walls and tall objects reach higher than TILE_IMAGE holds, so theirs are taller
// (tiles.json imageHeight); every image is drawn at its own size standing on its tile, never stretched.
export const imageSize = (tile) => (tile.imageHeight ? { width: TILE_IMAGE.width, height: tile.imageHeight } : TILE_IMAGE)
export const PALETTE_GROUPS = catalogue.paletteGroups ?? []
export const FLOOR_TILE = 'floor'
export const WALL_TILE = 'bulkhead'
export const MIN_SIZE = 4
export const MAX_SIZE = 96
// Maps saved before map types existed are starship decks.
export const DEFAULT_MAP_TYPE = 'starshipDeck'
// Maps saved before biomes existed are temperate (ships and stations keep a biome too, but don't use it).
export const DEFAULT_BIOME = 'temperate'
// Maps saved before weather existed are clear (an id from weather.json).
const CLEAR_WEATHER = 'clear'
// Maps saved before ambient light existed are fully lit.
export const FULL_LIGHT = 100
export const clampAmbient = (value) => (Number.isFinite(value) ? Math.min(FULL_LIGHT, Math.max(0, Math.round(value))) : FULL_LIGHT)
// Map types from before the location / biome split that were really biomes: they load as Wilderness in that biome.
const BIOME_MAP_TYPES = new Set(['forest', 'swamp', 'desert', 'iceField', 'volcanic'])

const BY_ID = new Map(TILES.map((tile) => [tile.id, tile]))
const BY_SYMBOL = new Map(TILES.map((tile) => [tile.symbol, tile]))
export const getTile = (id) => BY_ID.get(id) ?? BY_ID.get(FLOOR_TILE)
export const tileIdForSymbol = (symbol) => BY_SYMBOL.get(symbol)?.id ?? FLOOR_TILE

const toPosition = ([x, y]) => ({ x, y })
const fromPosition = ({ x, y }) => [x, y]
// A player start or enemy spawn is [x, y] on disk, or [x, y, facing] once the editor has turned it (degrees, 0 = +x).
const toSpawn = ([x, y, facing]) => (facing == null ? { x, y } : { x, y, facing: Number(facing) })
const fromSpawn = ({ x, y, facing }) => (facing == null ? [x, y] : [x, y, Math.round(facing)])
const isInside = (width, height, { x, y }) => x >= 0 && y >= 0 && x < width && y < height

export const isRotated = (map, { x, y }) => Boolean(map.rotated?.[y]?.[x])
const rotationGrid = (width, height, isOn) => Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => isOn(x, y)))

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
    ambient: FULL_LIGHT,
    width,
    height,
    tiles,
    areas: [],
    markers: { playerStarts: [], enemySpawns: [] },
    npcs: [],
    objectives: [],
    objectPlacements: {},
    briefing: '',
    stardate: null,
  }
}

// The fields an NPC placement keeps (anything else in a file is dropped); empty optional ones are left out on disk.
const NPC_TEXT_FIELDS = ['name', 'faction', 'disposition', 'conversationId', 'npcRules', 'alertGroupId', 'alertMethod', 'responseType']
function parseNpc(raw) {
  const npc = { id: String(raw.id), characterId: raw.characterId ?? null, position: toPosition(raw.position ?? [0, 0]), facing: Number(raw.facing) || 0 }
  NPC_TEXT_FIELDS.forEach((field) => {
    npc[field] = raw[field] ?? null
  })
  return npc
}
function serializeNpc(npc) {
  const record = { id: npc.id, characterId: npc.characterId, position: fromPosition(npc.position), facing: Math.round(npc.facing ?? 0) }
  NPC_TEXT_FIELDS.forEach((field) => {
    if (npc[field] != null && npc[field] !== '') record[field] = npc[field]
  })
  return record
}
const conditionList = (raw) => (Array.isArray(raw) ? raw.filter((condition) => condition?.flag) : [])
const parseObjective = (raw, inside) => {
  const position = Array.isArray(raw.position) ? toPosition(raw.position) : null
  return {
    id: String(raw.id),
    title: raw.title ?? '',
    description: raw.description ?? '',
    position: position && inside(position) ? position : null,
    objectId: typeof raw.objectId === 'string' && raw.objectId ? raw.objectId : null,
    activeWhen: conditionList(raw.activeWhen),
    completeWhen: conditionList(raw.completeWhen),
  }
}
const serializeObjective = (objective) => ({
  id: objective.id,
  title: objective.title,
  description: objective.description,
  ...(objective.position ? { position: fromPosition(objective.position) } : {}),
  ...(objective.objectId ? { objectId: objective.objectId } : {}),
  ...(objective.activeWhen?.length ? { activeWhen: objective.activeWhen } : {}),
  ...(objective.completeWhen?.length ? { completeWhen: objective.completeWhen } : {}),
})

// id: the file name the map was loaded from.
export function parseMapFile(file, id) {
  const rows = file.rows ?? []
  const width = Math.max(...rows.map((row) => row.length), 0)
  const tiles = rows.map((row) => Array.from({ length: width }, (_, x) => tileIdForSymbol(row[x] ?? '.')))
  const inside = (position) => isInside(width, rows.length, position)
  const rotatedKeys = new Set((file.rotated ?? []).map(toPosition).filter(inside).map(({ x, y }) => `${x},${y}`))
  const oldBiomeType = BIOME_MAP_TYPES.has(file.mapType)
  return {
    id,
    name: file.name ?? id,
    episodeName: file.episodeName ?? '',
    card: file.card ?? null,
    mapType: oldBiomeType ? 'wilderness' : (file.mapType ?? DEFAULT_MAP_TYPE),
    biome: oldBiomeType ? file.mapType : (file.biome ?? DEFAULT_BIOME),
    weather: file.weather ?? CLEAR_WEATHER,
    ambient: clampAmbient(file.ambient),
    width,
    height: rows.length,
    tiles,
    rotated: rotationGrid(width, rows.length, (x, y) => rotatedKeys.has(`${x},${y}`)),
    areas: (file.areas ?? []).map((area) => ({ name: area.name, position: toPosition(area.position) })).filter((area) => inside(area.position)),
    markers: {
      playerStarts: (file.markers?.playerStarts ?? []).map(toSpawn).filter(inside),
      enemySpawns: (file.markers?.enemySpawns ?? []).map(toSpawn).filter(inside),
    },
    npcs: (file.npcs ?? []).filter((raw) => raw?.id != null).map(parseNpc).filter((npc) => inside(npc.position)),
    objectives: (file.objectives ?? []).filter((raw) => raw?.id != null).map((raw) => parseObjective(raw, inside)),
    objectPlacements: Object.fromEntries(
      Object.entries(file.objectPlacements ?? {})
        .filter(([, position]) => Array.isArray(position))
        .map(([objectId, position]) => [objectId, toPosition(position)])
        .filter(([, position]) => inside(position)),
    ),
    briefing: typeof file.briefing === 'string' ? file.briefing : '',
    stardate: Number.isFinite(file.stardate) ? file.stardate : null,
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
    ambient: clampAmbient(map.ambient),
    rows: map.tiles.map((row) => row.map((id) => getTile(id).symbol).join('')),
    rotated: map.tiles.flatMap((row, y) => row.flatMap((_, x) => (isRotated(map, { x, y }) ? [[x, y]] : []))),
    areas: map.areas.map((area) => ({ name: area.name, position: fromPosition(area.position) })),
    markers: {
      playerStarts: map.markers.playerStarts.map(fromSpawn),
      enemySpawns: map.markers.enemySpawns.map(fromSpawn),
    },
    ...(map.npcs?.length ? { npcs: map.npcs.map(serializeNpc) } : {}),
    ...(map.objectives?.length ? { objectives: map.objectives.map(serializeObjective) } : {}),
    ...(Object.keys(map.objectPlacements ?? {}).length
      ? { objectPlacements: Object.fromEntries(Object.entries(map.objectPlacements).map(([objectId, position]) => [objectId, fromPosition(position)])) }
      : {}),
    ...(map.briefing?.trim() ? { briefing: map.briefing.trim() } : {}),
    ...(Number.isFinite(map.stardate) ? { stardate: map.stardate } : {}),
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
    rotated: rotationGrid(w, h, (x, y) => isRotated(map, { x, y })),
    areas: map.areas.filter((area) => inside(area.position)),
    markers: { playerStarts: map.markers.playerStarts.filter(inside), enemySpawns: map.markers.enemySpawns.filter(inside) },
    npcs: (map.npcs ?? []).filter((npc) => inside(npc.position)),
    objectives: (map.objectives ?? []).map((objective) => (objective.position && !inside(objective.position) ? { ...objective, position: null } : objective)),
    objectPlacements: Object.fromEntries(Object.entries(map.objectPlacements ?? {}).filter(([, position]) => inside(position))),
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
  ;(map.npcs ?? []).forEach((npc) => {
    const label = npc.name || npc.id
    if (tileAt(npc.position).solid) warnings.push(`NPC ${label} stands on a solid tile.`)
    if (!npc.characterId) warnings.push(`NPC ${label} has no character.`)
  })
  const roles = new Set(map.tiles.flat().map((id) => getTile(id).role))
  if (roles.has('hazard') && !roles.has('hazardControl')) warnings.push('Hazard tiles but no hazard control, so the hazard can never be set off.')
  if (roles.has('hazardControl') && !roles.has('hazard')) warnings.push('A hazard control but no hazard tiles.')
  return warnings
}
