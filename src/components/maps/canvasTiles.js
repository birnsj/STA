// Every map view's tiles drawn into canvases (MapCanvas.jsx): floor tiles, contact shadows and light pools, then every
// block in painter's order (x + y), drawn as IsoTiles.jsx draws them (walls with their panel faces, windows and
// fittings, tall objects, 2x2 big objects, joined railings), every image at its own size; animated tiles (tileArt.js
// flipbooks) on an animation layer over them, and the map's darkness. A canvas is one element for the browser to draw
// however big the map, and a change only repaints the area it touched. Light pools are drawn steady. Presentation only.
import { BIG_IMAGE, getBigObjects } from '../../maps/bigObjects.js'
import { isBlock, project, TILE_H, TILE_W, tileImage, tileImageBox } from '../../maps/iso.js'
import { getTile, imageSize, isRotated, TILE_IMAGE } from '../../maps/mapFormat.js'
import { joinedImage } from '../../maps/railJoins.js'
import {
  animationOffset,
  bigFlipbook,
  DARKNESS_COLOUR,
  darknessLights,
  darknessOpacity,
  frameAt,
  panelArt,
  panelFlipbook,
  tileFlipbook,
  tileGlow,
  WALL_GLOW_SIZE,
  wallGlow,
  wallVariant,
} from '../../maps/tileArt.js'
import { getWallPanels } from '../../maps/wallPanels.js'
import { TALL_WALL_EXTRA } from '../../maps/wallFade.js'
import { edgeStrip, FRAME, SHADE_BANDS, SIDES, WINDOW } from './tileShapes.js'

const IMAGE_H = TILE_IMAGE.height
const GHOST_OPACITY = 0.35
// maps.css tilemap-block.is-faded.
export const FADED_OPACITY = 0.3
const NONE = new Set()
// A steady stand-in for the glow pools' CSS animation (maps.css tilemap-glow): roughly its average brightness.
const GLOW_OPACITY = 0.8

const keyOf = ({ x, y }) => `${x},${y}`

// ---------------------------------------------------------------- animation passes

// A pass is null (the board: everything but animated tiles) or { layer, time } at `time` seconds (null for every
// loop's first frame): 'frames', the animation layer over the board (each animated tile's sprite at its frame), or
// 'cut', the shape of those sprites' lit parts (their emission), cut out of the map's darkness (drawDarkness) so lights
// stay at full brightness however dark the map is.

// A tile's own drawing: on the board, as it is; on an animation layer, cut out of it so that animated tiles behind it
// stay hidden.
function solid(context, pass, draw) {
  if (!pass) {
    draw()
    return
  }
  context.save()
  context.globalCompositeOperation = 'destination-out'
  draw()
  context.restore()
}

// An animated tile's drawing (book, a tileArt.js flipbook; offset, its tileArt.js animationOffset): nothing on the
// board, its sprite at the pass's frame on 'frames', and on 'cut' the sprite's emission, after cutting out the rest of
// it (it hides the lights of animated tiles behind it). draw(key) draws one image (a loaded href or a derived key).
function animated(context, pass, book, offset, draw) {
  if (!pass) return
  const sprite = book.sprites[pass.time === null ? book.frames[0] : frameAt(book, pass.time + offset)]
  if (pass.layer === 'frames') {
    draw(sprite.href)
    return
  }
  solid(context, pass, () => draw(sprite.href))
  if (sprite.emission) draw(sprite.emission)
}

// ---------------------------------------------------------------- images

const loaded = new Map()
const pending = new Map()
// Resolves once href has loaded (null if it failed: the tile is skipped, as a broken SVG image would be).
export function loadImage(href) {
  if (loaded.has(href)) return Promise.resolve(loaded.get(href))
  if (!pending.has(href)) {
    pending.set(
      href,
      new Promise((resolve) => {
        const image = new Image()
        image.onload = () => {
          loaded.set(href, image)
          resolve(image)
        }
        image.onerror = () => {
          loaded.set(href, null)
          resolve(null)
        }
        image.src = href
      }),
    )
  }
  return pending.get(href)
}
export const isLoaded = (href) => loaded.has(href)

// Mirrored images worked out from loaded ones, by key.
const derived = new Map()
const sizeOf = (source) => ({ width: source.naturalWidth || source.width, height: source.naturalHeight || source.height })

// A loaded image (null until it has loaded).
const sourceOf = (key) => loaded.get(key) ?? null

// The image flipped left to right (big objects on a rotated origin are cut from the mirrored picture).
function mirroredImage(key) {
  const mirrorKey = `mirror:${key}`
  if (derived.has(mirrorKey)) return derived.get(mirrorKey)
  const image = sourceOf(key)
  if (!image) return null
  const canvas = document.createElement('canvas')
  Object.assign(canvas, sizeOf(image))
  const context = canvas.getContext('2d')
  context.translate(canvas.width, 0)
  context.scale(-1, 1)
  context.drawImage(image, 0, 0)
  derived.set(mirrorKey, canvas)
  return canvas
}

