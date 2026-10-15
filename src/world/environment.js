// Destructible objects and environmental hazards (docs/world-objects.md). Pure rules on plain data, shared by
// exploration and combat; the appliers (exploration/explorationEnvironment.js, combat/combatEnvironment.js) turn the hits
// these return into Injuries.
// environment = { seed, round, sequence, destructibles: { [id]: record }, hazards: { [regionId]: region }, explosions }
//   record: { id, type, name, position, structure, maxStructure, resistance, state: intact | damaged | destroyed,
//   attackable, explosion (the type's, with the map's overrides), linkedTiles, debris, leakSealed }
//   region: { id, type, tiles: { 'x,y': intensity 1-3 }, source: 'map' | 'explosion:{id}' | 'leak:{id}', active, spread,
//   neutralizable, roundsLeft (null: until it dissipates), and the map's overrides of its type: severity?, spreadChance?,
//   dissipateChance?, neutralizeDifficulty? }
//   explosions: the latest blasts, newest last, for the explosion effect: { id, objectId, type, kind, position, radius }
// Book: no person-scale object rules (Core p.327 has immediate Area hazards and lingering hazards, p.291 Avoid Injury).
// Prototype (designer decision, 2026-10-12): an object has a Structure track and Resistance; damage = severity -
// Resistance (at least 1); damaged at half Structure, destroyed at 0, when it explodes. Every number is a placeholder
// (destructibles.json, hazards.json).
import { isInside, NEIGHBOUR_OFFSETS, tileAt, tileKey } from '../combat/battleMap.js'
import { tileDistance } from '../combat/rangeSystem.js'
import destructibleData from '../data/adaptation/world/destructibles.json'
import hazardData from '../data/adaptation/world/hazards.json'
import { getTile } from '../maps/mapFormat.js'
import { buildInjury, getProtection } from '../rules/personalCondition.js'
import { deriveSeed, seededRandomInt } from '../rules/seededRandom.js'

export const DESTRUCTIBLE_TYPES = destructibleData.types
export const HAZARD_TYPES = hazardData.types
export const HAZARD_ROUND_SECONDS = hazardData.roundSeconds
export const MAX_INTENSITY = hazardData.maxIntensity
export const THICK_INTENSITY = hazardData.thickIntensity
export const DESTRUCTIBLE_STATES = ['intact', 'damaged', 'destroyed']
export const EXPLOSION_KINDS = destructibleData.explosionKinds
export const OBJECT_ATTACK_DIFFICULTY = destructibleData.attackDifficulty
// A force-field generator's linked tiles while it stands, and once it is destroyed (tiles.json).
export const FORCE_FIELD_TILES = destructibleData.forceFieldTiles

// A hazard region never grows past this many tiles (spreading would otherwise fill a deck).
const MAX_REGION_TILES = 30
const KEPT_EXPLOSIONS = 6
const ORTHOGONAL = NEIGHBOUR_OFFSETS.slice(0, 4)

const capital = (text) => text[0].toUpperCase() + text.slice(1)
export const destructibleTileId = (type, state = 'intact') => `ds${capital(type)}${state === 'intact' ? '' : capital(state)}`
export const parseKey = (key) => {
  const [x, y] = key.split(',').map(Number)
  return { x, y }
}
export const destructibleStateFor = (structure, maxStructure) => (structure <= 0 ? 'destroyed' : structure <= maxStructure / 2 ? 'damaged' : 'intact')
export const isStanding = (record) => record.state !== 'destroyed'
export const objectDamage = (record, severity) => Math.max(1, severity - record.resistance)
const isOpen = (map, position) => isInside(map, position) && !getTile(tileAt(map, position)).solid
const asPosition = (position) => (Array.isArray(position) ? { x: position[0], y: position[1] } : { ...position })

// The Structure an object starts with in an authored initial state (damaged: half, rounded down; destroyed: none).
const startingStructure = (maxStructure, state) => (state === 'destroyed' ? 0 : state === 'damaged' ? Math.floor(maxStructure / 2) : maxStructure)

