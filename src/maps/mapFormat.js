// Map files: combat-independent layouts (tiles, area labels, player starts and enemy spawns) saved in the project's maps/ folder.
// A combat mode loads a map and adds its own rules, roster and objectives; nothing here belongs to a combat type.
// The name doubles as the mission location; episodeName is the title Load Episode lists it under.
// mapType: the location (a Generate Map layout id, see mapGenerators.js); it picks the names and layout Generate uses.
// biome: the terrain a ground location is built in (an id from biomes.json).
// weather: the outdoor weather shown over the map (an id from weather.json); indoor locations are always clear.
// ambient: the light level, 0 (pitch dark) to 100 (normal); glowing tiles stay lit in the dark. Presentation only.
// ambientColour: the tint of that darkness veil (#rgb / #rrggbb); default near-black. Presentation only.
// card: the episode's picture in Load Episode: an id from episodeCards.json, the path of a picture Generate Card drew, or null.
// rotated: tiles turned with the editor's right click. A rotated wall with panels runs its panels along y; any other
// rotated tile is drawn mirrored left to right (iso art has one viewing angle). Presentation only.
// npcs: the NPCs placed in the editor, each a world actor referencing an authored character (characters.json) plus how
// this instance behaves: { id, characterId, name (blank: the character's), position, facing (degrees, 0 = +x),
// faction (blank: the character's), disposition (awareness.json), conversationId (conversations/{id}.json or null),
// npcRules, alertGroupId, alertMethod, responseType (awareness response: none|observe|confront|alarm|combat, or null:
// the disposition's), mustSurvive (the mission fails if they are killed; left out on disk when false), influenceRadius (tiles a conversation's
// "influence nearby" action reaches from this NPC when the action sets no radius; null: social.json's default), gender and
// portraitId (npcPortraits.json; null: Auto, see character/npcAppearance.js), patrol (waypoints walked in order,
// looping: [{ at, wait, facing?, animation?, animationDuration?, animationLoop? }], same schema as npcs.json; left out
// when empty; animation fields are optional idle fidgets — see waypointAnimations.js), perception (optional overrides of
// awareness.json perceptionDefaults; only set keys are stored) }. A map with NPCs of its own doesn't get npcs.json's
// test NPCs.
// objectives: [{ id, title, description, position (the minimap marks it while active; null: no marker), activeWhen,
// completeWhen }]; their progress is a mission flag (exploration/missionFlags.js). activeWhen / completeWhen: mission
// flag conditions (all must hold) that set it active / complete by themselves (missionObjectives.js); empty or left
// out: only actions change it. objectId: a challenge object the objective is marked on (its marker follows the object;
// position is then unused). startsActive: active from the moment the mission starts (left out on disk when false).
// objects: the map's own challenge objects (the Object Editor; the same definitions challenges.json holds), or null:
// the map uses challenges.json's objects for its name. An empty list means the map has none.
// objectPlacements: { [challenge object id]: position } where this map puts its challenge objects; an object left out
// stands where its definition puts it (challengeObjects.js).
// briefing: the Captain's Log opening text (blank lines split paragraphs), shown as the episode's intro; outro: the
// Captain's Log closing text shown once the mission is accomplished; outroAbandoned: shown instead when the away team
// left before every objective was complete (blank: a default line); outroFailed: shown instead when the mission failed
// (an NPC who must survive was killed; blank: a default line); stardate: the episode's starting stardate
// (a number, or null for missionLog.json's default). All are left out on disk when empty.
// destructibles: [{ id, type (destructibles.json), position, name?, structure?, resistance? }] — objects that can be shot
// and blow up (world/environment.js); name / structure / resistance override the type's when set.
// hazards: [{ id, type (hazards.json), tiles: { 'x,y': intensity 1-3 }, severity?, spreadChance?, dissipateChance?,
// neutralizeDifficulty? }] — hazard regions present when the mission starts (the optional fields override the type's);
// on disk tiles is [[x, y, intensity]]. Both are left out on disk when empty.
// groundItemPlacements: [{ id, itemId (items.json), position: [x, y], name?, pickable?, visible? }] — authored spawn
// points for session ground inventory (rules/inventory.js seedGroundItemPlacements; map editor Inventory Objects tool).
// Fractional x/y are allowed for the 8×8 drop grid. name overrides the hover label; pickable/visible default true and
// are left out on disk when true. Entries missing id get one on parse. Runtime drops never write back into the map file.
// In memory a map is { id, name, episodeName, card, mapType, biome, weather, ambient, ambientColour, width, height, tiles: tile id grid [y][x],
// rotated: boolean grid [y][x] (may be missing: nothing rotated), areas, markers, npcs, objectives, briefing, outro, stardate }
// with { x, y } positions (a player start or enemy spawn may also carry facing, in degrees; without one it faces the
// map's middle);
// on disk the tiles are rows of catalogue symbols, rotated lists the rotated tiles, and positions are [x, y].
import awareness from '../data/adaptation/exploration/awareness.json'
import catalogue from '../data/adaptation/maps/tiles.json'
import destructibleData from '../data/adaptation/world/destructibles.json'
import hazardData from '../data/adaptation/world/hazards.json'
import attributeData from '../data/source/attributes.json'
import disciplineData from '../data/source/disciplines.json'