// The part of a flipbook's images that changes between its sprites (or their emissions), as fractions of the image
// ({ u0, v0, u1, v1 }), or null when nothing does; undefined until its images have loaded. Most animations only
// blink a few lights, so a frame change need only repaint those. Compared at a quarter size, with a sample's margin.
const SAMPLE = 4
const changes = new WeakMap()
let sampleContext = null
function spriteChange(book) {
  if (changes.has(book)) return changes.get(book)
  const hrefs = book.sprites.flatMap((sprite) => [sprite.href, sprite.emission]).filter(Boolean)
  if (!hrefs.every(isLoaded)) return undefined
  const first = sourceOf(book.sprites[0].href)
  if (!first || hrefs.some((href) => !sourceOf(href))) {
    changes.set(book, { u0: 0, v0: 0, u1: 1, v1: 1 })
    return changes.get(book)
  }
  const { width, height } = sizeOf(first)
  const w = Math.ceil(width / SAMPLE)
  const h = Math.ceil(height / SAMPLE)
  sampleContext ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  Object.assign(sampleContext.canvas, { width: w, height: h })
  const read = (href) => {
    sampleContext.clearRect(0, 0, w, h)
    sampleContext.drawImage(sourceOf(href), 0, 0, w, h)
    return new Uint32Array(sampleContext.getImageData(0, 0, w, h).data.buffer)
  }
  let box = null
  for (const list of [book.sprites.map((sprite) => sprite.href), book.sprites.map((sprite) => sprite.emission)]) {
    if (!list[0]) continue
    const base = read(list[0])
    for (const href of new Set(list.slice(1))) {
      if (!href || href === list[0]) continue
      const pixels = read(href)
      for (let i = 0; i < pixels.length; i++) {
        if (pixels[i] === base[i]) continue
        const x = i % w
        const y = (i - x) / w
        box = box ? { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) } : { x0: x, y0: y, x1: x, y1: y }
      }
    }
  }
  const change = box && { u0: Math.max(0, box.x0 - 1) / w, v0: Math.max(0, box.y0 - 1) / h, u1: Math.min(w, box.x1 + 2) / w, v1: Math.min(h, box.y1 + 2) / h }
  changes.set(book, change)
  return change
}

function drawImage(context, key, ...box) {
  const image = sourceOf(key)
  if (!image) return
  context.drawImage(image, ...box)
}

// The flipbooks a block's drawing uses (tileArt.js), any of them null.
function blockFlipbooks(tile) {
  return [tileFlipbook(tile), tile.big ? bigFlipbook(tile) : null, ...Object.keys(tile.panelImages ?? {}).map((axis) => panelFlipbook(tile, axis))]
}

// Every image a map's drawing needs, worked out once per map.
const imageLists = new WeakMap()
export function imagesFor(map) {
  if (!imageLists.has(map)) imageLists.set(map, listImages(map))
  return imageLists.get(map)
}
function listImages(map) {
  const hrefs = new Set()
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      const position = { x, y }
      const tile = getTile(id)
      hrefs.add(tileImage(map, position))
      if (!isBlock(id)) return
      hrefs.add(tile.image)
      const joined = joinedImage(map, position)
      if (joined) hrefs.add(joined)
      const variant = tile.wall ? wallVariant(tile, position) : null
      if (variant) hrefs.add(variant.href)
      if (tile.big) hrefs.add(tile.big.image)
      Object.values(tile.panelImages ?? {}).forEach((href) => hrefs.add(href))
      for (const book of blockFlipbooks(tile)) {
        book?.sprites.forEach((sprite) => [sprite.href, sprite.emission].forEach((href) => href && hrefs.add(href)))
      }
    }),
  )
  return [...hrefs]
}

// ---------------------------------------------------------------- layout

// A rotated tile is drawn mirrored about its centre line, except a wall with panels (IsoTiles isMirrored).
const isMirrored = (map, position) => isRotated(map, position) && !getTile(map.tiles[position.y][position.x]).panels

// The world rectangle the whole board covers: floor images, and walls reaching TALL_WALL_EXTRA above the top row.
export function boardBounds(map) {
  const top = TILE_H / 2 - IMAGE_H - TALL_WALL_EXTRA
  return {
    x: -map.height * (TILE_W / 2),
    y: top,
    width: (map.width + map.height) * (TILE_W / 2),
    height: (map.width + map.height - 2) * (TILE_H / 2) + TILE_H / 2 - top,
  }
}

// The world rectangle one tile's drawing can cover (a block's tall faces reach up; a big object's strips spread out).
function tileArea(position, block) {
  const box = tileImageBox(position)
  if (!block) return box
  return { x: box.x - TILE_W, y: box.y - TALL_WALL_EXTRA - IMAGE_H, width: box.width + 2 * TILE_W, height: box.height + TALL_WALL_EXTRA + IMAGE_H }
}

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
function union(a, b) {
  if (!a) return b
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
}

