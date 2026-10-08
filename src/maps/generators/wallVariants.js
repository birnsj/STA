// Generate Map's last pass: some of each base wall's pieces become the set's variant wall tiles
// (generatedWallVariants.json). Whole plain panels swap for a long fitting so the two-tile panel art stays intact;
// window panels are left alone. Prototype presentation, not a source-book rule.
import variantData from '../../data/adaptation/maps/generatedWallVariants.json'
import { getWallPanels } from '../wallPanels.js'

const pick = (list, random) => list[Math.floor(random() * list.length)]

export function applyWallVariants(map, random) {
  const tiles = map.tiles.map((row) => [...row])
  const panels = getWallPanels(map)
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const set = variantData.walls[map.tiles[y][x]]
      if (!set) continue
      const panel = panels.get(`${x},${y}`)
      if (!panel) {
        if (set.tileVariants?.length && random() < set.share) tiles[y][x] = pick(set.tileVariants, random)
        continue
      }
      // A panel is decided once, at its first tile, and both tiles change together.
      if (panel.half !== 0 || panel.window || !set.panelVariants?.length || random() >= set.share) continue
      const variant = pick(set.panelVariants, random)
      tiles[y][x] = variant
      if (panel.axis === 'x') tiles[y][x + 1] = variant
      else tiles[y + 1][x] = variant
    }
  }
  return { ...map, tiles }
}