const ATTRIBUTE_IDS = new Set(attributeData.attributes.map((entry) => entry.id))
const DEPARTMENT_IDS = new Set(disciplineData.disciplines.map((entry) => entry.id))
const TILE_IDS = new Set((catalogue.tiles ?? []).map((tile) => tile.id))

export const MAP_SCHEMA_VERSION = 1
// Written when the map has Null cells or a floorUnder record (authoring memory under walls/props). Readers accept 1 and 2.
export const MAP_SCHEMA_VERSION_LAYERS = 2
export const TILES = catalogue.tiles
export const TILE_IMAGE = catalogue.imageSize
// A tile's image size in design pixels. Walls and tall objects reach higher than TILE_IMAGE holds, so theirs are taller
// (tiles.json imageHeight); every image is drawn at its own size standing on its tile, never stretched.
export const imageSize = (tile) => (tile.imageHeight ? { width: TILE_IMAGE.width, height: tile.imageHeight } : TILE_IMAGE)
export const PALETTE_GROUPS = catalogue.paletteGroups ?? []
export const FLOOR_TILE = 'floor'
export const WALL_TILE = 'bulkhead'
// Empty cell: solid (blocks movement and placement), does not block sight, not drawn. Symbol ġ; never appears in legacy maps.
export const NULL_TILE = 'null'
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
// Same default as tileArt.js DARKNESS_COLOUR (maps without ambientColour keep the old veil).
export const DEFAULT_AMBIENT_COLOUR = '#02040a'
const isAmbientColour = (value) => typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
export const clampAmbientColour = (value) => (isAmbientColour(value) ? value.toLowerCase() : DEFAULT_AMBIENT_COLOUR)
// Map types from before the location / biome split that were really biomes: they load as Wilderness in that biome.
const BIOME_MAP_TYPES = new Set(['forest', 'swamp', 'desert', 'iceField', 'volcanic'])

const BY_ID = new Map(TILES.map((tile) => [tile.id, tile]))
const BY_SYMBOL = new Map(TILES.map((tile) => [tile.symbol, tile]))
export const getTile = (id) => BY_ID.get(id) ?? BY_ID.get(FLOOR_TILE)
export const tileIdForSymbol = (symbol) => BY_SYMBOL.get(symbol)?.id ?? FLOOR_TILE
export const isEmptyTile = (id) => Boolean(getTile(id).empty)
export const cellKey = ({ x, y }) => `${x},${y}`
export const parseCellKey = (key) => {
  const [x, y] = String(key).split(',').map(Number)
  return { x, y }
}
// Maps that use Null cells or remember floors under blocks write schema 2; everything else stays schema 1.
export function schemaVersionFor(map) {
  if (map.floorUnder && Object.keys(map.floorUnder).length) return MAP_SCHEMA_VERSION_LAYERS
  if (map.tiles?.some((row) => row.some((id) => id === NULL_TILE))) return MAP_SCHEMA_VERSION_LAYERS
  return MAP_SCHEMA_VERSION
}

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

function blankFields(name, width, height, tiles) {
  return {
    id: mapFileId(name),
    name,
    episodeName: '',
    card: null,
    mapType: DEFAULT_MAP_TYPE,
    biome: DEFAULT_BIOME,
    weather: CLEAR_WEATHER,
    ambient: FULL_LIGHT,
    ambientColour: DEFAULT_AMBIENT_COLOUR,
    width,
    height,
    tiles,
    floorUnder: {},
    areas: [],
    markers: { playerStarts: [], enemySpawns: [] },
    npcs: [],
    objectives: [],
    objects: null,
    objectPlacements: {},
    destructibles: [],
    hazards: [],
    groundItemPlacements: [],
    briefing: '',
    outro: '',
    outroAbandoned: '',
    outroFailed: '',
    stardate: null,
  }
}

export function createBlankMap({ name = 'Untitled Map', width = 16, height = 12 } = {}) {
  const tiles = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? WALL_TILE : FLOOR_TILE)),
  )
  return blankFields(name, width, height, tiles)
}