// Everything the drawing reads from a map, worked out once per map.
export function boardLayout(map) {
  return { map, panels: getWallPanels(map), bigGroups: getBigObjects(map) }
}

// The far half of a two-tile panel, from its near half (half 1).
const panelFarHalf = (panel, position) => (panel.axis === 'x' ? { x: position.x - 1, y: position.y } : { x: position.x, y: position.y - 1 })
const panelNearHalf = (panel, position) => (panel.axis === 'x' ? { x: position.x + 1, y: position.y } : { x: position.x, y: position.y + 1 })

// What one tile of a block draws (drawBlockAt): its image box, or its strip of a big object's image, grown by a few
// pixels for stroke widths.
const BLOCK_MARGIN = 4
function drawnArea(layout, position) {
  const origin = layout.bigGroups.get(keyOf(position))
  const tile = getTile(layout.map.tiles[position.y][position.x])
  let box = tileImageBox(position, imageSize(tile))
  const strip = origin && BIG_STRIPS[`${position.x - origin.x},${position.y - origin.y}`]
  if (strip) {
    const centre = project({ x: origin.x + 0.5, y: origin.y + 0.5 })
    const { width, height } = BIG_IMAGE
    box = { x: centre.x - width / 2 + strip[0] * width, y: centre.y + TILE_H - height, width: (strip[1] - strip[0]) * width, height }
  }
  return { x: box.x - BLOCK_MARGIN, y: box.y - BLOCK_MARGIN, width: box.width + 2 * BLOCK_MARGIN, height: box.height + 2 * BLOCK_MARGIN }
}

// The world rectangle a block's drawing can cover; both halves of a panel share one, as a faded panel is drawn whole by
// one of them.
function blockArea(layout, position) {
  const panel = layout.panels.get(keyOf(position))
  if (!panel) return drawnArea(layout, position)
  const other = panel.half === 0 ? panelNearHalf(panel, position) : panelFarHalf(panel, position)
  return union(drawnArea(layout, position), drawnArea(layout, other))
}

// A layout's floors and blocks in drawing order, bucketed by where they are drawn so a repaint only visits those in its
// area: { floors, blocks }, each { entries, cells }. Block entries: { position, key, depth (painter's x + y), area }.
const INDEX_CELL = 256
const indexes = new WeakMap()
function gridIndex(entries) {
  const cells = new Map()
  entries.forEach((entry, i) => {
    const { x, y, width, height } = entry.area
    for (let cy = Math.floor(y / INDEX_CELL); cy <= Math.floor((y + height) / INDEX_CELL); cy++) {
      for (let cx = Math.floor(x / INDEX_CELL); cx <= Math.floor((x + width) / INDEX_CELL); cx++) {
        const key = `${cx},${cy}`
        if (!cells.has(key)) cells.set(key, [])
        cells.get(key).push(i)
      }
    }
  })
  return { entries, cells }
}
function queryIndex({ entries, cells }, area) {
  const found = new Set()
  for (let cy = Math.floor(area.y / INDEX_CELL); cy <= Math.floor((area.y + area.height) / INDEX_CELL); cy++) {
    for (let cx = Math.floor(area.x / INDEX_CELL); cx <= Math.floor((area.x + area.width) / INDEX_CELL); cx++) {
      for (const i of cells.get(`${cx},${cy}`) ?? []) found.add(i)
    }
  }
  return [...found].sort((a, b) => a - b).map((i) => entries[i]).filter((entry) => overlaps(entry.area, area))
}
function indexOf(layout) {
  if (indexes.has(layout)) return indexes.get(layout)
  const { map } = layout
  const floors = []
  const blocks = []
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      const position = { x, y }
      if (isBlock(id)) blocks.push({ position, key: keyOf(position), depth: x + y, area: blockArea(layout, position) })
      else floors.push({ position, area: tileImageBox(position) })
    }),
  )
  blocks.sort((a, b) => a.depth - b.depth)
  const index = { floors: gridIndex(floors), blocks: gridIndex(blocks) }
  indexes.set(layout, index)
  return index
}

// The blocks whose drawing can reach into a world rectangle, in painter's order.
export const blocksIn = (layout, area) => queryIndex(indexOf(layout).blocks, area)
// The world rectangle a block's drawing can cover ('x,y' key), as blocksIn tests it.
export const blockAreaOf = (layout, key) => {
  const [x, y] = key.split(',').map(Number)
  return blockArea(layout, { x, y })
}

