// Tall walls and objects and see-through blocks (exploration and Combat Type 1). Presentation only: nothing here changes
// movement, sight or cover. tiles.json: height (how tall a block stands), imageHeight (walls' and tall objects' taller
// images), big (2x2 squares drawn as one object twice the size, bigObjects.js), fade (see-through while hiding a party
// member). Which walls fade together (room cutaway, wall sections, stickiness): data/adaptation/maps/wallFade.json.
import sprites from '../data/adaptation/characterSprites.json'
import tuning from '../data/adaptation/maps/wallFade.json'
import { BIG_IMAGE } from './bigObjects.js'
import { project, TILE_H, TILE_W } from './iso.js'
import { getTile, imageSize, TILE_IMAGE, TILES } from './mapFormat.js'

// How far above a standing figure's feet it is drawn (a full-body sprite or the portrait token is about 52px tall,
// Andorian antennae a little more, the lead badge above it), times characterSprites.json displayScale.
const FIGURE_SCALE = sprites.displayScale ?? 1
const FIGURE_TOP = 60 * FIGURE_SCALE
const FIGURE_HALF_WIDTH = 17 * FIGURE_SCALE

// The most any tile's drawing reaches above a standard tile image on the same tile (taller images, and big objects'
// images, which stand on a 2x2 footprint one row further forward), for camera bounds.
const tallest = Math.max(...TILES.map((tile) => imageSize(tile).height))
const bigReach = TILES.some((tile) => tile.big) ? BIG_IMAGE.height - TILE_IMAGE.height - TILE_H : 0
export const TALL_WALL_EXTRA = Math.max(tallest - TILE_IMAGE.height, bigReach)

const keyOf = (x, y) => `${x},${y}`

// The screen shape a block is drawn in: depth (painter's x + y of its nearest tile), centre x, top, bottom, half width.
function blockShape({ x, y }, tile, origin) {
  if (origin) {
    const centre = project({ x: origin.x + 0.5, y: origin.y + 0.5 })
    return { depth: origin.x + origin.y + 2, x: centre.x, top: centre.y - TILE_H - tile.big.height, bottom: centre.y + TILE_H, halfWidth: TILE_W }
  }
  const base = project({ x, y })
  return { depth: x + y, x: base.x, top: base.y - TILE_H / 2 - tile.height, bottom: base.y + TILE_H / 2, halfWidth: TILE_W / 2 }
}

// A block hides a figure drawn behind it (figure depth x + y + 0.5, as the boards sort them) when the figure's token
// overlaps the block's drawn shape, grown by margin on every side.
function hides(shape, point, margin = 0) {
  if (point.x + point.y + 0.5 >= shape.depth) return false
  const figure = project(point)
  return Math.abs(figure.x - shape.x) < shape.halfWidth + FIGURE_HALF_WIDTH + margin && figure.y > shape.top - margin && figure.y - FIGURE_TOP < shape.bottom + margin
}

// The map's fading blocks ([{ key, shape }]), worked out once per map and bigGroups, as the views ask every frame.
const fadeShapes = new WeakMap()
function fadingBlocks(map, bigGroups) {
  const cached = fadeShapes.get(map)
  if (cached?.bigGroups === bigGroups) return cached.blocks
  const blocks = []
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = getTile(map.tiles[y][x])
      if (!tile.fade || tile.height <= 0) continue
      const key = keyOf(x, y)
      blocks.push({ key, shape: blockShape({ x, y }, tile, bigGroups?.get(key)) })
    }
  }
  fadeShapes.set(map, { bigGroups, blocks })
  return blocks
}

// ---------- spaces and sections ----------

const isWall = (map, x, y) => x < 0 || y < 0 || x >= map.width || y >= map.height || Boolean(getTile(map.tiles[y][x]).wall)
const isFadingWall = (map, x, y) => {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false
  const tile = getTile(map.tiles[y][x])
  return Boolean(tile.wall && tile.fade && tile.height > 0)
}
const isDoorway = (map, x, y) => map.tiles[y][x] === 'doorway'