// Editor New Map: every cell starts Null inside the chosen bounds (authoring layers Phase 1).
export function createNullMap({ name = 'Untitled Map', width = 16, height = 12 } = {}) {
  const tiles = Array.from({ length: height }, () => Array.from({ length: width }, () => NULL_TILE))
  return blankFields(name, width, height, tiles)
}

function parseFloorUnder(raw, inside) {
  if (!raw || typeof raw !== 'object') return {}
  const floorUnder = {}
  for (const [key, id] of Object.entries(raw)) {
    const position = parseCellKey(key)
    if (!inside(position)) continue
    if (id === NULL_TILE || id === null) {
      floorUnder[key] = NULL_TILE
      continue
    }
    if (typeof id === 'string' && TILE_IDS.has(id)) floorUnder[key] = id
  }
  return floorUnder
}

function serializeFloorUnder(floorUnder) {
  if (!floorUnder || !Object.keys(floorUnder).length) return null
  return { ...floorUnder }
}

export const mapHasNullCells = (map) => Boolean(map.tiles?.some((row) => row.some((id) => id === NULL_TILE)))


function freeGroundItemId(itemId, used) {
  let index = 1
  while (used.has(`${itemId}${index}`)) index += 1
  return `${itemId}${index}`
}

function parseGroundItemPlacement(raw, inside, usedIds) {
  if (!raw || raw.itemId == null || !Array.isArray(raw.position)) return null
  const position = toPosition(raw.position)
  if (!inside(position)) return null
  const itemId = String(raw.itemId)
  let id = typeof raw.id === 'string' && raw.id ? raw.id : null
  if (!id || usedIds.has(id)) id = freeGroundItemId(itemId, usedIds)
  usedIds.add(id)
  const entry = { id, itemId, position }
  if (typeof raw.name === 'string' && raw.name.trim()) entry.name = raw.name.trim()
  if (raw.pickable === false) entry.pickable = false
  if (raw.visible === false) entry.visible = false
  return entry
}

function serializeGroundItemPlacement(entry) {
  const record = { id: entry.id, itemId: entry.itemId, position: fromPosition(entry.position) }
  if (entry.name) record.name = entry.name
  if (entry.pickable === false) record.pickable = false
  if (entry.visible === false) record.visible = false
  return record
}

// The fields an NPC placement keeps (anything else in a file is dropped); empty optional ones are left out on disk.
const NPC_TEXT_FIELDS = ['name', 'faction', 'disposition', 'conversationId', 'npcRules', 'alertGroupId', 'alertMethod', 'responseType']
// Only on an NPC that has them (missing: Auto).
const NPC_APPEARANCE_FIELDS = ['gender', 'portraitId']
// awareness.json perceptionDefaults keys an NPC may override (createNpc merges these over the defaults).
export const PERCEPTION_KEYS = Object.keys(awareness.perceptionDefaults)
export const PERCEPTION_DEFAULTS = { ...awareness.perceptionDefaults }
// Valid responseType values (disposition.response in awareness.json, plus overrides the runtime understands).
export const RESPONSE_TYPES = [
  { id: 'none', label: 'None (ignore once identified)' },
  { id: 'observe', label: 'Observe' },
  { id: 'confront', label: 'Confront' },
  { id: 'alarm', label: 'Raise alarm, then fight' },
  { id: 'combat', label: 'Fight at once' },
]
const RESPONSE_IDS = new Set(RESPONSE_TYPES.map((entry) => entry.id))

function parsePatrol(raw, inside) {
  if (!Array.isArray(raw) || !raw.length) return null
  const points = raw
    .map((point) => {
      if (!point || !Array.isArray(point.at)) return null
      const at = toPosition(point.at)
      if (!inside(at)) return null
      const entry = { at, wait: Number.isFinite(point.wait) ? Math.max(0, Number(point.wait)) : 0 }
      if (point.facing != null && Number.isFinite(Number(point.facing))) entry.facing = Number(point.facing)
      else entry.facing = null
      if (typeof point.animation === 'string' && point.animation) entry.animation = point.animation
      else entry.animation = null
      if (Number.isFinite(point.animationDuration)) entry.animationDuration = Math.max(0, Number(point.animationDuration))
      else entry.animationDuration = null
      entry.animationLoop = point.animationLoop === true
      return entry
    })
    .filter(Boolean)
  return points.length ? points : null
}

function serializePatrol(patrol) {
  return patrol.map((point) => {
    const record = { at: fromPosition(point.at), wait: Number.isFinite(point.wait) ? point.wait : 0 }
    if (point.facing != null && Number.isFinite(point.facing)) record.facing = Math.round(point.facing)
    if (point.animation) record.animation = point.animation
    if (Number.isFinite(point.animationDuration)) record.animationDuration = point.animationDuration
    if (point.animationLoop) record.animationLoop = true
    return record
  })
}

