// Pure edits for the dev map editor; each returns a new map (or the same one when nothing changed).
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
  }
}

export const areaAt = (map, position) => map.areas.find((area) => same(area.position, position)) ?? null

// An empty name removes the label.
export function setAreaLabel(map, position, name) {
  const areas = map.areas.filter((area) => !same(area.position, position))
  const trimmed = name.trim()
  return { ...map, areas: trimmed ? [...areas, { name: trimmed, position }] : areas }
}
