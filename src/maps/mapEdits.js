// Pure edits for the dev map editor; each returns a new map (or the same one when nothing changed).
import { snapItemPosition } from '../rules/inventory.js'
import { nextFacing, spawnFacing } from './facing.js'
import { getTile, HAZARD_OVERRIDES, HAZARD_TEXT_OVERRIDES, isRotated } from './mapFormat.js'

const same = (a, b) => a.x === b.x && a.y === b.y
const without = (list, position) => list.filter((other) => !same(other, position))
const itemGridKey = (position) => {
  const snapped = snapItemPosition(position)
  return `${snapped.x},${snapped.y}`
}

// The tiles one brush press covers: a wall with panels is laid as a whole two-tile panel, along x (or along y when
// rotated); the second tile is skipped past the map's edge. Anything else covers one tile.
export function brushPositions(map, { x, y }, tileId, rotated) {
  const positions = [{ x, y }]
  if (!getTile(tileId).panels) return positions
  const next = rotated ? { x, y: y + 1 } : { x: x + 1, y }
  if (next.x < map.width && next.y < map.height) positions.push(next)
  return positions
}

// rotated: the tile is painted turned (mapFormat.js rotated).
export function paintTile(map, { x, y }, tileId, rotated = false) {
  if (map.tiles[y][x] === tileId && isRotated(map, { x, y }) === rotated) return map
  const tiles = map.tiles.map((row, rowY) => (rowY === y ? row.map((id, colX) => (colX === x ? tileId : id)) : row))
  const rotation = map.tiles.map((row, rowY) => row.map((_, colX) => (rowY === y && colX === x ? rotated : isRotated(map, { x: colX, y: rowY }))))
  // Markers, destructible objects and hazards can't be inside solid tiles.
  if (!getTile(tileId).solid) return { ...map, tiles, rotated: rotation }
  const markers = { playerStarts: without(map.markers.playerStarts, { x, y }), enemySpawns: without(map.markers.enemySpawns, { x, y }) }
  const cleared = { ...map, tiles, rotated: rotation, markers }
  if (destructibleAt(map, { x, y })) cleared.destructibles = map.destructibles.filter((object) => !same(object.position, { x, y }))
  if (hazardRegionAt(map, { x, y })) cleared.hazards = withoutHazardTile(map.hazards, { x, y })
  return cleared
}

// One brush press: every tile brushPositions covers.
export const paintBrush = (map, position, tileId, rotated = false) =>
  brushPositions(map, position, tileId, rotated).reduce((next, at) => paintTile(next, at, tileId, rotated), map)

// The Move tool: the tiles at a and b trade places, each keeping its rotation. Markers stay where they are (and are
// dropped from a tile that becomes solid, as painting does).
export function swapTiles(map, a, b) {
  if (same(a, b)) return map
  const [tileA, tileB] = [map.tiles[a.y][a.x], map.tiles[b.y][b.x]]
  const [rotatedA, rotatedB] = [isRotated(map, a), isRotated(map, b)]
  return paintTile(paintTile(map, a, tileB, rotatedB), b, tileA, rotatedA)
}

// The Move tool's tile swap when a challenge object stands on either tile (the junction with its machinery): each goes
// with its tile, recorded in the map's objectPlacements. objectDefinitions: challengeDefinitionsFor(map), whose position is
// [x, y]. Returns { map, carried: [[objectId, { x, y }]] }.
export function swapTilesWithObjects(map, a, b, objectDefinitions) {
  const at = (point) => objectDefinitions.filter((definition) => definition.position[0] === point.x && definition.position[1] === point.y)
  const carried = [...at(a).map((definition) => [definition.id, { x: b.x, y: b.y }]), ...at(b).map((definition) => [definition.id, { x: a.x, y: a.y }])]
  const swapped = swapTiles(map, a, b)
  if (!carried.length) return { map: swapped, carried }
  return { map: { ...swapped, objectPlacements: { ...(map.objectPlacements ?? {}), ...Object.fromEntries(carried) } }, carried }
}

