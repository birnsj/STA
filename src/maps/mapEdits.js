// Pure edits for the dev map editor; each returns a new map (or the same one when nothing changed).
import { getItemById } from '../rules/equipment.js'
import { ITEM_CELL_PX, itemGridKey, snapItemPosition } from '../rules/itemGrid.js'
import {
  canPlaceOn,
  canStackTileOn,
  groundItemDepth,
  pointInSurfaceFootprint,
  propSpriteSize,
  supportAtBoard,
  surfaceOfTile,
  tileSurfaceAt,
  zOf,
} from '../rules/placement.js'
import { nextFacing, spawnFacing } from './facing.js'
import { TILE_W, unproject } from './iso.js'
import { pickProp } from './propPick.js'
import { layerOfSelection, layerOfTile } from './layers.js'
import {
  cellKey,
  FLOOR_TILE,
  getTile,
  HAZARD_OVERRIDES,
  HAZARD_TEXT_OVERRIDES,
  isEmptyTile,
  isRotated,
  NULL_TILE,
  resizeMap as resizeMapGeometry,
} from './mapFormat.js'

const same = (a, b) => a.x === b.x && a.y === b.y
const without = (list, position) => list.filter((other) => !same(other, position))

const floorUnderOf = (map) => map.floorUnder ?? {}
const withFloorUnder = (map, floorUnder) => {
  const keys = Object.keys(floorUnder)
  if (!keys.length && !map.floorUnder) return { ...map, floorUnder: {} }
  return { ...map, floorUnder }
}

// Remember the floor (or Null) under a wall/prop when painting one over it; restore on erase.
export function rememberFloorUnder(map, position, previousId) {
  const key = cellKey(position)
  const floorUnder = { ...floorUnderOf(map), [key]: previousId }
  return withFloorUnder(map, floorUnder)
}

export function takeFloorUnder(map, position) {
  const key = cellKey(position)
  const remembered = floorUnderOf(map)[key]
  if (remembered == null) return { map, floorId: FLOOR_TILE }
  const floorUnder = { ...floorUnderOf(map) }
  delete floorUnder[key]
  return { map: withFloorUnder(map, floorUnder), floorId: remembered }
}

// Things that require a floor cell at `position` (block erasing that floor to Null).
export function dependentsAt(map, position, objectDefinitions = []) {
  const found = []
  if (npcAt(map, position)) found.push({ kind: 'npc', label: 'NPC' })
  if (map.markers.playerStarts.some((marker) => same(marker, position))) found.push({ kind: 'playerStarts', label: 'player start' })
  if (map.markers.enemySpawns.some((marker) => same(marker, position))) found.push({ kind: 'enemySpawns', label: 'enemy spawn' })
  if (destructibleAt(map, position)) found.push({ kind: 'destructible', label: 'destructible' })
  if (hazardRegionAt(map, position)) found.push({ kind: 'hazard', label: 'hazard' })
  if (objectDefinitions.some((definition) => definition.position[0] === position.x && definition.position[1] === position.y)) {
    found.push({ kind: 'object', label: 'challenge object' })
  }
  if ((map.groundItemPlacements ?? []).some((entry) => Math.round(entry.position.x) === position.x && Math.round(entry.position.y) === position.y)) {
    found.push({ kind: 'groundItem', label: 'ground item' })
  }
  if (areaAt(map, position)) found.push({ kind: 'area', label: 'area label' })
  if ((map.objectives ?? []).some((objective) => objective.position && same(objective.position, position))) {
    found.push({ kind: 'objective', label: 'objective' })
  }
  // Prop tiles (furniture) and walls sitting on this cell — walls are allowed on Null, props are not.
  const tile = getTile(map.tiles[position.y]?.[position.x])
  if (tile && !tile.empty && !tile.wall && tile.height > 0) found.push({ kind: 'prop', label: 'scenery' })
  return found
}

