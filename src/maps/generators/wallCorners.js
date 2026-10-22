// After Generate Map places a deck's wall tile, junctions (L / T / cross) become the style's corner tile when set.
// Runs after wall fittings so fittings never land on junctions (wallVariants skips geometric corners first).
import { getTile } from '../mapFormat.js'
import { getDeckStyle, isDeckGeneratorId } from './deckStyles.js'

// Replace style.wall tiles that meet on both axes with style.corner. No-op when corner is unset.
export function finishWallCorners(map) {
  if (!isDeckGeneratorId(map.mapType)) return map
  const { wall, corner } = getDeckStyle(map.mapType)
  if (!corner || corner === wall) return map

  const { width, height } = map
  const tiles = map.tiles.map((row) => [...row])
  const rotated = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => Boolean(map.rotated?.[y]?.[x])),
  )

  const isFamily = (id) => id === wall || id === corner
  const wallAt = (x, y) => x >= 0 && y >= 0 && x < width && y < height && isFamily(tiles[y][x])
  const openAt = (x, y) => x >= 0 && y >= 0 && x < width && y < height && !getTile(tiles[y][x]).solid

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x] !== wall) continue
      const n = wallAt(x, y - 1)
      const s = wallAt(x, y + 1)
      const e = wallAt(x + 1, y)
      const w = wallAt(x - 1, y)
      if (!((n || s) && (e || w))) continue
      tiles[y][x] = corner
      // Same facing rule as thin-wall corners: mirror when the open corner is toward +x / +y.
      rotated[y][x] = openAt(x + 1, y) || openAt(x, y + 1)
    }
  }

  return { ...map, tiles, rotated }
}