// What stands on a tile that the editor can open an inspector for: { npc, markerKind ('playerStarts' | 'enemySpawns' | null),
// object }. An NPC standing on a start or spawn gives both.
export function selectionAt(map, objectDefinitions, position) {
  const markerKind = ['playerStarts', 'enemySpawns'].find((kind) => map.markers[kind].some((marker) => same(marker, position))) ?? null
  const object = objectDefinitions.find((definition) => definition.position[0] === position.x && definition.position[1] === position.y) ?? null
  return { npc: npcAt(map, position), markerKind, object }
}

// Whether anything the Move tool carries instead of the tile stands here: a player start, enemy spawn, NPC, area label
// or objective marker.
const standsAt = (map, position) =>
  [...map.markers.playerStarts, ...map.markers.enemySpawns, ...(map.npcs ?? []).map((npc) => npc.position)].some((other) => same(other, position))
export const hasMarkers = (map, position) =>
  standsAt(map, position) || Boolean(areaAt(map, position)) || (map.objectives ?? []).some((objective) => objective.position && same(objective.position, position))

// The Move tool on a tile with markers: everything on it moves to `to`. Returns { map } or { error } (a start, spawn or
// NPC can't stand in a solid tile or on another one; a tile holds one area label).
export function moveMarkers(map, from, to) {
  if (same(from, to)) return { map }
  const standing = standsAt(map, from)
  if (standing && getTile(map.tiles[to.y][to.x]).solid) return { error: 'Player starts, enemy spawns and NPCs stand on floor tiles.' }
  if (standing && standsAt(map, to)) return { error: 'That tile already has a player start, enemy spawn or NPC.' }
  if (areaAt(map, from) && areaAt(map, to)) return { error: 'That tile already has an area label.' }
  const shift = (position) => (same(position, from) ? to : position)
  // A start or spawn keeps its facing when it moves.
  const shiftSpawn = (spawn) => (same(spawn, from) ? { ...spawn, x: to.x, y: to.y } : spawn)
  return {
    map: {
      ...map,
      markers: { playerStarts: map.markers.playerStarts.map(shiftSpawn), enemySpawns: map.markers.enemySpawns.map(shiftSpawn) },
      npcs: (map.npcs ?? []).map((npc) => ({ ...npc, position: shift(npc.position) })),
      areas: map.areas.map((area) => ({ ...area, position: shift(area.position) })),
      objectives: (map.objectives ?? []).map((objective) => (objective.position ? { ...objective, position: shift(objective.position) } : objective)),
    },
  }
}

// The editor's right click on an NPC, player start or enemy spawn: it turns 45° clockwise (a start or spawn with no
// facing yet starts from the way it faces by default, toward the map's middle). Returns the same map when none stands there.
// An NPC standing on a start or spawn turns it too, so the tile has one facing (the editor draws one arrow there).
export function turnFacing(map, position) {
  const npc = npcAt(map, position)
  if (npc) return setFacing(map, position, nextFacing(npc.facing ?? 0))
  const marker = [...map.markers.playerStarts, ...map.markers.enemySpawns].find((other) => same(other, position))
  return marker ? setFacing(map, position, nextFacing(spawnFacing(map, marker))) : map
}

// Sets the facing of everything standing on the tile (an NPC and any start or spawn under it). facing null: a start or
// spawn goes back to facing the map's middle (an NPC always has a facing, so it keeps its own).
export function setFacing(map, position, facing) {
  const npc = npcAt(map, position)
  const withNpc = npc && facing !== null ? updateNpc(map, npc.id, { facing }) : map
  const align = (list) =>
    list.map((marker) => {
      if (!same(marker, position)) return marker
      if (facing !== null) return { ...marker, facing }
      return { x: marker.x, y: marker.y }
    })
  return { ...withNpc, markers: { playerStarts: align(withNpc.markers.playerStarts), enemySpawns: align(withNpc.markers.enemySpawns) } }
}

// kind: 'playerStarts' | 'enemySpawns'. Clicking a marker removes it; a tile holds one marker of either kind.
export function toggleMarker(map, kind, position) {
  if (getTile(map.tiles[position.y][position.x]).solid) return map
  const current = map.markers[kind]
  if (current.some((other) => same(other, position))) return { ...map, markers: { ...map.markers, [kind]: without(current, position) } }
  const markers = { playerStarts: without(map.markers.playerStarts, position), enemySpawns: without(map.markers.enemySpawns, position) }
  return { ...map, markers: { ...markers, [kind]: [...markers[kind], position] } }
}