// The world rectangle that changed between two layouts of the same-sized map (tiles, rotations, panel pairings and big
// objects), grown to cover what a change touches nearby (shadows, joins, light pools), or null when nothing did.
// Returns 'all' when so much changed that a full repaint is simpler.
export function changedArea(before, after) {
  const cells = []
  const { map } = after
  const describe = (layout, at, position) => {
    const panel = layout.panels.get(at)
    const origin = layout.bigGroups.get(at)
    return `${layout.map.tiles[position.y][position.x]}|${isRotated(layout.map, position)}|${panel ? `${panel.axis}${panel.half}${panel.window}` : ''}|${origin ? keyOf(origin) : ''}`
  }
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const position = { x, y }
      const at = keyOf(position)
      if (describe(before, at, position) !== describe(after, at, position)) cells.push(position)
    }
  }
  if (!cells.length) return null
  if (cells.length > 400) return 'all'
  const REACH = 2
  let area = null
  for (const { x, y } of cells) {
    const corner = tileArea({ x: x - REACH, y: y - REACH }, true)
    const far = tileArea({ x: x + REACH, y: y + REACH }, true)
    const left = tileArea({ x: x - REACH, y: y + REACH }, true)
    const right = tileArea({ x: x + REACH, y: y - REACH }, true)
    area = [corner, far, left, right].reduce(union, area)
  }
  return area
}

// A world rect grown out to whole pixels of a canvas covering `bounds` at `scale`, so a partial repaint leaves no seam
// at its edges.
export function snapToPixels(area, bounds, scale) {
  const x0 = Math.floor((area.x - bounds.x) * scale) / scale + bounds.x
  const y0 = Math.floor((area.y - bounds.y) * scale) / scale + bounds.y
  const x1 = Math.ceil((area.x + area.width - bounds.x) * scale) / scale + bounds.x
  const y1 = Math.ceil((area.y + area.height - bounds.y) * scale) / scale + bounds.y
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

// ---------------------------------------------------------------- shapes

function path(context, points) {
  context.beginPath()
  points.forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)))
  context.closePath()
}
function fillShape(context, points, fill, stroke = null, lineWidth = 1) {
  path(context, points)
  if (fill) {
    context.fillStyle = fill
    context.fill()
  }
  if (stroke) {
    context.strokeStyle = stroke
    context.lineWidth = lineWidth
    context.stroke()
  }
}
function strokeLine(context, a, b, stroke, lineWidth) {
  context.beginPath()
  context.moveTo(a[0], a[1])
  context.lineTo(b[0], b[1])
  context.strokeStyle = stroke
  context.lineWidth = lineWidth
  context.stroke()
}

// IsoTiles WallTile: the wall's image, its variant (if any) or its animation, or this tile's slot of its panel art
// (tileArt.js panelArt, cut out at the tile's own image size) or of its animation's sprites.
function drawWall(context, tile, position, panel, pass) {
  const art = panelArt(tile, panel, position)
  const variant = art || panel?.window ? null : wallVariant(tile, position)
  const size = imageSize(tile)
  const box = tileImageBox(position, size)
  const draw = (key) => {
    if (!art) return drawImage(context, key, box.x, box.y, box.width, box.height)
    const image = sourceOf(key)
    if (!image) return
    const natural = sizeOf(image)
    const sx = natural.width / art.size.width
    const sy = natural.height / art.size.height
    context.drawImage(image, art.offset.x * sx, art.offset.y * sy, size.width * sx, size.height * sy, box.x, box.y, size.width, size.height)
  }
  const book = art ? art.flipbook : variant ? null : tileFlipbook(tile)
  if (book) animated(context, pass, book, animationOffset(art?.timing ?? position), draw)
  else solid(context, pass, () => draw(art?.href ?? variant?.href ?? tile.image))
  // An animated wall's panel lines belong on its frames layer with it.
  if (panel) drawPanelFace(context, tile, position, panel, tile.height, book && pass?.layer === 'frames' ? null : pass)
}

// IsoTiles PanelFace: this tile's half of a two-tile panel. Points are (U along the panel 0..2, height above the floor).
function drawPanelFace(context, tile, position, panel, height, pass) {
  const c = project(position)
  const start = panel.axis === 'x' ? { x: c.x - TILE_W / 2, y: c.y } : { x: c.x + TILE_W / 2, y: c.y }
  const end = { x: c.x, y: c.y + TILE_H / 2 }
  const at = (U, v) => {
    const u = U - panel.half
    return [start.x + (end.x - start.x) * u, start.y + (end.y - start.y) * u - v]
  }
  const edgeU = panel.half === 0 ? 0 : 2
  solid(context, pass, () => strokeLine(context, at(edgeU, 0), at(edgeU, height), 'rgba(0, 0, 0, 0.5)', 1.5))
  if (!tile.panelFitting && !tile.panelImages && panel.window) drawWindowHalf(context, panel.half, height, at, pass)
}

