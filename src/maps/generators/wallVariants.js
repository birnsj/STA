// Generate Map's last pass: some of each base wall's pieces become the set's variant wall tiles
// (generatedWallVariants.json). Whole plain panels swap for a long fitting so the two-tile panel art stays intact;
// window panels are left alone. Corner tiles stay plain: a fitting there sits on the face into the corner and reads as
// hanging off the wall (designer request, Oct 2026). Prototype presentation, not a source-book rule.
import variantData from '../../data/adaptation/maps/generatedWallVariants.json'
import { getTile } from '../mapFormat.js'
import { getWallPanels } from '../wallPanels.js'

const pick = (list, random) => list[Math.floor(random() * list.length)]

const isWallAt = (map, x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && Boolean(getTile(map.tiles[y][x]).wall)

// A wall tile with wall beside it along both axes: a corner, or where one wall meets another (a T).
export function isWallCorner(map, x, y) {
  return (isWallAt(map, x - 1, y) || isWallAt(map, x + 1, y)) && (isWallAt(map, x, y - 1) || isWallAt(map, x, y + 1))
}

export function applyWallVariants(map, random) {
  const tiles = map.tiles.map((row) => [...row])
  const panels = getWallPanels(map)
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const set = variantData.walls[map.tiles[y][x]]
      if (!set) continue
      const panel = panels.get(`${x},${y}`)
      // A corner still makes its draws, so every other wall gets the variant it got before corners were left plain.
      if (!panel) {
        if (set.tileVariants?.length && random() < set.share) {
          const variant = pick(set.tileVariants, random)
          if (!isWallCorner(map, x, y)) tiles[y][x] = variant
        }
        continue
      }
      // A panel is decided once, at its first tile, and both tiles change together.
      if (panel.half !== 0 || panel.window || !set.panelVariants?.length || random() >= set.share) continue
      const variant = pick(set.panelVariants, random)
      const [px, py] = panel.axis === 'x' ? [x + 1, y] : [x, y + 1]
      if (isWallCorner(map, x, y) || isWallCorner(map, px, py)) continue
      tiles[y][x] = variant
      tiles[py][px] = variant
    }
  }
  return { ...map, tiles }
}