// placement: the map's { id, type, position, name?, structure?, resistance?, initialState?, attackable?, explosion?,
// linkedTiles? } (mapFormat.js); the optional fields override the type's.
export function createDestructibleRecord(placement) {
  const info = DESTRUCTIBLE_TYPES[placement.type]
  const maxStructure = placement.structure ?? info.structure
  const state = DESTRUCTIBLE_STATES.includes(placement.initialState) ? placement.initialState : 'intact'
  return {
    id: placement.id,
    type: placement.type,
    name: placement.name ?? info.name,
    position: asPosition(placement.position),
    structure: startingStructure(maxStructure, state),
    maxStructure,
    resistance: placement.resistance ?? info.resistance,
    state,
    attackable: placement.attackable ?? true,
    explosion: info.explosion ? { ...info.explosion, ...placement.explosion } : null,
    linkedTiles: (placement.linkedTiles ?? []).map(asPosition),
    debris: [],
    leakSealed: false,
  }
}

// A map's hazard region as it starts play: active, spreading and neutralizable unless the map says otherwise.
export function createHazardRegion(hazard, source = 'map') {
  const { duration, active, spread, neutralizable, ...rest } = hazard
  return { ...rest, tiles: { ...hazard.tiles }, source, active: active ?? true, spread: spread ?? true, neutralizable: neutralizable ?? true, roundsLeft: duration ?? null }
}

export function createEnvironment(map, seed = 0) {
  const destructibles = Object.fromEntries(
    (map.destructibles ?? []).filter((placement) => DESTRUCTIBLE_TYPES[placement.type]).map((placement) => [placement.id, createDestructibleRecord(placement)]),
  )
  const hazards = Object.fromEntries(
    (map.hazards ?? []).filter((hazard) => HAZARD_TYPES[hazard.type] && Object.keys(hazard.tiles).length).map((hazard) => [hazard.id, createHazardRegion(hazard)]),
  )
  return { seed, round: 0, sequence: 0, destructibles, hazards, explosions: [] }
}

export const destructibleList = (environment) => Object.values(environment?.destructibles ?? {})
export const hazardList = (environment) => Object.values(environment?.hazards ?? {})
export const activeHazards = (environment) => hazardList(environment).filter((region) => region.active)
export const destructibleAt = (environment, position) =>
  destructibleList(environment).find((record) => record.position.x === position.x && record.position.y === position.y) ?? null
// Whether anything still needs hazard rounds: an active hazard, or a damaged object leaking one.
export const needsHazardRounds = (environment) =>
  hazardList(environment).some((region) => region.active) ||
  destructibleList(environment).some((record) => record.state === 'damaged' && !record.leakSealed && DESTRUCTIBLE_TYPES[record.type].damagedHazard)

// A region's value for a type field it may override (mapFormat.js HAZARD_OVERRIDES).
export const hazardValue = (region, field) => region[field] ?? HAZARD_TYPES[region.type][field]
export const hazardSeverity = (region) => hazardValue(region, 'severity')
export const neutralizeDifficulty = (region) => region.neutralizeDifficulty ?? HAZARD_TYPES[region.type].neutralize.difficulty
export const blocksSightAt = (region, intensity) => Boolean(HAZARD_TYPES[region.type].blocksSight) && intensity >= THICK_INTENSITY

// The worst active hazard on a tile: { region, type, intensity, severity, injuryType, name }, or null. A hazard of
// severity 0 (smoke) hurts nobody but still counts here for sight.
export function hazardAt(environment, position) {
  const key = tileKey(position)
  let worst = null
  hazardList(environment).forEach((region) => {
    const intensity = region.active && region.tiles[key]
    if (!intensity) return
    const info = HAZARD_TYPES[region.type]
    const severity = hazardSeverity(region)
    if (!worst || severity > worst.severity || (severity === worst.severity && intensity > worst.intensity)) {
      worst = { region, type: region.type, intensity, severity, injuryType: info.injuryType, name: info.name }
    }
  })
  return worst
}