// IsoTiles WindowHalf.
function drawWindowHalf(context, half, height, at, pass) {
  const lo = half
  const hi = half + 1
  const from = Math.max(WINDOW.from, lo)
  const to = Math.min(WINDOW.to, hi)
  const bottom = height * WINDOW.bottom
  const top = height * WINDOW.top
  const frameFrom = from === WINDOW.from ? from - FRAME.along : from
  const frameTo = to === WINDOW.to ? to + FRAME.along : to
  const quad = (u0, u1, v0, v1) => [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]
  const glow = bottom + (top - bottom) * 0.38
  const band = half === 0 ? [0.5, 0.66, 0.08] : [1.25, 1.31, 0.05]
  solid(context, pass, () => {
    fillShape(context, quad(frameFrom, frameTo, bottom - FRAME.height, top + FRAME.height), 'rgba(28, 34, 40, 0.92)', 'rgba(0, 0, 0, 0.55)', 0.8)
    strokeLine(context, at(frameFrom, top + FRAME.height), at(frameTo, top + FRAME.height), 'rgba(210, 225, 240, 0.35)', 0.8)
    fillShape(context, quad(from, to, bottom, top), 'rgb(8, 16, 30)')
    fillShape(context, quad(from, to, bottom, glow), 'rgba(90, 150, 220, 0.16)')
  })
  solid(context, pass, () => {
    fillShape(context, [at(band[0], top), at(band[1], top), at(band[1] - band[2] * 2, bottom), at(band[0] - band[2] * 2, bottom)], 'rgba(190, 225, 255, 0.13)')
    if (half === 1) strokeLine(context, at(1, bottom), at(1, top), 'rgba(28, 34, 40, 0.95)', 2.2)
    strokeLine(context, at(frameFrom, bottom - FRAME.height), at(frameTo, bottom - FRAME.height), 'rgba(225, 235, 245, 0.4)', 1.2)
  })
}

// IsoTiles BigObjectStrip: the left, middle or right strip of a 2x2 object's big image, drawn by the tile it stands on.
const BIG_STRIPS = { '0,1': [0, 0.25], '1,1': [0.25, 0.75], '1,0': [0.75, 1] }
function drawBigStrip(context, tile, position, origin, mirror, pass) {
  const strip = BIG_STRIPS[`${position.x - origin.x},${position.y - origin.y}`]
  if (!strip) return
  const [from, to] = strip
  const centre = project({ x: origin.x + 0.5, y: origin.y + 0.5 })
  const { width, height } = BIG_IMAGE
  const drawStrip = (key) => {
    const source = mirror ? mirroredImage(key) : sourceOf(key)
    if (!source) return
    const { width: w, height: h } = sizeOf(source)
    context.drawImage(source, from * w, 0, (to - from) * w, h, centre.x - width / 2 + from * width, centre.y + TILE_H - height, (to - from) * width, height)
  }
  const book = bigFlipbook(tile)
  if (book) animated(context, pass, book, animationOffset(origin), drawStrip)
  else solid(context, pass, () => drawStrip(tile.big.image))
}

// faded: a Set of 'x,y' keys drawn see-through (wallFade.js), or a Map of keys to their opacity while fading in or out
// (MapCanvas).
const fadeLevel = (faded, key) => (faded instanceof Map ? (faded.get(key) ?? 1) : faded.has(key) ? FADED_OPACITY : 1)

// IsoTiles WallBlock: a block, see-through when ghost (the editor's See-through blocks) or faded. A faded panel is drawn
// whole by its near half (the far half draws nothing), both halves solid and then faded together, as IsoTiles
// FadedPanel does, so the seam between them doesn't show. pass: null for the board, or the animation layer being drawn.
function drawBlock(context, layout, position, { ghost, pass, faded }) {
  const at = keyOf(position)
  const panel = layout.panels.get(at)
  const level = fadeLevel(faded, at)
  const opacity = (ghost ? GHOST_OPACITY : 1) * level
  if (level === 1 || !panel) {
    drawBlockAt(context, layout, position, opacity, pass)
    return
  }
  if (panel.half === 0) return
  const halves = [panelFarHalf(panel, position), position]
  if (pass) halves.forEach((half) => drawBlockAt(context, layout, half, opacity, pass))
  else drawTogether(context, halves.map((half) => tileArea(half, true)).reduce(union, null), opacity, (scratch) => halves.forEach((half) => drawBlockAt(scratch, layout, half, 1, null)))
}