export function eraseMarkers(map, position) {
  return {
    ...map,
    areas: map.areas.filter((area) => !same(area.position, position)),
    markers: { playerStarts: without(map.markers.playerStarts, position), enemySpawns: without(map.markers.enemySpawns, position) },
    npcs: (map.npcs ?? []).filter((npc) => !same(npc.position, position)),
  }
}

// ---------- NPCs (mapFormat.js npcs) ----------

export const npcAt = (map, position) => (map.npcs ?? []).find((npc) => same(npc.position, position)) ?? null

// A new NPC on a free floor tile (null when the tile is solid or taken): an authored character, Neutral, facing +y.
export function placeNpc(map, position, characterId) {
  if (getTile(map.tiles[position.y][position.x]).solid || npcAt(map, position)) return null
  const npcs = map.npcs ?? []
  const used = new Set(npcs.map((npc) => npc.id))
  let index = npcs.length + 1
  while (used.has(`npc${index}`)) index += 1
  const npc = { id: `npc${index}`, characterId, name: null, position, facing: 90, faction: null, disposition: 'neutral', conversationId: null, npcRules: null, alertGroupId: null, alertMethod: null, responseType: null, mustSurvive: false }
  return { map: { ...map, npcs: [...npcs, npc] }, npc }
}

// changes: any NPC fields; a position change is refused onto a solid or taken tile.
export function updateNpc(map, npcId, changes) {
  const target = changes.position
  if (target && (getTile(map.tiles[target.y][target.x]).solid || (npcAt(map, target) && npcAt(map, target).id !== npcId))) return map
  return { ...map, npcs: (map.npcs ?? []).map((npc) => (npc.id === npcId ? { ...npc, ...changes } : npc)) }
}

export const removeNpc = (map, npcId) => ({ ...map, npcs: (map.npcs ?? []).filter((npc) => npc.id !== npcId) })

// Patrol waypoints (mapFormat.js / npcs.json schema): { at: { x, y }, wait, facing (degrees or null) }.
const patrolOf = (map, npcId) => (map.npcs ?? []).find((npc) => npc.id === npcId)?.patrol ?? []

const floorAt = (map, position) => {
  const tileId = map.tiles[position.y]?.[position.x]
  return tileId != null && !getTile(tileId).solid
}

export function addPatrolWaypoint(map, npcId, position, { wait = 2, facing = null, animation = null, animationDuration = null, animationLoop = false } = {}) {
  if (!floorAt(map, position)) return null
  const npc = (map.npcs ?? []).find((entry) => entry.id === npcId)
  if (!npc) return null
  const point = {
    at: { x: position.x, y: position.y },
    wait,
    facing,
    animation: animation || null,
    animationDuration: Number.isFinite(animationDuration) ? animationDuration : null,
    animationLoop: animationLoop === true,
  }
  return updateNpc(map, npcId, { patrol: [...patrolOf(map, npcId), point] })
}

export function updatePatrolWaypoint(map, npcId, index, changes) {
  const patrol = [...patrolOf(map, npcId)]
  if (index < 0 || index >= patrol.length) return map
  const next = { ...patrol[index], ...changes }
  if (changes.at) {
    if (!floorAt(map, changes.at)) return map
    next.at = { x: changes.at.x, y: changes.at.y }
  }
  if ('wait' in changes) next.wait = Math.max(0, Number(changes.wait) || 0)
  if ('facing' in changes) next.facing = changes.facing == null ? null : Number(changes.facing)
  if ('animation' in changes) next.animation = changes.animation || null
  if ('animationDuration' in changes) {
    next.animationDuration = changes.animationDuration == null || changes.animationDuration === ''
      ? null
      : Math.max(0, Number(changes.animationDuration) || 0)
  }
  if ('animationLoop' in changes) next.animationLoop = changes.animationLoop === true
  patrol[index] = next
  return updateNpc(map, npcId, { patrol })
}

export function removePatrolWaypoint(map, npcId, index) {
  const patrol = patrolOf(map, npcId).filter((_, at) => at !== index)
  return updateNpc(map, npcId, { patrol: patrol.length ? patrol : null })
}