// The map's spaces and wall sections, worked out once per map: { spaceAt (Int32Array, -1 for walls and doorways),
// spaces: [{ kind: 'room' | 'corridor' | 'open', frontWalls: [keys], frontGroups (rooms): [side] }] (roomSides),
// sectionOf: Map key -> [keys], frontGroupOf: Map key -> [side] }.
const analyses = new WeakMap()
export function analyseWalls(map) {
  const cached = analyses.get(map)
  if (cached) return cached
  const { width, height } = map
  const spaceAt = new Int32Array(width * height).fill(-1)
  const spaces = []
  for (let y0 = 0; y0 < height; y0++) {
    for (let x0 = 0; x0 < width; x0++) {
      if (spaceAt[y0 * width + x0] !== -1 || isWall(map, x0, y0) || isDoorway(map, x0, y0)) continue
      const id = spaces.length
      const tiles = []
      let touchesEdge = false
      const stack = [[x0, y0]]
      spaceAt[y0 * width + x0] = id
      while (stack.length) {
        const [x, y] = stack.pop()
        tiles.push([x, y])
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || spaceAt[ny * width + nx] !== -1) continue
          if (isWall(map, nx, ny) || isDoorway(map, nx, ny)) continue
          spaceAt[ny * width + nx] = id
          stack.push([nx, ny])
        }
      }
      spaces.push({ tiles, touchesEdge })
    }
  }
  const inSpace = (x, y, id) => x >= 0 && y >= 0 && x < width && y < height && spaceAt[y * width + x] === id
  const classified = spaces.map(({ tiles, touchesEdge }, id) => {
    if (touchesEdge || tiles.length > tuning.roomMaxTiles) return { kind: 'open', frontWalls: [] }
    const inner = tiles.filter(([x, y]) => [-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => inSpace(x + dx, y + dy, id)))).length
    if (inner < tiles.length * tuning.corridorInnerFraction) return { kind: 'corridor', frontWalls: [] }
    // The camera looks from +x +y: the walls on those sides of the room are in front, with the corner where they meet
    // (on both sides) and the corner posts at their far ends (where they turn into the back walls).
    const east = new Set()
    const south = new Set()
    const add = (side, cx, cy) => isFadingWall(map, cx, cy) && side.add(keyOf(cx, cy))
    const corner = (sides, cx, cy, sideA, sideB) => {
      if (isWall(map, ...sideA) && isWall(map, ...sideB)) sides.forEach((side) => add(side, cx, cy))
    }
    for (const [x, y] of tiles) {
      add(east, x + 1, y)
      add(south, x, y + 1)
      corner([east, south], x + 1, y + 1, [x + 1, y], [x, y + 1])
      corner([south], x - 1, y + 1, [x - 1, y], [x, y + 1])
      corner([east], x + 1, y - 1, [x + 1, y], [x, y - 1])
    }
    const frontGroups = [...roomSides(east, 'x'), ...roomSides(south, 'y')]
    return { kind: 'room', frontWalls: [...new Set([...east, ...south])], frontGroups }
  })
  // Each room front wall's groups (a corner where two sides meet is in both).
  const frontGroupOf = new Map()
  for (const space of classified) {
    for (const side of space.frontGroups ?? []) {
      for (const key of side.keys) frontGroupOf.set(key, [...(frontGroupOf.get(key) ?? []), side])
    }
  }
  const analysis = { spaceAt, spaces: classified, sectionOf: wallSections(map), frontGroupOf }
  analyses.set(map, analysis)
  return analysis
}

// A room side's walls grouped by the line they stand on, doorways and all: { keys, across ('x' for an east side, 'y'
// for a south side: the axis leading away from the wall), line (that coordinate), from, to (its extent along the wall) }.
function roomSides(keySet, across) {
  const byLine = new Map()
  for (const key of keySet) {
    const [x, y] = key.split(',').map(Number)
    const [line, along] = across === 'x' ? [x, y] : [y, x]
    const side = byLine.get(line) ?? { keys: [], across, line, from: along, to: along }
    side.keys.push(key)
    side.from = Math.min(side.from, along)
    side.to = Math.max(side.to, along)
    byLine.set(line, side)
  }
  return [...byLine.values()]
}

// Straight runs of fading wall, along x first and then along y for what is left, each cut every sectionLength tiles.
function wallSections(map) {
  const sectionOf = new Map()
  const collect = (axis) => {
    const outer = axis === 'x' ? map.height : map.width
    const inner = axis === 'x' ? map.width : map.height
    for (let a = 0; a < outer; a++) {
      let run = []
      const flush = () => {
        // A lone tile along x may still be part of a run along y.
        if (run.length > 1 || axis === 'y') {
          for (let start = 0; start < run.length; start += tuning.sectionLength) {
            const section = run.slice(start, start + tuning.sectionLength)
            for (const key of section) sectionOf.set(key, section)
          }
        }
        run = []
      }
      for (let b = 0; b < inner; b++) {
        const [x, y] = axis === 'x' ? [b, a] : [a, b]
        if (isFadingWall(map, x, y) && !sectionOf.has(keyOf(x, y))) run.push(keyOf(x, y))
        else flush()
      }
      flush()
    }
  }
  collect('x')
  collect('y')
  return sectionOf
}