// Whether erasing the floor at `position` to Null is allowed. Walls may remain on Null; everything else blocks.
export function canEraseFloor(map, position, objectDefinitions = []) {
  const blockers = dependentsAt(map, position, objectDefinitions).filter((entry) => entry.kind !== 'wall')
  // A wall tile itself is fine on Null — only non-wall dependents block.
  const tile = getTile(map.tiles[position.y]?.[position.x])
  if (tile?.wall) {
    return { ok: true, blockers: blockers.filter((entry) => entry.kind !== 'prop') }
  }
  return blockers.length ? { ok: false, blockers } : { ok: true, blockers: [] }
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

const stackOverOf = (map) => map.stackOver ?? {}
const withStackOver = (map, stackOver) => {
  const keys = Object.keys(stackOver)
  if (!keys.length && !map.stackOver) return { ...map, stackOver: {} }
  return { ...map, stackOver }
}

// Append a furniture prop onto an existing surface cell (map.stackOver). Returns null when stacking is not allowed.
export function stackTileOn(map, position, tileId) {
  const check = canStackTileOn(map, position, tileId)
  if (!check.ok) return null
  const key = cellKey(position)
  const layers = [...(stackOverOf(map)[key] ?? []), tileId]
  return withStackOver(map, { ...stackOverOf(map), [key]: layers })
}

// Pop the top stacked prop, or clear the stack key when empty. Returns { map, popped } or null.
export function popStackOver(map, position) {
  const key = cellKey(position)
  const layers = stackOverOf(map)[key]
  if (!layers?.length) return null
  const popped = layers[layers.length - 1]
  const next = layers.slice(0, -1)
  const stackOver = { ...stackOverOf(map) }
  if (next.length) stackOver[key] = next
  else delete stackOver[key]
  return { map: withStackOver(map, stackOver), popped }
}

// rotated: the tile is painted turned (mapFormat.js rotated).
// When painting a wall or prop over a floor/Null cell, the previous id is stored in floorUnder so erase can restore it.
// Painting a prop onto a cell that already has a support surface appends to stackOver instead of replacing the base.
export function paintTile(map, { x, y }, tileId, rotated = false, objectDefinitions = []) {
  const previousId = map.tiles[y][x]
  const previous = getTile(previousId)
  const next = getTile(tileId)
  const placingProp = Boolean(next.height > 0 && !next.wall)
  // Stack onto an existing surface rather than replacing the base tile.
  if (placingProp && surfaceOfTile(previousId)) {
    const stackCheck = canStackTileOn(map, { x, y }, tileId)
    if (stackCheck.ok) return stackTileOn(map, { x, y }, tileId) ?? map
    // A rejected stack placement must not fall through and replace the base, which would erase the tower.
    if (stackOverOf(map)[cellKey({ x, y })]?.length) return map
  }
  if (map.tiles[y][x] === tileId && isRotated(map, { x, y }) === rotated) return map
  if (next.solid) {
    const blockers = dependentsAt(map, { x, y }, objectDefinitions).filter((entry) => entry.kind !== 'prop' && entry.kind !== 'object')
    if (blockers.length) return map
  }
  const tiles = map.tiles.map((row, rowY) => (rowY === y ? row.map((id, colX) => (colX === x ? tileId : id)) : row))
  const rotation = map.tiles.map((row, rowY) => row.map((_, colX) => (rowY === y && colX === x ? rotated : isRotated(map, { x: colX, y: rowY }))))
  let result = { ...map, tiles, rotated: rotation }
  // Replacing a base prop clears its stack.
  if (stackOverOf(map)[cellKey({ x, y })]) {
    const stackOver = { ...stackOverOf(map) }
    delete stackOver[cellKey({ x, y })]
    result = withStackOver(result, stackOver)
  }
  // Remember the floor under a newly placed wall or prop (height > 0). Do not overwrite an existing memory when
  // replacing one wall/prop with another.
  const placingBlock = Boolean(next.wall || next.height > 0)
  const leavingFloor = Boolean(previous.empty || (!previous.wall && previous.height === 0))
  if (placingBlock && leavingFloor) result = rememberFloorUnder(result, { x, y }, previousId)
  return result
}

// One brush press: every tile brushPositions covers.
export const paintBrush = (map, position, tileId, rotated = false, objectDefinitions = []) =>
  brushPositions(map, position, tileId, rotated).reduce((next, at) => paintTile(next, at, tileId, rotated, objectDefinitions), map)

// Erase a wall or prop back to its remembered floor (or FLOOR_TILE). Returns { map } or { error }.
// When the cell has stacked props, pops the top of stackOver first.
export function eraseStructure(map, position) {
  const { x, y } = position
  const stacked = popStackOver(map, position)
  if (stacked) return { map: dropItemsFromRemovedSupport(stacked.map, { kind: 'tile', tile: { x, y } }) }
  const current = getTile(map.tiles[y][x])
  if (current.empty) return { map }
  if (!current.wall && !(current.height > 0)) return { error: 'Nothing to erase on this cell.' }
  const { map: cleared, floorId } = takeFloorUnder(map, position)
  const next = paintTile(cleared, position, floorId, false)
  return { map: dropItemsFromRemovedSupport(next, { kind: 'tile', tile: { x, y } }) }
}

// Paint a floor tile, or erase to Null. Blocked when dependents need the floor (unless only a wall sits there).
// Returns { map } or { error }.
export function paintFloor(map, position, tileId, objectDefinitions = []) {
  const { x, y } = position
  if (tileId === NULL_TILE) {
    const check = canEraseFloor(map, position, objectDefinitions)
    if (!check.ok) {
      const first = check.blockers[0]
      return { error: `Cannot erase floor: ${first.label} depends on it.` }
    }
    const current = getTile(map.tiles[y][x])
    // Erasing floor under a wall: leave the wall, record Null in floorUnder.
    if (current.wall || current.height > 0) {
      return { map: rememberFloorUnder(map, position, NULL_TILE) }
    }
    return { map: paintTile(map, position, NULL_TILE, false) }
  }
  const current = getTile(map.tiles[y][x])
  // Painting floor onto a wall/prop updates floorUnder rather than replacing the structure.
  if (current.wall || current.height > 0) {
    return { map: rememberFloorUnder(map, position, tileId) }
  }
  return { map: paintTile(map, position, tileId, false) }
}

function swappedCellRecord(record, a, b) {
  const keyA = cellKey(a)
  const keyB = cellKey(b)
  const hasA = Object.hasOwn(record, keyA)
  const hasB = Object.hasOwn(record, keyB)
  if (!hasA && !hasB) return record
  const next = { ...record }
  if (hasB) next[keyA] = record[keyB]
  else delete next[keyA]
  if (hasA) next[keyB] = record[keyA]
  else delete next[keyB]
  return next
}

function directItemChildren(map) {
  const children = new Map()
  for (const entry of map.groundItemPlacements ?? []) {
    const parentId = entry.on?.placement
    if (!parentId) continue
    const list = children.get(parentId) ?? []
    list.push(entry.id)
    children.set(parentId, list)
  }
  return children
}

function supportedItemIdsAt(map, position) {
  const roots = (map.groundItemPlacements ?? [])
    .filter((entry) => Array.isArray(entry.on?.tile) && entry.on.tile[0] === position.x && entry.on.tile[1] === position.y)
    .map((entry) => entry.id)
  const children = directItemChildren(map)
  const found = new Set()
  const visit = (id) => {
    if (found.has(id)) return
    found.add(id)
    for (const child of children.get(id) ?? []) visit(child)
  }
  roots.forEach(visit)
  return found
}

function moveSupportedItemsWithCells(map, a, b) {
  const fromA = supportedItemIdsAt(map, a)
  const fromB = supportedItemIdsAt(map, b)
  if (!fromA.size && !fromB.size) return map.groundItemPlacements ?? []
  const translate = (entry, from, to) => {
    const moved = {
      ...entry,
      position: {
        x: entry.position.x + to.x - from.x,
        y: entry.position.y + to.y - from.y,
      },
    }
    if (Array.isArray(entry.on?.tile) && entry.on.tile[0] === from.x && entry.on.tile[1] === from.y) {
      moved.on = { ...entry.on, tile: [to.x, to.y] }
    }
    return moved
  }
  return (map.groundItemPlacements ?? []).map((entry) => {
    if (fromA.has(entry.id)) return translate(entry, a, b)
    if (fromB.has(entry.id)) return translate(entry, b, a)
    return entry
  })
}

function cellSwapBlockers(map, position, incomingTileId) {
  if (!getTile(incomingTileId).solid) return []
  const carriedItems = supportedItemIdsAt(map, position)
  return dependentsAt(map, position).filter((entry) => {
    if (entry.kind === 'object' || entry.kind === 'prop') return false
    if (entry.kind !== 'groundItem') return true
    return !(map.groundItemPlacements ?? []).some(
      (placement) =>
        carriedItems.has(placement.id) &&
        Math.round(placement.position.x) === position.x &&
        Math.round(placement.position.y) === position.y,
    )
  })
}

// The Move tool trades complete cell structures: base, rotation, remembered floor, stacked props and every item
// supported by that structure. Markers remain separate editor entities.
export function swapTiles(map, a, b) {
  if (same(a, b)) return map
  const [tileA, tileB] = [map.tiles[a.y][a.x], map.tiles[b.y][b.x]]
  if (cellSwapBlockers(map, a, tileB).length || cellSwapBlockers(map, b, tileA).length) return map
  const [rotatedA, rotatedB] = [isRotated(map, a), isRotated(map, b)]
  const tiles = map.tiles.map((row) => row.slice())
  tiles[a.y][a.x] = tileB
  tiles[b.y][b.x] = tileA
  const rotation = map.tiles.map((row, y) => row.map((_, x) => isRotated(map, { x, y })))
  rotation[a.y][a.x] = rotatedB
  rotation[b.y][b.x] = rotatedA
  return {
    ...map,
    tiles,
    rotated: rotation,
    floorUnder: swappedCellRecord(floorUnderOf(map), a, b),
    stackOver: swappedCellRecord(stackOverOf(map), a, b),
    groundItemPlacements: moveSupportedItemsWithCells(map, a, b),
  }
}

// The Move tool's tile swap when a challenge object stands on either tile (the junction with its machinery): each goes
// with its tile, recorded in the map's objectPlacements. objectDefinitions: challengeDefinitionsFor(map), whose position is
// [x, y]. Returns { map, carried: [[objectId, { x, y }]] }.
export function swapTilesWithObjects(map, a, b, objectDefinitions) {
  const at = (point) => objectDefinitions.filter((definition) => definition.position[0] === point.x && definition.position[1] === point.y)
  const carried = [...at(a).map((definition) => [definition.id, { x: b.x, y: b.y }]), ...at(b).map((definition) => [definition.id, { x: a.x, y: a.y }])]
  const swapped = swapTiles(map, a, b)
  if (swapped === map && !same(a, b)) return { map, carried: [], error: 'A solid tile cannot move onto an occupied cell.' }
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

// Every selectable thing at a tile, tagged with its editor layer, for layer-aware hit tests and cycling.
// boardPoint (optional, the click in board px): picks a placed item where it is drawn, so one on a table is selectable.
export function selectionCandidates(map, objectDefinitions, position, { cellPx = ITEM_CELL_PX, boardPoint = null, ...pickOptions } = {}) {
  const candidates = []
  const tileId = map.tiles[position.y]?.[position.x]
  if (tileId != null && !isEmptyTile(tileId)) {
    const layer = layerOfTile(tileId)
    if (layer === 'walls' || layer === 'furniture' || layer === 'ground') {
      candidates.push({ kind: layer === 'walls' ? 'wall' : layer === 'furniture' ? 'prop' : 'tile', layer, tileId })
    }
  }
  const { npc, markerKind, object } = selectionAt(map, objectDefinitions, position)
  if (npc) candidates.push({ kind: 'npc', layer: layerOfSelection('npc'), npc })
  if (markerKind) candidates.push({ kind: markerKind, layer: layerOfSelection(markerKind), markerKind })
  if (object) candidates.push({ kind: 'object', layer: layerOfSelection('object'), object })
  const destructible = destructibleAt(map, position)
  if (destructible) candidates.push({ kind: 'destructible', layer: layerOfSelection('destructible'), destructible })
  const hazard = hazardRegionAt(map, position)
  if (hazard) candidates.push({ kind: 'hazard', layer: layerOfSelection('hazard'), hazard })
  // With a pointer the drawn art decides, and a click through transparent padding is not an item. The floor cell match is
  // only for callers with no pointer position.
  const groundItem = boardPoint ? groundItemAtBoard(map, boardPoint, pickOptions) : groundItemAt(map, position, { cellPx })
  if (groundItem) candidates.push({ kind: 'groundItem', layer: layerOfSelection('groundItem'), groundItem })
  const area = areaAt(map, position)
  if (area) candidates.push({ kind: 'area', layer: layerOfSelection('area'), area })
  const objective = (map.objectives ?? []).find((entry) => entry.position && same(entry.position, position))
  if (objective) candidates.push({ kind: 'objective', layer: layerOfSelection('objective'), objective })
  return candidates
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

export function eraseMarkers(map, position, { characters = true, markers = true } = {}) {
  return {
    ...map,
    areas: markers ? map.areas.filter((area) => !same(area.position, position)) : map.areas,
    markers: characters
      ? { playerStarts: without(map.markers.playerStarts, position), enemySpawns: without(map.markers.enemySpawns, position) }
      : map.markers,
    npcs: characters ? (map.npcs ?? []).filter((npc) => !same(npc.position, position)) : (map.npcs ?? []),
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
  const npc = { id: `npc${index}`, characterId, name: null, position, facing: 90, faction: null, disposition: 'neutral', conversationId: null, npcRules: null, alertGroupId: null, alertMethod: null, responseType: null, mustSurvive: false, influenceRadius: null }
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

// ---------- Ground inventory placements (mapFormat.js groundItemPlacements; snap cellPx matches editor grid) ----------

export const groundItemAt = (map, position, { excludeId = null, cellPx = ITEM_CELL_PX } = {}) => {
  const key = itemGridKey(position, cellPx)
  return (
    (map.groundItemPlacements ?? []).find((entry) => {
      if (excludeId && entry.id === excludeId) return false
      return itemGridKey(entry.position, cellPx) === key
    }) ?? null
  )
}

const groundItemTile = (position) => ({ x: Math.round(position.x), y: Math.round(position.y) })

function onFromSupport(support) {
  if (!support) return null
  if (support.kind === 'tile') return { tile: [support.tile.x, support.tile.y] }
  if (support.kind === 'item') return { placement: support.instanceId }
  return null
}

function supportFromOn(on) {
  if (!on) return null
  if (on.tile) {
    const tile = Array.isArray(on.tile) ? { x: on.tile[0], y: on.tile[1] } : on.tile
    return { kind: 'tile', tile }
  }
  if (on.placement) return { kind: 'item', instanceId: on.placement }
  return null
}

// Minimal exploration-shaped state so supportAt / canPlaceOn can run against authored placements.
export function placementProbeState(map, { excludeId = null, excludeIds = null } = {}) {
  const omitted = excludeIds ? new Set(excludeIds) : null
  const groundItems = {}
  const itemInstances = {}
  for (const entry of map.groundItemPlacements ?? []) {
    if ((excludeId && entry.id === excludeId) || omitted?.has(entry.id)) continue
    itemInstances[entry.id] = { id: entry.id, itemId: entry.itemId, quantity: 1 }
    const ground = { instanceId: entry.id, position: entry.position }
    const support = supportFromOn(entry.on)
    if (support) ground.support = support
    groundItems[entry.id] = ground
  }
  return { party: { map }, groundItems, itemInstances }
}

function groundItemPlaceCheck(
  map,
  position,
  { excludeId = null, excludeIds = null, itemId = null, boardPoint = null, preferredSupport = null } = {},
) {
  const state = placementProbeState(map, { excludeId, excludeIds })
  // Items lock to pack points inside canPlaceOn. The toolbar grid does not move them.
  const snapped = snapItemPosition(position, ITEM_CELL_PX)
  const at = groundItemTile(snapped)
  if (at.x < 0 || at.y < 0 || at.x >= map.width || at.y >= map.height) {
    return { ok: false, position: snapped, support: null }
  }
  const def = itemId ? getItemById(itemId) : null
  // boardPoint is the pointer on the lid. The floor cell under that pixel is the tile behind the
  // surface, so a move that only has the floor cell rejects a valid spot on the surface it is leaving.
  return canPlaceOn(state, snapped, {
    excludeInstanceId: excludeId,
    category: def?.category ?? null,
    itemId,
    boardPoint,
    preferredSupport,
  })
}

// What the board draws for an authored placement (or the tool's ghost): its support, derived world Z and depth sort key.
// Uses the whole map's placements so an item resting on another item is lifted by that item too. `probe` lets a caller
// drawing many placements build the state once.
export function groundItemElevation(map, entry, probe = placementProbeState(map)) {
  let support = supportFromOn(entry.on)
  if (!support) {
    // No authored `on`: play seeds the placement onto whatever surface its position lies on, so draw it the same way.
    const tile = groundItemTile(entry.position)
    const surface = tileSurfaceAt(map, tile)
    if (surface && pointInSurfaceFootprint(entry.position, tile, surface.inset)) support = { kind: 'tile', tile }
  }
  const id = entry.id ?? '__ghost'
  const ground = { instanceId: id, position: entry.position, ...(support ? { support } : {}) }
  const state = { ...probe, groundItems: { ...probe.groundItems, [id]: ground } }
  return {
    support,
    z: zOf(state, ground),
    depth: support ? groundItemDepth(state, ground) : entry.position.x + entry.position.y,
  }
}

// The world height of the plane `itemId` would rest on at `position`: 0 on the floor, a crate or table top, or the top
// of an item that holds others. The editor's guide grid is drawn at this height while placing. `excludeId` leaves out the
// item being dragged, so it does not count as its own support.
export function placementPlaneZ(map, position, itemId, { excludeId = null } = {}) {
  const check = groundItemPlaceCheck(map, position, { itemId, excludeId })
  const on = onFromSupport(check.support)
  if (!on) return 0
  return groundItemElevation(map, { position: check.position ?? position, on }, placementProbeState(map, { excludeId })).z
}

// The snapped cell an item tool means for a pointer at a board (SVG) point. A raised top (crate, table, an item that
// holds others) is tested in screen space like play does (rules/placement.js supportAtBoard); unprojecting to the floor
// instead lands behind or beside the furniture and rejects or misplaces the drop. Falls back to the floor under the point.
export function groundItemTargetAt(map, boardPoint, { excludeId = null } = {}) {
  const support = supportAtBoard(placementProbeState(map, { excludeId }), boardPoint, { excludeInstanceId: excludeId })
  return snapItemPosition(support?.hitPoint ?? unproject(boardPoint), ITEM_CELL_PX)
}

// The props the board draws for a map's placements, in placement order: what GroundLootView is given (position, world Z,
// depth sort key, art and size). The editor draws these and picks from these, so a click answers to what is on screen.
// Cached per map (edits make a new map), so repeated clicks on one map do not rebuild them.
const spriteLists = new WeakMap()
export function groundItemSprites(map, { excludeId = null } = {}) {
  if (!excludeId && spriteLists.has(map)) return spriteLists.get(map)
  const probe = placementProbeState(map, { excludeId })
  const list = (map.groundItemPlacements ?? []).flatMap((entry) => {
    if (excludeId && entry.id === excludeId) return []
    const def = getItemById(entry.itemId)
    if (!def) return []
    const placed = groundItemElevation(map, entry, probe)
    return [
      {
        id: entry.id,
        position: entry.position,
        z: placed.z,
        worldImage: def.worldImage,
        worldTile: def.worldTile ?? 'crate',
        spriteSize: propSpriteSize(def),
        category: def.category,
        depth: placed.depth,
      },
    ]
  })
  if (!excludeId) spriteLists.set(map, list)
  return list
}

// The placement whose drawn pixels are under a board point (the frontmost one where they overlap, transparent padding
// ignored), or null. A pixel test on the art rather than a distance to the item: sprites are tall and mostly padding, so
// neighbours' boxes overlap far more than their artwork does, and floor-cell matching (groundItemAt) cannot pick an item
// on a table at all.
export function groundItemAtBoard(map, boardPoint, { excludeId = null, ...pickOptions } = {}) {
  const hit = pickProp(groundItemSprites(map, { excludeId }), boardPoint, pickOptions)
  return hit ? (map.groundItemPlacements ?? []).find((entry) => entry.id === hit.id) ?? null : null
}

// What placing `itemId` at `position` would do, for the editor's ghost: { ok, position, on } (on omitted on the floor).
export function previewGroundItem(map, position, itemId, cellPx = ITEM_CELL_PX) {
  const check = groundItemPlaceCheck(map, position, { cellPx, itemId })
  const on = onFromSupport(check.support)
  return { ok: check.ok, position: check.position ?? position, ...(on ? { on } : {}) }
}

// When a support is removed or shortened, dependents re-resolve at the same X/Y (next surface below, else floor).
export function dropItemsFromRemovedSupport(map, supportRef) {
  if (!supportRef) return map
  const list = map.groundItemPlacements ?? []
  const children = directItemChildren(map)
  let changed = false
  const next = []
  for (let index = 0; index < list.length; index += 1) {
    const entry = list[index]
    const support = supportFromOn(entry.on)
    const lost =
      support &&
      ((supportRef.kind === 'tile' && support.kind === 'tile' && same(support.tile, supportRef.tile)) ||
        (supportRef.kind === 'item' && support.kind === 'item' && support.instanceId === supportRef.instanceId))
    if (!lost) {
      next.push(entry)
      continue
    }
    changed = true
    const { on: _on, ...rest } = entry
    // Probe without the removed support or this item's descendants. A parent must never settle onto one of its own
    // children and form a cycle; item removal calls this before it removes the support from the map.
    const excluded = new Set()
    const excludeSubtree = (id) => {
      if (excluded.has(id)) return
      excluded.add(id)
      for (const child of children.get(id) ?? []) excludeSubtree(child)
    }
    excludeSubtree(entry.id)
    if (supportRef.kind === 'item') excluded.add(supportRef.instanceId)
    const probeMap = {
      ...map,
      groundItemPlacements: [...next, ...list.slice(index + 1)].filter((candidate) => !excluded.has(candidate.id)),
    }
    const check = groundItemPlaceCheck(probeMap, rest.position, { excludeIds: excluded, itemId: entry.itemId })
    if (check.ok) {
      const replaced = { ...rest, position: check.position }
      const on = onFromSupport(check.support)
      if (on) replaced.on = on
      next.push(replaced)
    } else {
      next.push(rest)
    }
  }
  return changed ? { ...map, groundItemPlacements: next } : map
}

// Resize is a single editor transaction: clip the map geometry first, then settle any surviving items whose item or
// tile support was clipped. The geometry-only helper stays in mapFormat so codecs do not depend on editor mutations.
export function resizeMap(map, width, height, options) {
  let resized = resizeMapGeometry(map, width, height, options)
  const remainingIds = new Set((resized.groundItemPlacements ?? []).map((entry) => entry.id))
  const removedIds = (map.groundItemPlacements ?? []).filter((entry) => !remainingIds.has(entry.id)).map((entry) => entry.id)
  for (const id of removedIds) {
    resized = dropItemsFromRemovedSupport(resized, { kind: 'item', instanceId: id })
  }

  const invalidTileSupports = new Map()
  for (const entry of resized.groundItemPlacements ?? []) {
    if (!Array.isArray(entry.on?.tile)) continue
    const [x, y] = entry.on.tile
    if (tileSurfaceAt(resized, { x, y })) continue
    invalidTileSupports.set(`${x},${y}`, { x, y })
  }
  for (const tile of invalidTileSupports.values()) {
    resized = dropItemsFromRemovedSupport(resized, { kind: 'tile', tile })
  }
  return resized
}

// Returns { map, object } or null when the cell can't take it. cellPx: world-pixel snap (toolbar grid size).
export function placeGroundItem(map, position, itemId, cellPx = ITEM_CELL_PX) {
  const check = groundItemPlaceCheck(map, position, { cellPx, itemId })
  if (!check.ok) return null
  const list = map.groundItemPlacements ?? []
  const object = { id: freeId(itemId, new Set(list.map((entry) => entry.id))), itemId, position: check.position }
  const on = onFromSupport(check.support)
  if (on) object.on = on
  return { map: { ...map, groundItemPlacements: [...list, object] }, object }
}

export function moveGroundItem(map, id, position, cellPx = ITEM_CELL_PX, boardPoint = null) {
  const object = (map.groundItemPlacements ?? []).find((entry) => entry.id === id)
  if (!object) return map
  const children = directItemChildren(map)
  const subtree = new Set()
  const visit = (instanceId) => {
    if (subtree.has(instanceId)) return
    subtree.add(instanceId)
    for (const child of children.get(instanceId) ?? []) visit(child)
  }
  visit(id)
  const check = groundItemPlaceCheck(map, position, {
    excludeId: id,
    excludeIds: subtree,
    cellPx,
    itemId: object.itemId,
    boardPoint,
    preferredSupport: supportFromOn(object.on),
  })
  if (!check.ok) return map
  const dx = check.position.x - object.position.x
  const dy = check.position.y - object.position.y
  return {
    ...map,
    groundItemPlacements: map.groundItemPlacements.map((entry) => {
      if (!subtree.has(entry.id)) return entry
      const next = {
        ...entry,
        position: entry.id === id ? check.position : { x: entry.position.x + dx, y: entry.position.y + dy },
      }
      if (entry.id !== id) return next
      const on = onFromSupport(check.support)
      if (on) next.on = on
      else delete next.on
      return next
    }),
  }
}

// changes: name, pickable, visible, position, on (null clears support).
export function updateGroundItem(map, id, changes, cellPx = ITEM_CELL_PX) {
  const { position, ...metadataChanges } = changes
  const positioned = position ? moveGroundItem(map, id, position, cellPx) : map
  if (!Object.keys(metadataChanges).length) return positioned
  return {
    ...positioned,
    groundItemPlacements: (positioned.groundItemPlacements ?? []).map((entry) => {
      if (entry.id !== id) return entry
      const next = { ...entry, ...metadataChanges }
      if (metadataChanges.on === null) delete next.on
      if (next.name === null || next.name === '') delete next.name
      if (next.pickable === true || next.pickable == null) delete next.pickable
      if (next.visible === true || next.visible == null) delete next.visible
      return next
    }),
  }
}

export const removeGroundItem = (map, id) => {
  const cleared = dropItemsFromRemovedSupport(map, { kind: 'item', instanceId: id })
  return {
    ...cleared,
    groundItemPlacements: (cleared.groundItemPlacements ?? []).filter((entry) => entry.id !== id),
  }
}

// A copy (new id, same overrides) on the nearest free snap cell within 4 tiles. Returns { map, object } or null.
export function duplicateGroundItem(map, id, cellPx = ITEM_CELL_PX) {
  const source = (map.groundItemPlacements ?? []).find((entry) => entry.id === id)
  if (!source) return null
  const step = (Number(cellPx) > 0 ? Number(cellPx) : ITEM_CELL_PX) / TILE_W
  const maxRing = Math.max(1, Math.ceil(4 / step))
  for (let ring = 1; ring <= maxRing; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
        const position = snapItemPosition({ x: source.position.x + dx * step, y: source.position.y + dy * step }, cellPx)
        const placed = placeGroundItem(map, position, source.itemId, cellPx)
        if (!placed) continue
        const object = {
          ...placed.object,
          ...(source.name ? { name: source.name } : {}),
          ...(source.pickable === false ? { pickable: false } : {}),
          ...(source.visible === false ? { visible: false } : {}),
        }
        return {
          map: {
            ...placed.map,
            groundItemPlacements: placed.map.groundItemPlacements.map((entry) => (entry.id === object.id ? object : entry)),
          },
          object,
        }
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
