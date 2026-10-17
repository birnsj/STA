// The hidden square logical grid under the battlefield. Positions are { x, y } (x = column, y = row).
// The map comes from a shared map file (src/maps/mapFormat.js); what each tile does comes from the shared tile catalogue.
import { getTile, WALL_TILE } from '../maps/mapFormat.js'

// Combat only needs the grid of a parsed map file, plus the tiles hazards mark (world/environment.js applyEnvironmentTiles).
export const toBattleMap = (mapFile) => ({
  width: mapFile.width,
  height: mapFile.height,
  tiles: mapFile.tiles,
  rotated: mapFile.rotated,
  ambient: mapFile.ambient,
  // Area names for the combat minimap (same readout as exploration).
  ...(mapFile.areas?.length ? { areas: mapFile.areas } : {}),
  ...(mapFile.sightBlockers ? { sightBlockers: mapFile.sightBlockers, coverKeys: mapFile.coverKeys, slowKeys: mapFile.slowKeys, environmentKey: mapFile.environmentKey } : {}),
})

export const tileKey = ({ x, y }) => `${x},${y}`
export const samePosition = (a, b) => a.x === b.x && a.y === b.y
export const toPosition = ([x, y]) => ({ x, y })

export const isInside = (map, { x, y }) => {
  const cx = Math.round(x)
  const cy = Math.round(y)
  return cx >= 0 && cy >= 0 && cx < map.width && cy < map.height
}
// Integer tile lookup — exploration positions are continuous; fractional indices are not valid array rows.
export const tileAt = (map, position) => {
  const cell = { x: Math.round(position.x), y: Math.round(position.y) }
  return isInside(map, cell) ? map.tiles[cell.y][cell.x] : WALL_TILE
}

// Solid tiles (walls, crates, machinery...) block movement; only tiles that block sight block line of fire, as does
// thick smoke or gas (map.sightBlockers).
export const blocksMovement = (map, position) => getTile(tileAt(map, position)).solid
export const blocksLineOfFire = (map, position) => getTile(tileAt(map, position)).blocksSight || Boolean(map.sightBlockers?.[`${position.x},${position.y}`])
// A slowing hazard (the coolant leak; map.slowKeys) makes a tile cost two steps of movement.
export const isSlowTile = (map, position) => Boolean(map.slowKeys?.[`${position.x},${position.y}`])
export const givesCover = (map, position) => getTile(tileAt(map, position)).cover

export const NEIGHBOUR_OFFSETS = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
  [1, -1], [1, 1], [-1, 1], [-1, -1],
]

export const neighbours = (position) => NEIGHBOUR_OFFSETS.map(([dx, dy]) => ({ x: position.x + dx, y: position.y + dy }))
