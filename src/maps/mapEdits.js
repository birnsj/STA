// Pure edits for the dev map editor; each returns a new map (or the same one when nothing changed).
import { nextFacing, spawnFacing } from './facing.js'
import { getTile, isRotated } from './mapFormat.js'

const same = (a, b) => a.x === b.x && a.y === b.y
const without = (list, position) => list.filter((other) => !same(other, position))

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
  // Markers can't stand inside solid tiles.
  const markers = getTile(tileId).solid
    ? { playerStarts: without(map.markers.playerStarts, { x, y }), enemySpawns: without(map.markers.enemySpawns, { x, y }) }
    : map.markers
  return { ...map, tiles, rotated: rotation, markers }
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
  const npc = { id: `npc${index}`, characterId, name: null, position, facing: 90, faction: null, disposition: 'neutral', conversationId: null, npcRules: null, alertGroupId: null, alertMethod: null, responseType: null }
  return { map: { ...map, npcs: [...npcs, npc] }, npc }
}

// changes: any NPC fields; a position change is refused onto a solid or taken tile.
export function updateNpc(map, npcId, changes) {
  const target = changes.position
  if (target && (getTile(map.tiles[target.y][target.x]).solid || (npcAt(map, target) && npcAt(map, target).id !== npcId))) return map
  return { ...map, npcs: (map.npcs ?? []).map((npc) => (npc.id === npcId ? { ...npc, ...changes } : npc)) }
}

export const removeNpc = (map, npcId) => ({ ...map, npcs: (map.npcs ?? []).filter((npc) => npc.id !== npcId) })

export const areaAt = (map, position) => map.areas.find((area) => same(area.position, position)) ?? null

// An empty name removes the label.
export function setAreaLabel(map, position, name) {
  const areas = map.areas.filter((area) => !same(area.position, position))
  const trimmed = name.trim()
  return { ...map, areas: trimmed ? [...areas, { name: trimmed, position }] : areas }
}