export function reorderPatrolWaypoint(map, npcId, from, to) {
  const patrol = [...patrolOf(map, npcId)]
  if (from < 0 || from >= patrol.length || to < 0 || to >= patrol.length || from === to) return map
  const [point] = patrol.splice(from, 1)
  patrol.splice(to, 0, point)
  return updateNpc(map, npcId, { patrol })
}

export function clearNpcPatrol(map, npcId) {
  return updateNpc(map, npcId, { patrol: null })
}

export const areaAt = (map, position) => map.areas.find((area) => same(area.position, position)) ?? null

// An empty name removes the label.
export function setAreaLabel(map, position, name) {
  const areas = map.areas.filter((area) => !same(area.position, position))
  const trimmed = name.trim()
  return { ...map, areas: trimmed ? [...areas, { name: trimmed, position }] : areas }
}

// ---------- Destructible objects (mapFormat.js destructibles) ----------

export const destructibleAt = (map, position) => (map.destructibles ?? []).find((object) => same(object.position, position)) ?? null

// The first unused id of the form {prefix}{n}.
function freeId(prefix, used) {
  let index = 1
  while (used.has(`${prefix}${index}`)) index += 1
  return `${prefix}${index}`
}

// A destructible stands on a floor tile that has no other destructible (blocked: tiles a challenge object takes).
const destructibleFits = (map, position, blocked = []) =>
  !getTile(map.tiles[position.y][position.x]).solid && !destructibleAt(map, position) && !blocked.some((other) => same(other, position))

// Returns { map, object } or null when the tile can't take it.
export function placeDestructible(map, position, type, blocked = []) {
  if (!destructibleFits(map, position, blocked)) return null
  const list = map.destructibles ?? []
  const object = { id: freeId(type, new Set(list.map((entry) => entry.id))), type, position }
  return { map: { ...map, destructibles: [...list, object] }, object }
}

// The same map when the tile can't take it.
export function moveDestructible(map, id, position, blocked = []) {
  const object = (map.destructibles ?? []).find((entry) => entry.id === id)
  if (!object || same(object.position, position) || !destructibleFits(map, position, blocked)) return map
  return { ...map, destructibles: map.destructibles.map((entry) => (entry.id === id ? { ...entry, position } : entry)) }
}

// changes: name, structure, resistance (null removes an override).
export function updateDestructible(map, id, changes) {
  return {
    ...map,
    destructibles: (map.destructibles ?? []).map((entry) => {
      if (entry.id !== id) return entry
      const next = { ...entry, ...changes }
      Object.keys(changes).forEach((field) => {
        if (next[field] === null || next[field] === '') delete next[field]
      })
      return next
    }),
  }
}

export const removeDestructible = (map, id) => ({ ...map, destructibles: (map.destructibles ?? []).filter((entry) => entry.id !== id) })

// ---------- Ground inventory placements (mapFormat.js groundItemPlacements; 8×8 snap) ----------

export const groundItemAt = (map, position, { excludeId = null } = {}) => {
  const key = itemGridKey(position)
  return (
    (map.groundItemPlacements ?? []).find((entry) => {
      if (excludeId && entry.id === excludeId) return false
      return itemGridKey(entry.position) === key
    }) ?? null
  )
}

const groundItemTile = (position) => ({ x: Math.round(position.x), y: Math.round(position.y) })

const groundItemFits = (map, position, { excludeId = null } = {}) => {
  const snapped = snapItemPosition(position)
  const tile = groundItemTile(snapped)
  if (tile.x < 0 || tile.y < 0 || tile.x >= map.width || tile.y >= map.height) return false
  if (getTile(map.tiles[tile.y][tile.x]).solid) return false
  return !groundItemAt(map, snapped, { excludeId })
}

// Returns { map, object } or null when the cell can't take it.
export function placeGroundItem(map, position, itemId) {
  const snapped = snapItemPosition(position)
  if (!groundItemFits(map, snapped)) return null
  const list = map.groundItemPlacements ?? []
  const object = { id: freeId(itemId, new Set(list.map((entry) => entry.id))), itemId, position: snapped }
  return { map: { ...map, groundItemPlacements: [...list, object] }, object }
}