// ---------- what fades ----------

// memory: what faded last time ({ map, keys, spaces: { [figureId]: space index } }), for stickiness.
export const NO_WALL_FADE = { map: null, keys: new Set(), spaces: {} }

// The fading blocks to draw see-through now, and the memory for next time. figures: [{ id, position }] (tile
// positions, fractional while moving). bigGroups: getBigObjects(map) when big objects are drawn, so their tiles are
// tested against the whole object.
export function wallFadeStep(map, figures, bigGroups = null, memory = NO_WALL_FADE) {
  const previous = memory.map === map ? memory : NO_WALL_FADE
  const keys = new Set()
  const spaces = {}
  if (!figures.length) return { map, keys, spaces }
  const { spaceAt, spaces: spaceList, sectionOf, frontGroupOf } = analyseWalls(map)
  // The front walls of the rooms the figures are in: only their distance from a side decides those.
  const ownFront = new Set()
  const addGroup = (group) => group.forEach((key) => keys.add(key))
  const addSection = (key) => (sectionOf.get(key) ?? [key]).forEach((sectionKey) => !ownFront.has(sectionKey) && keys.add(sectionKey))
  // Some figure within fadeRange tiles (diagonal steps count as one) of any wall in the section.
  const nearSection = (section) =>
    section.some((key) => {
      const [x, y] = key.split(',').map(Number)
      return figures.some(({ position }) => Math.max(Math.abs(position.x - x), Math.abs(position.y - y)) <= tuning.fadeRange)
    })
  // Some figure less than roomSideRange tiles from a room side, straight out from the wall, and alongside it.
  const range = tuning.roomSideRange
  const nearSide = ({ across, line, from, to }) =>
    figures.some(({ position }) => {
      const [out, along] = across === 'x' ? [position.x, position.y] : [position.y, position.x]
      return Math.abs(out - line) < range && along > from - range && along < to + range
    })
  for (const { id, position } of figures) {
    const x = Math.round(position.x)
    const y = Math.round(position.y)
    const here = x >= 0 && y >= 0 && x < map.width && y < map.height ? spaceAt[y * map.width + x] : -1
    // In a doorway (or brushing a wall): still in the space they came from.
    const space = here >= 0 ? here : (previous.spaces[id] ?? -1)
    spaces[id] = space
    if (space >= 0) spaceList[space].frontWalls.forEach((key) => ownFront.add(key))
  }
  for (const space of new Set(Object.values(spaces))) {
    if (space >= 0) for (const side of spaceList[space].frontGroups ?? []) if (nearSide(side)) addGroup(side.keys)
  }
  for (const { key, shape } of fadingBlocks(map, bigGroups)) {
    const margin = previous.keys.has(key) ? tuning.releaseMargin : 0
    if (figures.some(({ position }) => hides(shape, position, margin))) addSection(key)
  }
  // A faded side or section comes back only once every figure is more than fadeRange tiles from it.
  for (const key of previous.keys) {
    if (keys.has(key)) continue
    const sides = frontGroupOf.get(key)
    if (sides) sides.filter(nearSide).forEach((side) => addGroup(side.keys))
    else if (nearSection(sectionOf.get(key) ?? [key])) addSection(key)
  }
  return { map, keys, spaces }
}

const sameSet = (a, b) => a.size === b.size && [...a].every((key) => b.has(key))
const sameSpaces = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([id, space]) => b[id] === space)
export const sameWallFade = (a, b) => a.map === b.map && sameSet(a.keys, b.keys) && sameSpaces(a.spaces, b.spaces)

// Keys ('x,y') of the fading blocks to draw see-through for these points (party members' tile positions), with no
// memory of the last frame.
export function fadedBlockKeys(map, points, bigGroups = null) {
  return wallFadeStep(
    map,
    points.map((position, index) => ({ id: index, position })),
    bigGroups,
  ).keys
}