function parsePerception(raw) {
  if (!raw || typeof raw !== 'object') return null
  const perception = {}
  PERCEPTION_KEYS.forEach((key) => {
    if (Number.isFinite(raw[key])) perception[key] = Number(raw[key])
  })
  return Object.keys(perception).length ? perception : null
}

function serializePerception(perception) {
  const record = {}
  PERCEPTION_KEYS.forEach((key) => {
    if (Number.isFinite(perception[key])) record[key] = perception[key]
  })
  return Object.keys(record).length ? record : null
}

function parseNpc(raw, inside) {
  const npc = { id: String(raw.id), characterId: raw.characterId ?? null, position: toPosition(raw.position ?? [0, 0]), facing: Number(raw.facing) || 0 }
  NPC_TEXT_FIELDS.forEach((field) => {
    npc[field] = raw[field] ?? null
  })
  if (npc.responseType && !RESPONSE_IDS.has(npc.responseType)) npc.responseType = null
  npc.mustSurvive = raw.mustSurvive === true
  npc.influenceRadius = Number.isFinite(raw.influenceRadius) && raw.influenceRadius > 0 ? Number(raw.influenceRadius) : null
  NPC_APPEARANCE_FIELDS.forEach((field) => {
    if (typeof raw[field] === 'string' && raw[field]) npc[field] = raw[field]
  })
  const patrol = parsePatrol(raw.patrol, inside)
  if (patrol) npc.patrol = patrol
  const perception = parsePerception(raw.perception)
  if (perception) npc.perception = perception
  return npc
}
function serializeNpc(npc) {
  const record = { id: npc.id, characterId: npc.characterId, position: fromPosition(npc.position), facing: Math.round(npc.facing ?? 0) }
  NPC_TEXT_FIELDS.concat(NPC_APPEARANCE_FIELDS).forEach((field) => {
    if (npc[field] != null && npc[field] !== '') record[field] = npc[field]
  })
  if (npc.mustSurvive) record.mustSurvive = true
  if (npc.influenceRadius > 0) record.influenceRadius = npc.influenceRadius
  if (npc.patrol?.length) record.patrol = serializePatrol(npc.patrol)
  const perception = npc.perception ? serializePerception(npc.perception) : null
  if (perception) record.perception = perception
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
    startsActive: raw.startsActive === true,
    activeWhen: conditionList(raw.activeWhen),
    completeWhen: conditionList(raw.completeWhen),
  }
}

const DESTRUCTIBLE_OVERRIDES = ['structure', 'resistance']
const DESTRUCTIBLE_STATES = ['intact', 'damaged', 'destroyed']
// The explosion fields a placed object may override (destructibles.json explosion), by kind of value.
const EXPLOSION_NUMBERS = ['radius', 'severity', 'hazardRadius', 'hazardIntensity', 'hazardDuration']
const EXPLOSION_TEXTS = ['kind', 'injuryType', 'hazard']
function explosionOverrides(raw) {
  if (!raw || typeof raw !== 'object') return null
  const explosion = {}
  EXPLOSION_NUMBERS.forEach((field) => {
    if (Number.isFinite(raw[field])) explosion[field] = raw[field]
  })
  EXPLOSION_TEXTS.forEach((field) => {
    if (typeof raw[field] === 'string') explosion[field] = raw[field]
  })
  if (typeof raw.hazardSpread === 'boolean') explosion.hazardSpread = raw.hazardSpread
  return Object.keys(explosion).length ? explosion : null
}
function parseDebrisOverride(raw) {
  if (!raw || typeof raw !== 'object') return null
  const debris = {}
  if (typeof raw.tile === 'string' && raw.tile.trim()) debris.tile = raw.tile.trim()
  if (Number.isFinite(raw.radius)) debris.radius = Math.max(0, Math.round(raw.radius))
  if (Number.isFinite(raw.count)) debris.count = Math.max(0, Math.round(raw.count))
  return Object.keys(debris).length ? debris : null
}