// Draws into a scratch canvas at the context's scale, then onto the context at `opacity`: what draw draws, seen as one.
// area: the world rectangle it covers.
let fadeScratch = null
function drawTogether(context, area, opacity, draw) {
  const transform = context.getTransform()
  const scale = Math.hypot(transform.a, transform.b)
  const width = Math.max(1, Math.ceil(area.width * scale))
  const height = Math.max(1, Math.ceil(area.height * scale))
  fadeScratch ??= document.createElement('canvas')
  if (fadeScratch.width < width) fadeScratch.width = width
  if (fadeScratch.height < height) fadeScratch.height = height
  const scratch = fadeScratch.getContext('2d')
  scratch.setTransform(1, 0, 0, 1, 0, 0)
  scratch.clearRect(0, 0, width, height)
  scratch.setTransform(scale, 0, 0, scale, -area.x * scale, -area.y * scale)
  draw(scratch)
  context.save()
  context.globalAlpha *= opacity
  context.drawImage(fadeScratch, 0, 0, width, height, area.x, area.y, width / scale, height / scale)
  context.restore()
}

function drawBlockAt(context, layout, position, opacity, pass) {
  const { map, panels, bigGroups } = layout
  const tile = getTile(map.tiles[position.y][position.x])
  const at = keyOf(position)
  context.save()
  context.globalAlpha *= opacity
  const origin = bigGroups.get(at)
  if (origin) {
    drawBigStrip(context, tile, position, origin, isRotated(map, origin), pass)
    context.restore()
    return
  }
  const panel = panels.get(at) ?? null
  const joined = joinedImage(map, position)
  const href = joined ?? tileImage(map, position)
  if (!joined && isMirrored(map, position)) {
    context.translate(2 * project(position).x, 0)
    context.scale(-1, 1)
  }
  const box = tileImageBox(position, imageSize(tile))
  const boxArgs = [box.x, box.y, box.width, box.height]
  const book = tile.wall || joined ? null : tileFlipbook(tile)
  if (tile.wall) drawWall(context, tile, position, panel, pass)
  else if (book) animated(context, pass, book, animationOffset(position), (key) => drawImage(context, key, ...boxArgs))
  else solid(context, pass, () => drawImage(context, href, ...boxArgs))
  context.restore()
}

// IsoTiles FloorLighting: soft contact shadows along floor edges that meet a block, then light pools round glowing tiles.
function hexToRgba(colour, alpha) {
  const hex = colour.replace('#', '')
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
  const n = parseInt(full, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
// A map's shadow strips ({ band, quad, box }) and light pools, worked out once per map.
const lightingCache = new WeakMap()
function lightingOf(map) {
  if (lightingCache.has(map)) return lightingCache.get(map)
  const blockAt = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && isBlock(map.tiles[y][x])
  const strips = []
  const glows = []
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      const position = { x, y }
      const colour = tileGlow(id)
      if (colour) glows.push({ position, colour, size: 1.5 })
      const fitting = wallGlow(map, position)
      if (fitting) glows.push({ position: fitting.centre, colour: fitting.colour, size: WALL_GLOW_SIZE })
      if (isBlock(id)) return
      for (const side of SIDES) {
        if (!blockAt(x + side.dx, y + side.dy)) continue
        SHADE_BANDS.forEach(([from, to], band) => strips.push({ band, quad: edgeStrip(position, side, from, to), box: tileImageBox(position) }))
      }
    }),
  )
  const lighting = { strips, glows }
  lightingCache.set(map, lighting)
  return lighting
}

function drawLighting(context, map, area) {
  const { strips, glows } = lightingOf(map)
  const bands = SHADE_BANDS.map(() => [])
  for (const strip of strips) if (overlaps(strip.box, area)) bands[strip.band].push(strip.quad)
  bands.forEach((quads, i) => {
    if (!quads.length) return
    context.beginPath()
    for (const quad of quads) {
      quad.forEach((point, j) => (j ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)))
      context.closePath()
    }
    context.fillStyle = `rgba(0, 0, 0, ${SHADE_BANDS[i][2]})`
    context.fill()
  })
  if (!glows.length) return
  // Light pools stop at the map's outline instead of spilling into the empty space round it.
  context.save()
  const corner = (x, y) => project({ x, y })
  const outline = [corner(-0.5, -0.5), corner(map.width - 0.5, -0.5), corner(map.width - 0.5, map.height - 0.5), corner(-0.5, map.height - 0.5)]
  path(context, outline.map((point) => [point.x, point.y]))
  context.clip()
  for (const { position, colour, size } of glows) {
    const rx = TILE_W * size
    const ry = TILE_H * size
    const c = project(position)
    if (!overlaps({ x: c.x - rx, y: c.y - ry, width: rx * 2, height: ry * 2 }, area)) continue
    context.save()
    context.translate(c.x, c.y)
    context.scale(1, ry / rx)
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, rx)
    gradient.addColorStop(0, hexToRgba(colour, 0.55 * GLOW_OPACITY))
    gradient.addColorStop(0.45, hexToRgba(colour, 0.2 * GLOW_OPACITY))
    gradient.addColorStop(1, hexToRgba(colour, 0))
    context.fillStyle = gradient
    context.beginPath()
    context.arc(0, 0, rx, 0, Math.PI * 2)
    context.fill()
    context.restore()
  }
  context.restore()
}

