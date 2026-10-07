// Two-tile wall panels (exploration and Combat Type 1). Two of the same built wall (tiles.json panels) side by side in
// a straight run are drawn as one panel; every other panel along a run has a window. Presentation only: sight, cover
// and movement still read the single tiles.
import { getTile, isRotated } from './mapFormat.js'

// axis: 'x' (the run goes along x; the panel is on the tiles' +y face) or 'y' (along y; on the +x face).
// half: 0 or 1 (which tile of the panel). window: whether the panel has a window.
const key = (x, y) => `${x},${y}`

// Pairs up a run of tiles (in order along it) into panels, alternating plain and window panels.
function pairRun(run, axis, panels) {
  for (let index = 0; index + 1 < run.length; index += 2) {
    const window = (index / 2) % 2 === 1
    panels.set(run[index], { axis, half: 0, window })
    panels.set(run[index + 1], { axis, half: 1, window })
  }
}

// Map of 'x,y' -> { axis, half, window } for every wall tile that is part of a panel. Runs along x are paired first;
// what is left (walls running along y, corners, rotated walls) is paired along y. Rotated walls (mapFormat.js rotated)
// never pair along x. A wall left without a partner stays a single tile.
export function getWallPanels(map) {
  const panels = new Map()
  const panelTile = (x, y, axis) =>
    x >= 0 && y >= 0 && x < map.width && y < map.height && getTile(map.tiles[y][x]).panels && !(axis === 'x' && isRotated(map, { x, y })) ? map.tiles[y][x] : null
  const collect = (axis) => {
    const outer = axis === 'x' ? map.height : map.width
    const inner = axis === 'x' ? map.width : map.height
    for (let a = 0; a < outer; a++) {
      let run = []
      let runTile = null
      const flush = () => {
        if (run.length > 1) pairRun(run, axis, panels)
        run = []
        runTile = null
      }
      for (let b = 0; b < inner; b++) {
        const [x, y] = axis === 'x' ? [b, a] : [a, b]
        const tile = panelTile(x, y, axis)
        const free = tile && !panels.has(key(x, y))
        // A run is one wall type, unbroken; a different wall or a gap starts a new one.
        if (!free || tile !== runTile) flush()
        if (free) {
          run.push(key(x, y))
          runTile = tile
        }
      }
      flush()
    }
  }
  collect('x')
  collect('y')
  return panels
}

// The other tile ('x,y') of the panel a tile belongs to.
function partnerKey(tileKey, panel) {
  const [x, y] = tileKey.split(',').map(Number)
  const step = panel.half === 0 ? 1 : -1
  return panel.axis === 'x' ? key(x + step, y) : key(x, y + step)
}

// A panel is one piece of wall, so when either half fades the whole panel fades.
export function fadeWholePanels(faded, panels) {
  const whole = new Set(faded)
  for (const tileKey of faded) {
    const panel = panels.get(tileKey)
    if (panel) whole.add(partnerKey(tileKey, panel))
  }
  return whole
}