function parseDestructible(raw, inside) {
  const object = { id: String(raw.id), type: String(raw.type ?? ''), position: toPosition(raw.position ?? [0, 0]) }
  if (typeof raw.name === 'string' && raw.name.trim()) object.name = raw.name.trim()
  DESTRUCTIBLE_OVERRIDES.forEach((field) => {
    if (Number.isFinite(raw[field])) object[field] = raw[field]
  })
  if (DESTRUCTIBLE_STATES.includes(raw.initialState) && raw.initialState !== 'intact') object.initialState = raw.initialState
  if (raw.attackable === false) object.attackable = false
  if (raw.noExplosion === true) object.noExplosion = true
  if (Number.isFinite(raw.attackDifficulty)) object.attackDifficulty = raw.attackDifficulty
  if (raw.damagedHazard === 'none') object.damagedHazard = 'none'
  else if (typeof raw.damagedHazard === 'string' && raw.damagedHazard.trim()) object.damagedHazard = raw.damagedHazard.trim()
  const debris = parseDebrisOverride(raw.debris)
  if (debris) object.debris = debris
  const explosion = object.noExplosion ? null : explosionOverrides(raw.explosion)
  if (explosion) object.explosion = explosion
  const linked = (Array.isArray(raw.linkedTiles) ? raw.linkedTiles : []).filter((tile) => Array.isArray(tile)).map(toPosition).filter(inside)
  if (linked.length) object.linkedTiles = linked
  return object
}
const serializeDestructible = (object) => ({
  id: object.id,
  type: object.type,
  position: fromPosition(object.position),
  ...(object.name ? { name: object.name } : {}),
  ...Object.fromEntries(DESTRUCTIBLE_OVERRIDES.filter((field) => Number.isFinite(object[field])).map((field) => [field, object[field]])),
  ...(object.initialState && object.initialState !== 'intact' ? { initialState: object.initialState } : {}),
  ...(object.attackable === false ? { attackable: false } : {}),
  ...(object.noExplosion === true ? { noExplosion: true } : {}),
  ...(Number.isFinite(object.attackDifficulty) ? { attackDifficulty: object.attackDifficulty } : {}),
  ...(object.damagedHazard === 'none' || (typeof object.damagedHazard === 'string' && object.damagedHazard)
    ? { damagedHazard: object.damagedHazard }
    : {}),
  ...(parseDebrisOverride(object.debris) ? { debris: parseDebrisOverride(object.debris) } : {}),
  ...(!object.noExplosion && explosionOverrides(object.explosion) ? { explosion: explosionOverrides(object.explosion) } : {}),
  ...(object.linkedTiles?.length ? { linkedTiles: object.linkedTiles.map(fromPosition) } : {}),
})
const clampIntensity = (value) => Math.min(3, Math.max(1, Math.round(Number(value) || 1)))
// A hazard region's overrides of its type's values (hazards.json); any left out use the type's.
export const HAZARD_OVERRIDES = [
  'severity',
  'spreadChance',
  'dissipateChance',
  'neutralizeDifficulty',
  'migrateChance',
  'damagesObjects',
]
export const HAZARD_TEXT_OVERRIDES = ['injuryType', 'scarTile', 'movement', 'layer']
export const HAZARD_INJURY_TYPES = ['stun', 'deadly']
export const HAZARD_LAYERS = ['floor', 'air']
export const HAZARD_MOVEMENTS = ['slow']
// duration: hazard rounds the region lasts (left out: until it dissipates). The switches are kept only when false
// (spread: never spreads; active: placed but not acting yet; neutralizable: no Neutralize task).
const HAZARD_SWITCHES = ['spread', 'active', 'neutralizable']

function parseNeutralizeOverride(raw) {
  if (!raw || typeof raw !== 'object') return null
  const neutralize = {}
  if (typeof raw.label === 'string' && raw.label.trim()) neutralize.label = raw.label.trim()
  if (typeof raw.attribute === 'string' && raw.attribute) neutralize.attribute = raw.attribute
  if (typeof raw.department === 'string' && raw.department) neutralize.department = raw.department
  if (Number.isFinite(raw.difficulty)) neutralize.difficulty = raw.difficulty
  if (Array.isArray(raw.focuses)) {
    const focuses = raw.focuses.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim())
    if (focuses.length) neutralize.focuses = focuses
  }
  // Same prepareTask equipment object shape as challenge actions (label, tags, without, bonus).
  if (raw.equipment && typeof raw.equipment === 'object' && !Array.isArray(raw.equipment)) {
    neutralize.equipment = raw.equipment
  }
  return Object.keys(neutralize).length ? neutralize : null
}