export function moveGroundItem(map, id, position) {
  const object = (map.groundItemPlacements ?? []).find((entry) => entry.id === id)
  const snapped = snapItemPosition(position)
  if (!object || itemGridKey(object.position) === itemGridKey(snapped) || !groundItemFits(map, snapped, { excludeId: id })) return map
  return {
    ...map,
    groundItemPlacements: map.groundItemPlacements.map((entry) => (entry.id === id ? { ...entry, position: snapped } : entry)),
  }
}

// changes: name, pickable, visible, position (null / '' / true defaults remove overrides).
export function updateGroundItem(map, id, changes) {
  return {
    ...map,
    groundItemPlacements: (map.groundItemPlacements ?? []).map((entry) => {
      if (entry.id !== id) return entry
      const next = { ...entry, ...changes }
      if (changes.position) next.position = snapItemPosition(changes.position)
      if (next.name === null || next.name === '') delete next.name
      if (next.pickable === true || next.pickable == null) delete next.pickable
      if (next.visible === true || next.visible == null) delete next.visible
      return next
    }),
  }
}

export const removeGroundItem = (map, id) => ({
  ...map,
  groundItemPlacements: (map.groundItemPlacements ?? []).filter((entry) => entry.id !== id),
})

// A copy (new id, same overrides) on the nearest free 8×8 cell within 4 tiles. Returns { map, object } or null.
export function duplicateGroundItem(map, id) {
  const source = (map.groundItemPlacements ?? []).find((entry) => entry.id === id)
  if (!source) return null
  for (let ring = 1; ring <= 4; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
        const position = snapItemPosition({ x: source.position.x + dx, y: source.position.y + dy })
        if (!groundItemFits(map, position)) continue
        const object = {
          ...source,
          id: freeId(source.itemId, new Set(map.groundItemPlacements.map((entry) => entry.id))),
          position,
        }
        return { map: { ...map, groundItemPlacements: [...map.groundItemPlacements, object] }, object }
      }
    }
  }
  return null
}

// A copy (new id, same type and overrides) on the nearest tile that can take it, nearest ring first, then row by row.
// Returns { map, object } or null when nothing within 4 tiles is free.
export function duplicateDestructible(map, id, blocked = []) {
  const source = (map.destructibles ?? []).find((entry) => entry.id === id)
  if (!source) return null
  for (let ring = 1; ring <= 4; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
        const position = { x: source.position.x + dx, y: source.position.y + dy }
        if (position.x < 0 || position.y < 0 || position.x >= map.width || position.y >= map.height) continue
        if (!destructibleFits(map, position, blocked)) continue
        const object = { ...source, id: freeId(source.type, new Set(map.destructibles.map((entry) => entry.id))), position }
        return { map: { ...map, destructibles: [...map.destructibles, object] }, object }
      }
    }
  }
  return null
}

// ---------- Hazard regions (mapFormat.js hazards) ----------
// A region is the connected (side by side) tiles of one hazard type: painting next to a region of the same type joins
// it (merging regions it now links), and erasing a tile that splits a region leaves one region per piece. A tile holds
// one hazard, so painting another type over it takes it out of its old region.

const keyOf = ({ x, y }) => `${x},${y}`
const SIDES = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]

export const hazardRegionAt = (map, position) => (map.hazards ?? []).find((region) => region.tiles[keyOf(position)]) ?? null

// The connected pieces of a tile set ({ key: intensity }), largest first and then in key order, so the result is stable.
function piecesOf(tiles) {
  const left = new Set(Object.keys(tiles))
  const pieces = []
  ;[...left].sort().forEach((start) => {
    if (!left.has(start)) return
    const piece = {}
    const queue = [start]
    left.delete(start)
    while (queue.length) {
      const key = queue.shift()
      piece[key] = tiles[key]
      const [x, y] = key.split(',').map(Number)
      SIDES.forEach(([dx, dy]) => {
        const next = `${x + dx},${y + dy}`
        if (left.has(next)) {
          left.delete(next)
          queue.push(next)
        }
      })
    }
    pieces.push(piece)
  })
  return pieces.sort((a, b) => Object.keys(b).length - Object.keys(a).length)
}

