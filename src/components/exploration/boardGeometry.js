import { project, TILE_H, TILE_W, tileImageBox } from '../../maps/iso.js'
import { getTile, imageSize } from '../../maps/mapFormat.js'
import { TALL_WALL_EXTRA } from '../../maps/wallFade.js'
import { BIG_IMAGE } from '../../maps/bigObjects.js'
import { getSpriteMetrics } from '../../rules/appearance.js'

// The exploration board's (PixiExplorationBoard) view, input timings, and where challenge objects' highlights and
// markers go. Presentation only.

export const VIEW = { width: 1024, height: 576 }
const HUD_MARGIN = { x: 200, top: 150, bottom: 130 }
// While the left button is held the destination follows the pointer, re-sent at most this often...
export const HOLD_INTERVAL_MS = 90
// ...and only when the point under the pointer moved this far (in tiles).
export const HOLD_MIN_CHANGE = 0.2
// A press released this quickly, without steering, is a click: it gets the ground ring. Holds don't.
export const CLICK_MAX_MS = 250
// How long the ring stays.
export const CLICK_PULSE_MS = 400
// A right-button press must move this far (screen pixels) before it draws a selection box.
export const BOX_MIN_DRAG = 6
// Figures are drawn this much larger than their frames (characterSprites.json displayScale), so their windows are too.
export const FIGURE_SCALE = getSpriteMetrics().displayScale ?? 1
// The party's starting points are spread evenly over half a stride, not a whole one: half a stride apart, a walk looks
// the same with the legs swapped.
export const STRIDE_SPREAD = 0.5
// A character is in the box when any of their figure (feet at the point, about 50 high, 20 wide) is.
export const figureInBox = (feet, a, b) =>
  feet.x + 10 >= Math.min(a.x, b.x) && feet.x - 10 <= Math.max(a.x, b.x) && feet.y >= Math.min(a.y, b.y) && feet.y - 50 <= Math.max(a.y, b.y)

export const worldBounds = (map) => ({
  minX: -(map.height * TILE_W) / 2 - HUD_MARGIN.x,
  maxX: (map.width * TILE_W) / 2 + HUD_MARGIN.x,
  minY: -TILE_H / 2 - TALL_WALL_EXTRA - HUD_MARGIN.top,
  maxY: ((map.width + map.height - 1) * TILE_H) / 2 + HUD_MARGIN.bottom,
})

// The NPC's name tag: over the head where the party's LEAD tag goes, or just above a body lying down.
export const NPC_TAG_Y = -58
export const NPC_TAG_DOWN_Y = -22

// The tiles a challenge object's art is drawn on, in painter's order: its own and its covers, and the whole footprint of
// a big object (bigObjects.js), which draws its image in strips from three of its four tiles.
export function highlightTiles(tiles, bigGroups) {
  const keyed = new Map()
  for (const tile of tiles) {
    const origin = bigGroups.get(`${tile.x},${tile.y}`)
    const footprint = origin ? [origin, { x: origin.x + 1, y: origin.y }, { x: origin.x, y: origin.y + 1 }, { x: origin.x + 1, y: origin.y + 1 }] : [tile]
    for (const point of footprint) keyed.set(`${point.x},${point.y}`, point)
  }
  return [...keyed.values()].sort((a, b) => a.x + a.y - (b.x + b.y))
}

// The world rect the highlighted art (and its glow) is drawn in.
export const HIGHLIGHT_GLOW = 6
// Each tile's art box (a big object's whole image).
export function artBoxes(map, bigGroups, tiles) {
  return tiles.map((tile) => {
    const origin = bigGroups.get(`${tile.x},${tile.y}`)
    if (origin) {
      const centre = project({ x: origin.x + 0.5, y: origin.y + 0.5 })
      return { x: centre.x - BIG_IMAGE.width / 2, y: centre.y + TILE_H - BIG_IMAGE.height, width: BIG_IMAGE.width, height: BIG_IMAGE.height }
    }
    return tileImageBox(tile, imageSize(getTile(map.tiles[tile.y][tile.x])))
  })
}
export function highlightBox(map, bigGroups, tiles) {
  const boxes = artBoxes(map, bigGroups, tiles)
  const left = Math.min(...boxes.map((box) => box.x)) - HIGHLIGHT_GLOW
  const top = Math.min(...boxes.map((box) => box.y)) - HIGHLIGHT_GLOW
  const right = Math.max(...boxes.map((box) => box.x + box.width)) + HIGHLIGHT_GLOW
  const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + HIGHLIGHT_GLOW
  return { x: left, y: top, width: right - left, height: bottom - top }
}

// The world y of the top of the object's art: each tile's top face peak (tiles.json height above its floor diamond's
// top corner), so the marker isn't pushed up by the empty space above the art in a tile image. A big object without a
// height falls back to its image's top edge.
export function artTopY(map, bigGroups, tiles, art) {
  return Math.min(
    ...tiles.map((tile) => {
      const { height } = getTile(map.tiles[tile.y][tile.x])
      if (bigGroups.has(`${tile.x},${tile.y}`) && !height) return art.y + HIGHLIGHT_GLOW
      return project(tile).y - TILE_H / 2 - (height ?? 0)
    }),
  )
}

// The outline and marker colours by object state.
export const OUTLINE_COLOURS = { unresolved: '#f6b928', changed: '#4fd6c4' }

// Where the marker's parts sit above the top of the object's art (y up from it): the diamond just over the art, then
// the state, then the name on top.
export const MARKER_DIAMOND = 4
export const MARKER_STATE = 31
export const MARKER_NAME = 42
export const MARKER_HEIGHT = MARKER_NAME + 12