// The tile changes the environment makes: each destructible's tile for its state, a force-field generator's linked
// field (up while it stands, down once destroyed) and a fallen structure's debris.
function environmentTileChanges(map, environment) {
  const changes = []
  const put = (position, tile) => {
    if (isInside(map, position) && map.tiles[position.y][position.x] !== tile) changes.push({ ...position, tile })
  }
  destructibleList(environment).forEach((record) => {
    put(record.position, destructibleTileId(record.type, record.state))
    record.linkedTiles.forEach((tile) => put(tile, isStanding(record) ? FORCE_FIELD_TILES.up : FORCE_FIELD_TILES.down))
    const debris = DESTRUCTIBLE_TYPES[record.type].debris
    record.debris.forEach((tile) => put(tile, debris.tile))
  })
  return changes
}

const asKeys = (set) => Object.fromEntries([...set].map((key) => [key, true]))

// The map with the environment's tiles (environmentTileChanges) and the tiles active hazards mark: thick smoke and gas
// (sightBlockers) block sight and line of fire, thin ones (coverKeys) cover a unit standing in them, and slowing hazards
// (slowKeys, the coolant leak) cost double movement. Returns the same map when nothing changes, so movement caches
// keyed by the map stay valid.
export function applyEnvironmentTiles(map, environment) {
  if (!environment) return map
  const changes = environmentTileChanges(map, environment)
  const blockers = new Set()
  const cover = new Set()
  const slow = new Set()
  activeHazards(environment).forEach((region) => {
    const info = HAZARD_TYPES[region.type]
    Object.entries(region.tiles).forEach(([key, intensity]) => {
      if (info.blocksSight) (blocksSightAt(region, intensity) ? blockers : cover).add(key)
      if (info.movement === 'slow') slow.add(key)
    })
  })
  blockers.forEach((key) => cover.delete(key))
  const environmentKey = `${[...blockers].sort().join(';')}|${[...cover].sort().join(';')}|${[...slow].sort().join(';')}`
  if (!changes.length && (map.environmentKey ?? '||') === environmentKey) return map
  let tiles = map.tiles
  if (changes.length) {
    tiles = map.tiles.map((row) => row.slice())
    changes.forEach(({ x, y, tile }) => {
      tiles[y][x] = tile
    })
  }
  return { ...map, tiles, sightBlockers: asKeys(blockers), coverKeys: asKeys(cover), slowKeys: asKeys(slow), environmentKey }
}

// The tiles a straight line between two tile centres crosses, ends excluded (the sampling rangeSystem.hasLineOfFire uses).
function lineBetween(from, to) {
  const steps = tileDistance(from, to) * 4
  const seen = new Set()
  const points = []
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const point = { x: Math.round(from.x + (to.x - from.x) * t), y: Math.round(from.y + (to.y - from.y) * t) }
    const key = tileKey(point)
    if (seen.has(key) || key === tileKey(from) || key === tileKey(to)) continue
    seen.add(key)
    points.push(point)
  }
  return points
}

// A blast reaches a tile unless a wall (a tile that blocks sight) or another standing destructible is in the way.
// Smoke and gas don't stop it.
export function blastReaches(map, environment, from, to) {
  if (to.x < 0 || to.y < 0 || to.x >= map.width || to.y >= map.height) return false
  return lineBetween(from, to).every((point) => {
    if (getTile(tileAt(map, point)).blocksSight) return false
    const record = destructibleAt(environment, point)
    return !record || !isStanding(record)
  })
}

const withRecord = (environment, record) => ({ ...environment, destructibles: { ...environment.destructibles, [record.id]: record } })
const withRegion = (environment, region) => ({ ...environment, hazards: { ...environment.hazards, [region.id]: region } })
const withoutRegion = (environment, regionId) => {
  const hazards = { ...environment.hazards }
  delete hazards[regionId]
  return { ...environment, hazards }
}