const hazardOverrides = (source) => {
  const overrides = {
    ...Object.fromEntries([...HAZARD_OVERRIDES, 'duration'].filter((field) => Number.isFinite(source[field])).map((field) => [field, source[field]])),
    ...Object.fromEntries(HAZARD_SWITCHES.filter((field) => source[field] === false).map((field) => [field, false])),
  }
  HAZARD_TEXT_OVERRIDES.forEach((field) => {
    if (typeof source[field] === 'string' && source[field]) overrides[field] = source[field]
  })
  if (typeof source.blocksSight === 'boolean') overrides.blocksSight = source.blocksSight
  const neutralize = parseNeutralizeOverride(source.neutralize)
  if (neutralize) overrides.neutralize = neutralize
  return overrides
}
function parseHazard(raw, inside) {
  const tiles = {}
  ;(Array.isArray(raw.tiles) ? raw.tiles : []).forEach(([x, y, intensity]) => {
    if (Number.isInteger(x) && Number.isInteger(y) && inside({ x, y })) tiles[`${x},${y}`] = clampIntensity(intensity)
  })
  const parsed = { id: String(raw.id), type: String(raw.type ?? ''), tiles, ...hazardOverrides(raw) }
  if (parsed.injuryType && !HAZARD_INJURY_TYPES.includes(parsed.injuryType)) delete parsed.injuryType
  if (parsed.layer && !HAZARD_LAYERS.includes(parsed.layer)) delete parsed.layer
  if (parsed.movement && !HAZARD_MOVEMENTS.includes(parsed.movement)) delete parsed.movement
  return parsed
}
const serializeHazard = (hazard) => ({
  id: hazard.id,
  type: hazard.type,
  tiles: Object.entries(hazard.tiles).map(([key, intensity]) => [...key.split(',').map(Number), intensity]),
  ...hazardOverrides(hazard),
})
const hazardInside = (hazard, inside) => ({
  ...hazard,
  tiles: Object.fromEntries(Object.entries(hazard.tiles).filter(([key]) => inside(toPosition(key.split(',').map(Number))))),
})
const serializeObjective = (objective) => ({
  id: objective.id,
  title: objective.title,
  description: objective.description,
  ...(objective.position ? { position: fromPosition(objective.position) } : {}),
  ...(objective.objectId ? { objectId: objective.objectId } : {}),
  ...(objective.startsActive ? { startsActive: true } : {}),
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
  const groundItemIds = new Set()
  return {
    id,
    name: file.name ?? id,
    episodeName: file.episodeName ?? '',
    card: file.card ?? null,
    mapType: oldBiomeType ? 'wilderness' : (file.mapType ?? DEFAULT_MAP_TYPE),
    biome: oldBiomeType ? file.mapType : (file.biome ?? DEFAULT_BIOME),
    weather: file.weather ?? CLEAR_WEATHER,
    ambient: clampAmbient(file.ambient),
    ambientColour: clampAmbientColour(file.ambientColour),
    width,
    height: rows.length,
    tiles,
    floorUnder: parseFloorUnder(file.floorUnder, inside),
    rotated: rotationGrid(width, rows.length, (x, y) => rotatedKeys.has(`${x},${y}`)),
    areas: (file.areas ?? []).map((area) => ({ name: area.name, position: toPosition(area.position) })).filter((area) => inside(area.position)),
    markers: {
      playerStarts: (file.markers?.playerStarts ?? []).map(toSpawn).filter(inside),
      enemySpawns: (file.markers?.enemySpawns ?? []).map(toSpawn).filter(inside),
    },
    npcs: (file.npcs ?? []).filter((raw) => raw?.id != null).map((raw) => parseNpc(raw, inside)).filter((npc) => inside(npc.position)),
    objectives: (file.objectives ?? []).filter((raw) => raw?.id != null).map((raw) => parseObjective(raw, inside)),
    objectPlacements: Object.fromEntries(
      Object.entries(file.objectPlacements ?? {})
        .filter(([, position]) => Array.isArray(position))
        .map(([objectId, position]) => [objectId, toPosition(position)])
        .filter(([, position]) => inside(position)),
    ),
    objects: Array.isArray(file.objects) ? structuredClone(file.objects.filter((object) => object?.id != null)) : null,
    destructibles: (file.destructibles ?? []).filter((raw) => raw?.id != null).map((raw) => parseDestructible(raw, inside)).filter((object) => inside(object.position)),
    hazards: (file.hazards ?? [])
      .filter((raw) => raw?.id != null)
      .map((raw) => parseHazard(raw, inside))
      .filter((hazard) => Object.keys(hazard.tiles).length),
    groundItemPlacements: (file.groundItemPlacements ?? [])
      .map((raw) => parseGroundItemPlacement(raw, inside, groundItemIds))
      .filter(Boolean),
    briefing: typeof file.briefing === 'string' ? file.briefing : '',
    outro: typeof file.outro === 'string' ? file.outro : '',
    outroAbandoned: typeof file.outroAbandoned === 'string' ? file.outroAbandoned : '',
    outroFailed: typeof file.outroFailed === 'string' ? file.outroFailed : '',
    stardate: Number.isFinite(file.stardate) ? file.stardate : null,
  }
}

export function serializeMap(map) {
  const floorUnder = serializeFloorUnder(map.floorUnder)
  return {
    schemaVersion: schemaVersionFor(map),
    name: map.name,
    episodeName: map.episodeName.trim(),
    card: map.card ?? null,
    mapType: map.mapType ?? DEFAULT_MAP_TYPE,
    biome: map.biome ?? DEFAULT_BIOME,
    weather: map.weather ?? CLEAR_WEATHER,
    ambient: clampAmbient(map.ambient),
    ambientColour: clampAmbientColour(map.ambientColour),
    rows: map.tiles.map((row) => row.map((id) => getTile(id).symbol).join('')),
    rotated: map.tiles.flatMap((row, y) => row.flatMap((_, x) => (isRotated(map, { x, y }) ? [[x, y]] : []))),
    ...(floorUnder ? { floorUnder } : {}),
    areas: map.areas.map((area) => ({ name: area.name, position: fromPosition(area.position) })),
    markers: {
      playerStarts: map.markers.playerStarts.map(fromSpawn),
      enemySpawns: map.markers.enemySpawns.map(fromSpawn),
    },
    ...(map.npcs?.length ? { npcs: map.npcs.map(serializeNpc) } : {}),
    ...(map.objectives?.length ? { objectives: map.objectives.map(serializeObjective) } : {}),
    ...(Array.isArray(map.objects) ? { objects: map.objects } : {}),
    ...(Object.keys(map.objectPlacements ?? {}).length
      ? { objectPlacements: Object.fromEntries(Object.entries(map.objectPlacements).map(([objectId, position]) => [objectId, fromPosition(position)])) }
      : {}),
    ...(map.destructibles?.length ? { destructibles: map.destructibles.map(serializeDestructible) } : {}),
    ...(map.hazards?.length ? { hazards: map.hazards.map(serializeHazard) } : {}),
    ...(map.groundItemPlacements?.length
      ? { groundItemPlacements: map.groundItemPlacements.map(serializeGroundItemPlacement) }
      : {}),
    ...(map.briefing?.trim() ? { briefing: map.briefing.trim() } : {}),
    ...(map.outro?.trim() ? { outro: map.outro.trim() } : {}),
    ...(map.outroAbandoned?.trim() ? { outroAbandoned: map.outroAbandoned.trim() } : {}),
    ...(map.outroFailed?.trim() ? { outroFailed: map.outroFailed.trim() } : {}),
    ...(Number.isFinite(map.stardate) ? { stardate: map.stardate } : {}),
  }
}

// Keeps the top-left corner; new tiles use `fill` (default: Null if the map already has Null cells, else floor).
// Anything that falls outside is dropped, including floorUnder keys.
export function resizeMap(map, width, height, { fill } = {}) {
  const w = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(width)))
  const h = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(height)))
  const inside = (position) => isInside(w, h, position)
  const fillTile = fill ?? (mapHasNullCells(map) ? NULL_TILE : FLOOR_TILE)
  const floorUnder = Object.fromEntries(Object.entries(map.floorUnder ?? {}).filter(([key]) => inside(parseCellKey(key))))
  return {
    ...map,
    width: w,
    height: h,
    tiles: Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => map.tiles[y]?.[x] ?? fillTile)),
    rotated: rotationGrid(w, h, (x, y) => isRotated(map, { x, y })),
    floorUnder,
    areas: map.areas.filter((area) => inside(area.position)),
    markers: { playerStarts: map.markers.playerStarts.filter(inside), enemySpawns: map.markers.enemySpawns.filter(inside) },
    npcs: (map.npcs ?? [])
      .filter((npc) => inside(npc.position))
      .map((npc) => {
        if (!npc.patrol?.length) return npc
        const patrol = npc.patrol.filter((point) => inside(point.at))
        return patrol.length ? { ...npc, patrol } : { ...npc, patrol: null }
      }),
    objectives: (map.objectives ?? []).map((objective) => (objective.position && !inside(objective.position) ? { ...objective, position: null } : objective)),
    objectPlacements: Object.fromEntries(Object.entries(map.objectPlacements ?? {}).filter(([, position]) => inside(position))),
    destructibles: (map.destructibles ?? [])
      .filter((object) => inside(object.position))
      .map((object) => (object.linkedTiles ? { ...object, linkedTiles: object.linkedTiles.filter(inside) } : object)),
    hazards: (map.hazards ?? []).map((hazard) => hazardInside(hazard, inside)).filter((hazard) => Object.keys(hazard.tiles).length),
    groundItemPlacements: (map.groundItemPlacements ?? []).filter((entry) => inside(entry.position)),
  }
}

