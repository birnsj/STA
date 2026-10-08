// The map editor's board drawn into one canvas: floor tiles, contact shadows and light pools, then every block in
// painter's order (x + y), drawn as IsoTiles.jsx draws them (walls with their panel faces, windows and fittings, tall
// objects, 2x2 big objects, joined railings), every image at its own size. A canvas is one element for the browser to
// draw however big the map, and a brush stroke only repaints the area it changed. Animated tiles (tileArt.js
// flipbooks) go on animation layers instead (ANIMATION_LAYERS), which EditorCanvas stacks over the board and redraws
// where a tile's frame changes; light pools are drawn steady. Presentation only.
import { BIG_IMAGE, getBigObjects } from '../../maps/bigObjects.js'
import { isBlock, project, TILE_H, TILE_W, tileImage, tileImageBox } from '../../maps/iso.js'
import { getTile, imageSize, isRotated, TILE_IMAGE } from '../../maps/mapFormat.js'
import { joinedImage } from '../../maps/railJoins.js'
import { animationOffset, bigFlipbook, frameAt, panelArt, panelFlipbook, tileFlipbook, tileGlow, WALL_GLOW_SIZE, wallGlow, wallVariant } from '../../maps/tileArt.js'
import { getWallPanels } from '../../maps/wallPanels.js'
import { TALL_WALL_EXTRA } from '../../maps/wallFade.js'
import { edgeStrip, FRAME, SHADE_BANDS, SIDES, WINDOW } from './tileShapes.js'

const IMAGE_H = TILE_IMAGE.height
const GHOST_OPACITY = 0.35
// A steady stand-in for the glow pools' CSS animation (maps.css tilemap-glow): roughly its average brightness.
const GLOW_OPACITY = 0.8

const keyOf = ({ x, y }) => `${x},${y}`

// ---------------------------------------------------------------- animation layers

// The layers over the board, bottom up: 'frames' (each animated tile's sprite at its current frame) under the map's
// darkness, and 'lit' (just the lit parts of those sprites, their emission) over it, so lights stay at full brightness
// however dark the map is.
export const ANIMATION_LAYERS = ['frames', 'lit']

// A pass is null (the board: everything but animated tiles) or { layer, time } (an animation layer at `time` seconds,
// or null for every loop's first frame).

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
// board, its sprite at the pass's frame on 'frames', and on 'lit' the sprite's lit parts, after cutting out the rest of
// it (it hides the lights of animated tiles behind it). draw(key) draws one image (a loaded href or a derived key).
function animated(context, pass, book, offset, draw) {
  if (!pass) return
  const sprite = book.sprites[pass.time === null ? book.frames[0] : frameAt(book, pass.time + offset)]
  if (pass.layer === 'frames') {
    draw(sprite.href)
    return
  }
  solid(context, pass, () => draw(sprite.href))
  if (sprite.emission) draw(litKey(sprite))
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

// Images worked out from loaded ones, by key: a sprite's lit parts (litKey) and mirrored images.
const derived = new Map()
const sizeOf = (source) => ({ width: source.naturalWidth || source.width, height: source.naturalHeight || source.height })

// The key of a sprite's lit parts: the sprite where its emission shows, as strong as the emission.
const litKey = (sprite) => `lit:${sprite.href}|${sprite.emission}`
function litImage(key) {
  const [href, emission] = key.slice(4).split('|')
  const image = loaded.get(href)
  const mask = loaded.get(emission)
  if (!image || !mask) return null
  const canvas = document.createElement('canvas')
  Object.assign(canvas, sizeOf(image))
  const context = canvas.getContext('2d')
  context.drawImage(mask, 0, 0, canvas.width, canvas.height)
  context.globalCompositeOperation = 'source-in'
  context.drawImage(image, 0, 0)
  return canvas
}

// What a key draws: a loaded image, or one worked out from loaded images (null until they have loaded).
function sourceOf(key) {
  if (loaded.has(key)) return loaded.get(key)
  if (!key.startsWith('lit:')) return null
  if (!derived.has(key)) {
    const image = litImage(key)
    if (!image) return null
    derived.set(key, image)
  }
  return derived.get(key)
}

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

function drawImage(context, key, ...box) {
  const image = sourceOf(key)
  if (!image) return
  context.drawImage(image, ...box)
}

// The flipbooks a block's drawing uses (tileArt.js), any of them null.
function blockFlipbooks(tile) {
  return [tileFlipbook(tile), tile.big ? bigFlipbook(tile) : null, ...Object.keys(tile.panelImages ?? {}).map((axis) => panelFlipbook(tile, axis))]
}

// Every image a map's drawing needs.
export function imagesFor(map) {
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

// IsoTiles WallBlock / BlockTile, as the editor draws a block (never faded; ghost: See-through blocks). pass: null
// for the board, or the animation layer being drawn.
function drawBlock(context, layout, position, ghost, pass) {
  const { map, panels, bigGroups } = layout
  const tile = getTile(map.tiles[position.y][position.x])
  const at = keyOf(position)
  context.save()
  if (ghost) context.globalAlpha = GHOST_OPACITY
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
function drawLighting(context, map, area) {
  const blockAt = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height && isBlock(map.tiles[y][x])
  const bands = SHADE_BANDS.map(() => [])
  const glows = []
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      const position = { x, y }
      const colour = tileGlow(id)
      if (colour) glows.push({ position, colour, size: 1.5 })
      const fitting = wallGlow(map, position)
      if (fitting) glows.push({ position: fitting.centre, colour: fitting.colour, size: WALL_GLOW_SIZE })
      if (isBlock(id) || !overlaps(tileImageBox(position), area)) return
      for (const side of SIDES) {
        if (!blockAt(x + side.dx, y + side.dy)) continue
        SHADE_BANDS.forEach(([from, to], i) => bands[i].push(edgeStrip(position, side, from, to)))
      }
    }),
  )
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
// tiles; or { layer (one of ANIMATION_LAYERS), time }: only the animated tiles at that time, with the blocks in front
// cut out of it) }.
export function drawBoard(context, transform, layout, area, { ghost = false, lighting = true, pass = null } = {}) {
  const { map } = layout
  context.save()
  context.setTransform(...transform)
  context.beginPath()
  context.rect(area.x, area.y, area.width, area.height)
  context.clip()
  context.clearRect(area.x, area.y, area.width, area.height)

  const blocks = []
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      const position = { x, y }
      if (isBlock(id)) {
        if (overlaps(tileArea(position, true), area)) blocks.push(position)
        return
      }
      if (pass) return
      const box = tileImageBox(position)
      if (!overlaps(box, area)) return
      const href = tileImage(map, position)
      if (!isMirrored(map, position)) {
        drawImage(context, href, box.x, box.y, box.width, box.height)
        return
      }
      context.save()
      context.translate(2 * project(position).x, 0)
      context.scale(-1, 1)
      drawImage(context, href, box.x, box.y, box.width, box.height)
      context.restore()
    }),
  )
  if (!pass && lighting) drawLighting(context, map, area)
  blocks.sort((a, b) => a.x + a.y - (b.x + b.y))
  for (const position of blocks) drawBlock(context, layout, position, ghost, pass)
  context.restore()
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
      if (book) list.push({ key, area: tileArea(position, true), book, offset: animationOffset(timing) })
    }),
  )
  return list
}