// A new hazard region around a point: centreIntensity on the point, edgeIntensity on every open tile within radius the
// blast reaches. duration: hazard rounds it lasts (null: until it dissipates); spread: whether it may spread. Returns the
// environment unchanged when there is no hazard type.
export function spawnHazard(environment, map, { type, position, radius = 0, centreIntensity = MAX_INTENSITY, edgeIntensity = THICK_INTENSITY, duration = null, spread = true, source, id }) {
  if (!type || !HAZARD_TYPES[type]) return environment
  const tiles = {}
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tile = { x: position.x + dx, y: position.y + dy }
      const centre = dx === 0 && dy === 0
      if (!isOpen(map, tile) || (!centre && !blastReaches(map, environment, position, tile))) continue
      tiles[tileKey(tile)] = centre ? centreIntensity : Math.min(edgeIntensity, centreIntensity)
    }
  }
  if (!Object.keys(tiles).length) return environment
  const sequence = environment.sequence + 1
  return withRegion({ ...environment, sequence }, { id: id ?? `h${sequence}`, type, tiles, source, active: true, spread, neutralizable: true, roundsLeft: duration })
}

// A damaged object leaking its damagedHazard onto the open tiles round it (topped up each hazard round until it is
// destroyed or the leak is sealed).
function leak(environment, map, record) {
  const type = DESTRUCTIBLE_TYPES[record.type].damagedHazard
  if (!type || record.leakSealed || record.state !== 'damaged') return environment
  const id = `leak:${record.id}`
  const existing = environment.hazards[id]
  const tiles = { ...(existing?.tiles ?? {}) }
  NEIGHBOUR_OFFSETS.forEach(([dx, dy]) => {
    const tile = { x: record.position.x + dx, y: record.position.y + dy }
    if (isOpen(map, tile)) tiles[tileKey(tile)] = Math.max(tiles[tileKey(tile)] ?? 0, 1)
  })
  if (!Object.keys(tiles).length) return environment
  return withRegion(environment, { ...(existing ?? { id, type, source: id, active: true, spread: true, neutralizable: true, roundsLeft: null }), tiles })
}

// Where a fallen structure's debris lands: the open tiles within the type's debris radius the blast reaches, never one
// with anyone on it. Sorted, so the same fall always leaves the same debris.
function debrisTiles(map, environment, record, actors) {
  const debris = DESTRUCTIBLE_TYPES[record.type].debris
  if (!debris) return []
  const occupied = new Set(actors.map((actor) => tileKey(actor.position)))
  const tiles = []
  for (let dy = -debris.radius; dy <= debris.radius; dy++) {
    for (let dx = -debris.radius; dx <= debris.radius; dx++) {
      const tile = { x: record.position.x + dx, y: record.position.y + dy }
      if ((dx || dy) && isOpen(map, tile) && !occupied.has(tileKey(tile)) && !destructibleAt(environment, tile) && blastReaches(map, environment, record.position, tile)) tiles.push(tile)
    }
  }
  return tiles.slice(0, debris.count)
}

const addHit = (hits, hit) => {
  const previous = hits.get(hit.targetId)
  if (!previous || hit.severity > previous.severity) hits.set(hit.targetId, hit)
}