// ---------------------------------------------------------------- the board

// Repaints `area` (a world rect, or the whole board) of a canvas whose world-to-pixel transform is `transform`.
// options: { ghost (See-through blocks), lighting (shadows and light pools), pass (null: the board, without animated
// tiles; or { layer (one of ANIMATION_LAYERS, or 'cut'), time }: only the animated tiles at that time, with the blocks
// in front cut out of it), faded (blocks drawn see-through, as drawBlock takes it), holes ([{ area, depth }]: inside
// each area the blocks deeper than depth (painter's x + y) are left out, as the play views draw them over their
// figures there), part ('floor': the floor and its lighting only; 'blocks': the blocks only; null: both) }.
export function drawBoard(context, transform, layout, area, { ghost = false, lighting = true, pass = null, faded = NONE, holes = [], part = null } = {}) {
  const { map } = layout
  const index = indexOf(layout)
  context.save()
  context.setTransform(...transform)
  context.beginPath()
  context.rect(area.x, area.y, area.width, area.height)
  context.clip()
  context.clearRect(area.x, area.y, area.width, area.height)

  if (!pass && part !== 'blocks') {
    for (const { position, area: box } of queryIndex(index.floors, area)) {
      const href = tileImage(map, position)
      if (!isMirrored(map, position)) {
        drawImage(context, href, box.x, box.y, box.width, box.height)
        continue
      }
      context.save()
      context.translate(2 * project(position).x, 0)
      context.scale(-1, 1)
      drawImage(context, href, box.x, box.y, box.width, box.height)
      context.restore()
    }
    if (lighting) drawLighting(context, map, area)
  }
  if (part === 'floor') {
    context.restore()
    return
  }
  // On an animation layer a block only cuts out what is already drawn, so the blocks behind the first animated one
  // would only erase the cleared area: skipping them saves most of a tick's drawing.
  const animatedKeys = pass ? animatedKeysOf(layout) : null
  let started = !pass
  for (const entry of queryIndex(index.blocks, area)) {
    if (!started) {
      if (!animatedKeys.has(entry.key)) continue
      started = true
    }
    const cut = holes.filter((hole) => entry.depth > hole.depth && overlaps(entry.area, hole.area))
    if (cut.length) {
      context.save()
      context.beginPath()
      context.rect(area.x, area.y, area.width, area.height)
      for (const hole of cut) context.rect(hole.area.x, hole.area.y, hole.area.width, hole.area.height)
      context.clip('evenodd')
    }
    drawBlock(context, layout, entry.position, { ghost, pass, faded })
    if (cut.length) context.restore()
  }
  context.restore()
}

// The play views' darkness over a dim map (tileArt.js darknessOpacity), repainted in `area` of a canvas whose
// world-to-pixel transform is `transform`: soft holes round the lights (tileArt.js darknessLights), and cut out
// wherever an animated tile's lit parts show at `time` (seconds, or null for every loop's first frame), so lights stay
// at full brightness however dark the map is. faded: as drawBoard, so a light shows through a see-through block.
let cutScratch = null
export function drawDarkness(context, transform, layout, area, { faded = NONE, time = null } = {}) {
  const { map } = layout
  context.save()
  context.setTransform(...transform)
  context.beginPath()
  context.rect(area.x, area.y, area.width, area.height)
  context.clip()
  context.clearRect(area.x, area.y, area.width, area.height)
  context.globalAlpha = darknessOpacity(map)
  context.fillStyle = DARKNESS_COLOUR
  context.fillRect(area.x, area.y, area.width, area.height)
  context.globalAlpha = 1
  context.globalCompositeOperation = 'destination-out'
  for (const { position, radius, lift } of darknessLights(map)) {
    const c = project(position)
    const rx = TILE_W * radius
    const ry = TILE_H * radius
    if (!overlaps({ x: c.x - rx, y: c.y - lift - ry, width: rx * 2, height: ry * 2 }, area)) continue
    context.save()
    context.translate(c.x, c.y - lift)
    context.scale(1, ry / rx)
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, rx)
    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)')
    gradient.addColorStop(0.45, 'rgba(0, 0, 0, 0.75)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = gradient
    context.beginPath()
    context.arc(0, 0, rx, 0, Math.PI * 2)
    context.fill()
    context.restore()
  }
  if (emissiveTiles(layout).some((item) => overlaps(item.area, area))) {
    const scale = transform[0]
    const width = Math.max(1, Math.ceil(area.width * scale))
    const height = Math.max(1, Math.ceil(area.height * scale))
    cutScratch ??= document.createElement('canvas')
    if (cutScratch.width < width) cutScratch.width = width
    if (cutScratch.height < height) cutScratch.height = height
    const scratch = cutScratch.getContext('2d')
    scratch.setTransform(1, 0, 0, 1, 0, 0)
    scratch.clearRect(0, 0, cutScratch.width, cutScratch.height)
    drawBoard(scratch, [scale, 0, 0, scale, -area.x * scale, -area.y * scale], layout, area, { pass: { layer: 'cut', time }, faded })
    context.drawImage(cutScratch, 0, 0, width, height, area.x, area.y, width / scale, height / scale)
  }
  context.restore()
}