// The regions with a region's tiles split into its connected pieces: the largest keeps the id (and overrides).
function splitRegions(regions, regionId) {
  const used = new Set(regions.map((region) => region.id))
  return regions.flatMap((region) => {
    if (region.id !== regionId) return [region]
    return piecesOf(region.tiles).map((tiles, index) => {
      if (index === 0) return { ...region, tiles }
      const id = freeId(region.type, used)
      used.add(id)
      return { ...region, id, tiles }
    })
  })
}

// Takes one tile out of whichever region holds it (splitting that region if needed).
function withoutHazardTile(regions, position) {
  const key = keyOf(position)
  const holder = regions.find((region) => region.tiles[key])
  if (!holder) return regions
  const { [key]: _removed, ...tiles } = holder.tiles
  const next = regions.map((region) => (region === holder ? { ...region, tiles } : region))
  return splitRegions(next, holder.id).filter((region) => Object.keys(region.tiles).length)
}

// Paints one tile of a hazard type at an intensity (1-3). Solid tiles take no hazard (the same map comes back).
export function paintHazardTile(map, position, type, intensity = 2) {
  if (getTile(map.tiles[position.y][position.x]).solid) return map
  const key = keyOf(position)
  const current = hazardRegionAt(map, position)
  if (current?.type === type && current.tiles[key] === intensity) return map
  let regions = current && current.type !== type ? withoutHazardTile(map.hazards, position) : [...(map.hazards ?? [])]
  const touching = regions.filter(
    (region) => region.type === type && (region.tiles[key] || SIDES.some(([dx, dy]) => region.tiles[`${position.x + dx},${position.y + dy}`])),
  )
  if (!touching.length) {
    const id = freeId(type, new Set(regions.map((region) => region.id)))
    return { ...map, hazards: [...regions, { id, type, tiles: { [key]: intensity } }] }
  }
  const [keep, ...merged] = touching
  const tiles = Object.assign({}, ...merged.map((region) => region.tiles), keep.tiles, { [key]: intensity })
  regions = regions.filter((region) => !merged.includes(region)).map((region) => (region === keep ? { ...region, tiles } : region))
  return { ...map, hazards: regions }
}

export function eraseHazardTile(map, position) {
  if (!hazardRegionAt(map, position)) return map
  return { ...map, hazards: withoutHazardTile(map.hazards, position) }
}

// changes: any of HAZARD_OVERRIDES / HAZARD_TEXT_OVERRIDES / blocksSight / neutralize and duration (null: back to the
// type's / no limit), the switches spread, active and neutralizable (only false is stored), intensity (sets every tile).
export function updateHazard(map, id, { intensity, ...overrides } = {}) {
  return {
    ...map,
    hazards: (map.hazards ?? []).map((region) => {
      if (region.id !== id) return region
      const next = { ...region }
      ;[...HAZARD_OVERRIDES, 'duration'].filter((field) => field in overrides).forEach((field) => {
        if (Number.isFinite(overrides[field])) next[field] = overrides[field]
        else delete next[field]
      })
      ;HAZARD_TEXT_OVERRIDES.filter((field) => field in overrides).forEach((field) => {
        if (typeof overrides[field] === 'string' && overrides[field]) next[field] = overrides[field]
        else delete next[field]
      })
      if ('blocksSight' in overrides) {
        if (typeof overrides.blocksSight === 'boolean') next.blocksSight = overrides.blocksSight
        else delete next.blocksSight
      }
      if ('neutralize' in overrides) {
        if (overrides.neutralize && typeof overrides.neutralize === 'object' && Object.keys(overrides.neutralize).length) {
          next.neutralize = overrides.neutralize
        } else delete next.neutralize
      }
      ;['spread', 'active', 'neutralizable'].filter((field) => field in overrides).forEach((field) => {
        if (overrides[field] === false) next[field] = false
        else delete next[field]
      })
      if (Number.isFinite(intensity)) next.tiles = Object.fromEntries(Object.keys(region.tiles).map((key) => [key, intensity]))
      return next
    }),
  }
}

export const removeHazard = (map, id) => ({ ...map, hazards: (map.hazards ?? []).filter((region) => region.id !== id) })