// Damages a destructible and follows any chain of explosions. actors: [{ id, position (tile) }] who can be caught.
// Every actor is hit at most once per chain (the worst blast that reaches them), whichever side they are on, and every
// object detonates at most once. Returns { environment, map (with the new tiles), hits: [{ targetId, severity,
// injuryType, sourceId, sourceName, kind }], explosions, lines (log texts) }.
export function damageObject(environment, map, objectId, amount, actors = []) {
  const hits = new Map()
  const explosions = []
  const lines = []
  let next = environment
  let current = map
  const queue = [{ id: objectId, amount }]
  while (queue.length) {
    const { id, amount: damage } = queue.shift()
    const record = next.destructibles[id]
    if (!record || !isStanding(record)) continue
    const structure = Math.max(0, record.structure - damage)
    const state = destructibleStateFor(structure, record.maxStructure)
    let updated = { ...record, structure, state }
    if (state === 'intact') {
      next = withRecord(next, updated)
      lines.push(`${record.name} takes ${damage} damage (Structure ${structure}/${record.maxStructure}).`)
      continue
    }
    if (state === 'damaged') {
      next = withRecord(next, updated)
      lines.push(`${record.name} is damaged (Structure ${structure}/${record.maxStructure}).`)
      if (record.state === 'intact') next = leak(next, current, updated)
      continue
    }
    updated = { ...updated, debris: debrisTiles(current, next, record, actors) }
    next = withRecord(next, updated)
    current = applyEnvironmentTiles(current, next)
    if (updated.linkedTiles.length) lines.push(`${record.name} fails: its force field drops.`)
    if (updated.debris.length) lines.push(`${record.name} collapses, leaving debris.`)
    const blast = record.explosion
    if (!blast) {
      lines.push(`${record.name} is destroyed.`)
      continue
    }
    const sequence = next.sequence + 1
    const explosion = { id: `x${sequence}`, objectId: id, type: record.type, kind: blast.kind, position: record.position, radius: blast.radius }
    next = { ...next, sequence, explosions: [...next.explosions, explosion].slice(-KEPT_EXPLOSIONS) }
    explosions.push(explosion)
    lines.push(`${record.name} explodes!`)
    const reaches = (position) => tileDistance(position, record.position) <= blast.radius && blastReaches(current, next, record.position, position)
    actors.filter((actor) => reaches(actor.position)).forEach((actor) => {
      addHit(hits, { targetId: actor.id, severity: blast.severity, injuryType: blast.injuryType, sourceId: id, sourceName: record.name, kind: 'explosion' })
    })
    // Chain reactions resolve nearest first, then by id, so the order never depends on how the map listed them.
    destructibleList(next)
      .filter((other) => other.id !== id && isStanding(other) && reaches(other.position))
      .sort((a, b) => tileDistance(a.position, record.position) - tileDistance(b.position, record.position) || a.id.localeCompare(b.id))
      .forEach((other) => queue.push({ id: other.id, amount: objectDamage(other, blast.severity) }))
    next = spawnHazard(next, current, {
      type: blast.hazard,
      position: record.position,
      radius: blast.hazardRadius,
      centreIntensity: blast.hazardIntensity ?? MAX_INTENSITY,
      duration: blast.hazardDuration ?? null,
      spread: blast.hazardSpread ?? true,
      source: `explosion:${id}`,
    })
  }
  current = applyEnvironmentTiles(current, next)
  return { environment: next, map: current, hits: [...hits.values()], explosions, lines }
}

// The Injury a blast or hazard hit inflicts on a character: an attack with no attacker whose "weapon" is the blast or the
// hazard (Book p.291: avoided like any Injury). PROTOTYPE RULE: the character's Protection applies, as against a weapon;
// cover doesn't.
export function injuryFromHit(character, hit, id) {
  const name = hit.kind === 'explosion' ? `${hit.sourceName} explosion` : hit.sourceName
  const protection = getProtection(character, { injuryType: hit.injuryType })
  return buildInjury({ id, type: hit.injuryType, weapon: { id: `${hit.kind}:${hit.sourceId}`, name, severity: hit.severity }, attacker: null, protection })
}

export const hitText = (hit) => (hit.kind === 'explosion' ? `caught in the ${hit.sourceName} explosion` : `in the ${hit.sourceName.toLowerCase()}`)

// What a Challenge does to a hazard (objectEffects.js neutralizeHazard): remove it, reduce every tile's intensity by
// amount (tiles at 0 go), stop it spreading, or disable its source (a leaking object's leak is sealed). Removing or
// disabling a leaked hazard also seals the leak, so the object doesn't top it up again.
export function neutralizeHazard(environment, regionId, mode = 'remove', amount = 1) {
  const region = environment.hazards[regionId]
  if (!region) return environment
  const sealLeak = (next) => {
    if (!region.source?.startsWith('leak:')) return next
    const record = next.destructibles[region.source.slice('leak:'.length)]
    return record ? withRecord(next, { ...record, leakSealed: true }) : next
  }
  if (mode === 'stopSpread') return withRegion(environment, { ...region, spread: false })
  if (mode === 'disableSource') return sealLeak(withRegion(environment, { ...region, spread: false }))
  if (mode === 'reduce') {
    const tiles = Object.fromEntries(Object.entries(region.tiles).flatMap(([key, intensity]) => (intensity > amount ? [[key, intensity - amount]] : [])))
    return Object.keys(tiles).length ? withRegion(environment, { ...region, tiles }) : sealLeak(withoutRegion(environment, regionId))
  }
  return sealLeak(withoutRegion(environment, regionId))
}