// The animated tiles with lit parts (sprites with an emission), which cut the play views' darkness.
const emissiveCache = new WeakMap()
export function emissiveTiles(layout) {
  if (!emissiveCache.has(layout)) emissiveCache.set(layout, animatedTiles(layout).filter((item) => item.book.sprites.some((sprite) => sprite.emission)))
  return emissiveCache.get(layout)
}

const animatedKeysCache = new WeakMap()
function animatedKeysOf(layout) {
  if (!animatedKeysCache.has(layout)) animatedKeysCache.set(layout, new Set(animatedTiles(layout).map((item) => item.key)))
  return animatedKeysCache.get(layout)
}

// The blocks of a layout that animate, as drawBlock draws them: [{ key ('x,y'), area (the world rect its drawing can
// cover), book, offset }], so the animation layers can be redrawn where a tile's frame changes.
export function animatedTiles(layout) {
  const { map, panels, bigGroups } = layout
  const list = []
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      if (!isBlock(id)) return
      const position = { x, y }
      const tile = getTile(id)
      const key = keyOf(position)
      const origin = bigGroups.get(key)
      let book = null
      let timing = position
      if (origin) {
        book = BIG_STRIPS[`${x - origin.x},${y - origin.y}`] ? bigFlipbook(tile) : null
        timing = origin
      } else if (tile.wall) {
        const panel = panels.get(key) ?? null
        const art = panelArt(tile, panel, position)
        const variant = art || panel?.window ? null : wallVariant(tile, position)
        book = art ? art.flipbook : variant ? null : tileFlipbook(tile)
        timing = art?.timing ?? position
      } else if (!joinedImage(map, position)) book = tileFlipbook(tile)
      if (book) list.push({ key, position, area: tileArea(position, true), book, offset: animationOffset(timing) })
    }),
  )
  return list
}

// The draws a drawing makes ([{ image, args, transform }]), recorded instead of drawn.
let recorder = null
function recordDraws(draw) {
  recorder ??= document.createElement('canvas').getContext('2d')
  const calls = []
  recorder.drawImage = (image, ...args) => calls.push({ image, args, transform: recorder.getTransform() })
  recorder.setTransform(1, 0, 0, 1, 0, 0)
  try {
    draw(recorder)
  } finally {
    delete recorder.drawImage
  }
  return calls
}

// The world rectangle where an animated tile (an animatedTiles item) changes between frames: its sprites' changing part
// (spriteChange) where its drawing puts it. Null when its frames all look the same; its whole area until its images
// have loaded.
const changedAreas = new WeakMap()
export function animatedArea(layout, item) {
  if (!changedAreas.has(layout)) changedAreas.set(layout, new Map())
  const cache = changedAreas.get(layout)
  if (cache.has(item.key)) return cache.get(item.key)
  const change = spriteChange(item.book)
  if (change === undefined) return item.area
  let area = null
  if (change) {
    const calls = recordDraws((context) => drawBlockAt(context, layout, item.position, 1, { layer: 'frames', time: null }))
    for (const { image, args, transform } of calls) {
      const sprite = item.book.sprites.find((s) => sourceOf(s.href) === image || derived.get(`mirror:${s.href}`) === image)
      if (!sprite) continue
      const mirrored = image !== sourceOf(sprite.href)
      const { width: w, height: h } = sizeOf(image)
      const [sx, sy, sw, sh, dx, dy, dw, dh] = args.length >= 8 ? args : [0, 0, w, h, ...args]
      const x0 = Math.max(sx, (mirrored ? 1 - change.u1 : change.u0) * w)
      const x1 = Math.min(sx + sw, (mirrored ? 1 - change.u0 : change.u1) * w)
      const y0 = Math.max(sy, change.v0 * h)
      const y1 = Math.min(sy + sh, change.v1 * h)
      if (x1 <= x0 || y1 <= y0) continue
      const corners = [
        [x0, y0],
        [x1, y0],
        [x0, y1],
        [x1, y1],
      ].map(([px, py]) => transform.transformPoint({ x: dx + ((px - sx) * dw) / sw, y: dy + ((py - sy) * dh) / sh }))
      const xs = corners.map((point) => point.x)
      const ys = corners.map((point) => point.y)
      const rect = { x: Math.min(...xs) - 1, y: Math.min(...ys) - 1, width: Math.max(...xs) - Math.min(...xs) + 2, height: Math.max(...ys) - Math.min(...ys) + 2 }
      area = union(area, rect)
    }
  }
  cache.set(item.key, area)
  return area
}