// Warnings only: a map can be saved in any state. requirements come from whichever mode will play it.
// hasAuthoredCharacter: optional (Character Library / editor); when omitted, unknown characterId is not checked.
export function validateMap(map, { enemySpawns = 0, label = 'this mode', hasAuthoredCharacter = null } = {}) {
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
    else if (typeof hasAuthoredCharacter === 'function' && !hasAuthoredCharacter(npc.characterId)) {
      warnings.push(`NPC ${label} references unknown character “${npc.characterId}”.`)
    }
  })
  ;(map.destructibles ?? []).forEach((object) => {
    if (!destructibleData.types[object.type]) warnings.push(`Destructible ${object.id} has an unknown type (${object.type}); it is left out of play.`)
    else if (tileAt(object.position).solid) warnings.push(`Destructible ${object.id} is on a solid tile.`)
    if (object.damagedHazard && object.damagedHazard !== 'none' && !hazardData.types[object.damagedHazard]) {
      warnings.push(`Destructible ${object.id} leaks unknown hazard “${object.damagedHazard}”.`)
    }
    if (Number.isFinite(object.attackDifficulty) && (object.attackDifficulty < 0 || object.attackDifficulty > 5)) {
      warnings.push(`Destructible ${object.id} has an out-of-range attackDifficulty.`)
    }
    if (object.debris?.tile && !TILE_IDS.has(object.debris.tile)) {
      warnings.push(`Destructible ${object.id} debris tile “${object.debris.tile}” is unknown.`)
    }
  })
  ;(map.hazards ?? []).forEach((hazard) => {
    if (!hazardData.types[hazard.type]) {
      warnings.push(`Hazard ${hazard.id} has an unknown type (${hazard.type}); it is left out of play.`)
      return
    }
    if (hazard.injuryType && !HAZARD_INJURY_TYPES.includes(hazard.injuryType)) {
      warnings.push(`Hazard ${hazard.id} has an invalid injuryType (${hazard.injuryType}).`)
    }
    if (hazard.scarTile && !TILE_IDS.has(hazard.scarTile)) {
      warnings.push(`Hazard ${hazard.id} scar tile “${hazard.scarTile}” is unknown.`)
    }
    ;['spreadChance', 'dissipateChance', 'migrateChance'].forEach((field) => {
      if (Number.isFinite(hazard[field]) && (hazard[field] < 0 || hazard[field] > 100)) {
        warnings.push(`Hazard ${hazard.id} ${field} is out of range (0–100).`)
      }
    })
    if (Number.isFinite(hazard.damagesObjects) && hazard.damagesObjects < 0) {
      warnings.push(`Hazard ${hazard.id} damagesObjects cannot be negative.`)
    }
    const neutralize = hazard.neutralize
    if (neutralize?.attribute && !ATTRIBUTE_IDS.has(neutralize.attribute)) {
      warnings.push(`Hazard ${hazard.id} neutralize attribute “${neutralize.attribute}” is unknown.`)
    }
    if (neutralize?.department && !DEPARTMENT_IDS.has(neutralize.department)) {
      warnings.push(`Hazard ${hazard.id} neutralize department “${neutralize.department}” is unknown.`)
    }
  })
  const roles = new Set(map.tiles.flat().map((id) => getTile(id).role))
  if (roles.has('hazard') && !roles.has('hazardControl')) warnings.push('Hazard tiles but no hazard control, so the hazard can never be set off.')
  if (roles.has('hazardControl') && !roles.has('hazard')) warnings.push('A hazard control but no hazard tiles.')
  const inside = (position) => isInside(map.width, map.height, position)
  Object.entries(map.floorUnder ?? {}).forEach(([key, id]) => {
    const position = parseCellKey(key)
    if (!inside(position)) warnings.push(`floorUnder entry ${key} is outside the map.`)
    else if (id !== NULL_TILE && !TILE_IDS.has(id)) warnings.push(`floorUnder at ${key} references unknown tile “${id}”.`)
  })
  ;(map.groundItemPlacements ?? []).forEach((entry) => {
    const tile = { x: Math.round(entry.position.x), y: Math.round(entry.position.y) }
    if (inside(tile) && isEmptyTile(map.tiles[tile.y][tile.x])) {
      warnings.push(`Ground item ${entry.id} is on an empty cell.`)
    }
  })
  Object.values(map.objectPlacements ?? {}).forEach((position) => {
    if (inside(position) && isEmptyTile(map.tiles[position.y][position.x])) {
      warnings.push(`A challenge object at ${position.x}, ${position.y} is on an empty cell.`)
    }
  })
  ;(map.objectives ?? []).forEach((objective) => {
    if (objective.position && inside(objective.position) && isEmptyTile(map.tiles[objective.position.y][objective.position.x])) {
      warnings.push(`Objective ${objective.id} is marked on an empty cell.`)
    }
  })
  map.areas.forEach((area) => {
    if (isEmptyTile(map.tiles[area.position.y][area.position.x])) {
      warnings.push(`Area label “${area.name || '(unnamed)'}” is on an empty cell.`)
    }
  })
  return warnings
}