// One spreading / dissipating step for a region; random: a seeded () => [0, 1).
function evolveRegion(region, map, random, blocked) {
  const spreadChance = region.spread === false ? 0 : hazardValue(region, 'spreadChance')
  const dissipateChance = hazardValue(region, 'dissipateChance')
  const tiles = { ...region.tiles }
  const keys = Object.keys(region.tiles).sort()
  keys.forEach((key) => {
    if (region.tiles[key] < THICK_INTENSITY || Object.keys(tiles).length >= MAX_REGION_TILES) return
    if (random() * 100 >= spreadChance) return
    const origin = parseKey(key)
    const options = ORTHOGONAL.map(([dx, dy]) => ({ x: origin.x + dx, y: origin.y + dy })).filter(
      (tile) => isOpen(map, tile) && !blocked(tile) && !tiles[tileKey(tile)],
    )
    if (!options.length) return
    const tile = options[Math.floor(random() * options.length)]
    tiles[tileKey(tile)] = region.tiles[key] - 1
  })
  keys.forEach((key) => {
    if (random() * 100 >= dissipateChance) return
    if (tiles[key] <= 1) delete tiles[key]
    else tiles[key] -= 1
  })
  const roundsLeft = region.roundsLeft == null ? null : region.roundsLeft - 1
  return { ...region, tiles: roundsLeft !== null && roundsLeft <= 0 ? {} : tiles, roundsLeft }
}

// One hazard round (Book, Core p.327: a lingering hazard inflicts its Injury at the start of each round). In order:
// everyone standing in an active hazard is hit by the worst one there; objects beside a hazard that damagesObjects lose
// that much Structure (and may explode); active hazards spread, dissipate and count down their duration; damaged objects
// keep leaking. Inactive hazards wait. Returns what damageObject does.
export function hazardRound(environment, map, actors = []) {
  const random = seededRandomInt(deriveSeed(environment.seed, 7919 + environment.round))
  const hits = new Map()
  const explosions = []
  const lines = []
  let next = environment
  let current = map
  actors.forEach((actor) => {
    const hazard = hazardAt(next, actor.position)
    if (hazard && hazard.severity > 0) addHit(hits, { targetId: actor.id, severity: hazard.severity, injuryType: hazard.injuryType, sourceId: hazard.region.id, sourceName: hazard.name, kind: 'hazard' })
  })
  destructibleList(next)
    .filter(isStanding)
    .forEach((record) => {
      const damage = Math.max(
        0,
        ...NEIGHBOUR_OFFSETS.map(([dx, dy]) => {
          const hazard = hazardAt(next, { x: record.position.x + dx, y: record.position.y + dy })
          return hazard ? (HAZARD_TYPES[hazard.type].damagesObjects ?? 0) : 0
        }),
      )
      if (!damage || !isStanding(next.destructibles[record.id])) return
      const result = damageObject(next, current, record.id, damage, actors)
      next = result.environment
      current = result.map
      result.hits.forEach((hit) => addHit(hits, hit))
      explosions.push(...result.explosions)
      lines.push(...result.lines)
    })
  const blocked = (tile) => {
    const record = destructibleAt(next, tile)
    return Boolean(record && isStanding(record))
  }
  activeHazards(next).forEach((region) => {
    const evolved = evolveRegion(region, current, random, blocked)
    next = Object.keys(evolved.tiles).length ? withRegion(next, evolved) : withoutRegion(next, region.id)
  })
  destructibleList(next).forEach((record) => {
    next = leak(next, current, record)
  })
  next = { ...next, round: next.round + 1 }
  current = applyEnvironmentTiles(current, next)
  return { environment: next, map: current, hits: [...hits.values()], explosions, lines }
}
