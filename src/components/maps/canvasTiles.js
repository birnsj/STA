// The map editor's board drawn into one canvas: floor tiles, contact shadows and light pools, then every block in
// painter's order (x + y), drawn as IsoTiles.jsx draws them in the tall-wall views (tall walls with their panel faces,
// windows and fittings, tall objects, 2x2 big objects, joined railings). A canvas is one element for the browser to
// draw however big the map, and a brush stroke only repaints the area it changed. The animated parts (light overlays,
// blinking fittings, window stars) go on light layers instead (LIGHT_LAYERS: one per animation and timing group), which
// EditorCanvas stacks over the board and animates with CSS; light pools are drawn steady. Presentation only.
import { BIG_SCALE, getBigObjects } from '../../maps/bigObjects.js'
import { isBlock, project, TILE_H, TILE_W, tileImage, tileImageBox } from '../../maps/iso.js'
import { getTile, isRotated, TILE_IMAGE } from '../../maps/mapFormat.js'
import { joinedImage } from '../../maps/railJoins.js'
import { PANEL_IMAGE, panelArt, tileAnimations, tileGlow, wallVariant } from '../../maps/tileArt.js'
import { getWallPanels } from '../../maps/wallPanels.js'
import { drawnHeight, TALL_WALL_EXTRA } from '../../maps/wallFade.js'
import { edgeStrip, FRAME, SHADE_BANDS, SIDES, WINDOW } from './tileShapes.js'

const { width: IMAGE_W, height: IMAGE_H } = TILE_IMAGE
const GHOST_OPACITY = 0.35
// A steady stand-in for the glow pools' CSS animation (maps.css tilemap-glow): roughly its average brightness.
const GLOW_OPACITY = 0.8
// A light whose style has no animation is drawn steady on the board at this brightness.
const STEADY_LIGHT_OPACITY = 0.7

const keyOf = ({ x, y }) => `${x},${y}`

// ---------------------------------------------------------------- light layers

// The game gives each tile its own animation delay (tileArt.js animationDelay, IsoTiles stars); the editor sorts tiles
// into this many timing groups instead, a layer each, so that not every light blinks together.
export const LIGHT_PHASES = 3
const LIGHT_STYLES = ['pulse', 'blink', 'flicker']
// spread: the seconds the game's delays are spread over (lights 3s, stars 4s).
export const LIGHT_LAYERS = [...LIGHT_STYLES.map((style) => ({ style, spread: 3 })), { style: 'twinkle', spread: 4 }].flatMap(({ style, spread }) =>
  Array.from({ length: LIGHT_PHASES }, (_, phase) => ({ id: `${style}-${phase}`, style, phase, delay: -((phase + 0.5) / LIGHT_PHASES) * spread })),
)
const phaseOf = (fraction) => Math.min(LIGHT_PHASES - 1, Math.floor(fraction * LIGHT_PHASES))
const lightPhase = ({ x, y }) => phaseOf(((x * 7 + y * 13) % 17) / 17)
const starSeed = (position, i) => position.x * 73 + position.y * 151 + i * 37
const starPhase = (seed) => phaseOf((seed % 7) / 7)

// Whether an animated part (style, phase) belongs to this pass: a light layer ({ style, phase }) takes its own; the
// board (pass null) takes none of them, only lights whose style has no animation.
function inPass(pass, style, phase) {
  if (!pass) return !LIGHT_STYLES.includes(style)
  return pass.style === style && pass.phase === phase
}

// A tile's own drawing: on the board, as it is; on a light layer, cut out of the layer so that the lights of tiles
// behind it stay hidden, as they are in the game.
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

const mirrored = new Map()
// The image flipped left to right (big objects on a rotated origin are cut from the mirrored picture).
function mirroredImage(href) {
  if (mirrored.has(href)) return mirrored.get(href)
  const image = loaded.get(href)
  if (!image) return null
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  context.translate(canvas.width, 0)
  context.scale(-1, 1)
  context.drawImage(image, 0, 0)
  mirrored.set(href, canvas)
  return canvas
}

function drawImage(context, href, ...box) {
  const image = loaded.get(href)
  if (!image) return
  context.drawImage(image, ...box)
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
      if (variant) [variant.href, ...variant.lights.map((light) => light.href)].forEach((href) => hrefs.add(href))
      tileAnimations(tile).forEach((light) => hrefs.add(light.href))
      if (tile.activeImage) hrefs.add(tile.activeImage)
      Object.values(tile.panelImages ?? {}).forEach((href) => hrefs.add(href))
      ;(tile.panelLights ?? []).forEach((light) => [light.x, light.y].forEach((href) => hrefs.add(href)))
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

// Light-only overlay images screened over a tile, those of this pass only (inPass). draw(href) draws one image.
function drawLights(context, lights, draw, pass, phase) {
  for (const light of lights) {
    if (!inPass(pass, light.style, phase)) continue
    context.save()
    context.globalCompositeOperation = 'screen'
    if (!pass) context.globalAlpha *= STEADY_LIGHT_OPACITY
    draw(light.href)
    context.restore()
  }
}

// IsoTiles TallWall: each side face stretched upward from its own bottom edge, the top face lifted unchanged; the wall
// variant (if any) or this tile's slot of its panel art (tileArt.js panelArt) replaces the image; lights go through the
// same faces.
function drawTallWall(context, tile, position, panel, pass) {
  const art = panelArt(tile, panel, position)
  const variant = (art || panel?.window) ? null : wallVariant(tile, position)
  const box = tileImageBox(position)
  const h = tile.height
  const extra = drawnHeight(tile, true) - h
  const k = (h + extra) / h
  const slope = TILE_H / TILE_W
  const corners = IMAGE_H - TILE_H / 2
  const front = IMAGE_H
  const middle = IMAGE_W / 2
  const stretch = (c, m) => [1, (1 - k) * m, 0, k, 0, (1 - k) * c]
  const faces = [
    { clip: [[0, corners - h - 1], [middle + 1, front - h - 1], [middle + 1, front], [0, corners]], transform: stretch(corners, slope) },
    { clip: [[middle, front - h - 1], [IMAGE_W, corners - h - 1], [IMAGE_W, corners], [middle, front]], transform: stretch(front + middle * slope, -slope) },
    { clip: [[0, 0], [IMAGE_W, 0], [IMAGE_W, corners - h], [middle, front - h], [0, corners - h]], transform: [1, 0, 0, 1, 0, -extra] },
  ]
  const throughFaces = (href) => {
    for (const face of faces) {
      context.save()
      context.translate(box.x, box.y)
      context.transform(...face.transform)
      path(context, face.clip)
      context.clip()
      if (art) drawImage(context, href, -art.offset.x, -art.offset.y, PANEL_IMAGE.width, PANEL_IMAGE.height)
      else drawImage(context, href, 0, 0, IMAGE_W, IMAGE_H)
      context.restore()
    }
  }
  solid(context, pass, () => throughFaces(art?.href ?? variant?.href ?? tile.image))
  drawLights(context, art?.lights ?? variant?.lights ?? tileAnimations(tile), throughFaces, pass, lightPhase(art?.timing ?? position))
  if (panel) drawPanelFace(context, tile, position, panel, h + extra, pass)
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
  if (!tile.panelFitting && panel.window) drawWindowHalf(context, tile, position, panel.half, height, at, pass)
}

// IsoTiles WindowHalf; a wall with panel art (tiles.json panelImages) only gets the stars.
function drawWindowHalf(context, tile, position, half, height, at, pass) {
  const painted = Boolean(tile.panelImages)
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
  if (!painted) solid(context, pass, () => {
    fillShape(context, quad(frameFrom, frameTo, bottom - FRAME.height, top + FRAME.height), 'rgba(28, 34, 40, 0.92)', 'rgba(0, 0, 0, 0.55)', 0.8)
    strokeLine(context, at(frameFrom, top + FRAME.height), at(frameTo, top + FRAME.height), 'rgba(210, 225, 240, 0.35)', 0.8)
    fillShape(context, quad(from, to, bottom, top), 'rgb(8, 16, 30)')
    fillShape(context, quad(from, to, bottom, glow), 'rgba(90, 150, 220, 0.16)')
  })
  // The stars twinkle (maps.css wall-star), so they only go on the twinkle layers.
  if (pass?.style === 'twinkle' && tile.windowView === 'space') {
    context.save()
    context.globalCompositeOperation = 'screen'
    context.fillStyle = 'rgba(235, 242, 255, 0.9)'
    for (let i = 0; i < 5; i++) {
      const seed = starSeed(position, i)
      if (starPhase(seed) !== pass.phase) continue
      const u = from + 0.05 + (((seed * 13) % 89) / 89) * (to - from - 0.1)
      const v = bottom + 3 + (((seed * 29) % 97) / 97) * (top - bottom - 6)
      const [x, y] = at(u, v)
      context.beginPath()
      context.arc(x, y, i % 3 === 0 ? 0.9 : 0.55, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }
  if (painted) return
  solid(context, pass, () => {
    fillShape(context, [at(band[0], top), at(band[1], top), at(band[1] - band[2] * 2, bottom), at(band[0] - band[2] * 2, bottom)], 'rgba(190, 225, 255, 0.13)')
    if (half === 1) strokeLine(context, at(1, bottom), at(1, top), 'rgba(28, 34, 40, 0.95)', 2.2)
    strokeLine(context, at(frameFrom, bottom - FRAME.height), at(frameTo, bottom - FRAME.height), 'rgba(225, 235, 245, 0.4)', 1.2)
  })
}

// IsoTiles TallBlock: the image in three bands, only the middle (straight sides) stretched.
function drawTallBlock(context, tile, position) {
  const box = tileImageBox(position)
  const extra = drawnHeight(tile, true) - tile.height
  const faceTop = IMAGE_H - tile.height
  const sidesEnd = IMAGE_H - TILE_H / 2
  const image = loaded.get(tile.image)
  if (!image) return
  const sy = image.naturalHeight / IMAGE_H
  const band = (from, height, y, drawn) => context.drawImage(image, 0, from * sy, image.naturalWidth, height * sy, box.x, y, IMAGE_W, drawn)
  band(0, faceTop, box.y - extra, faceTop)
  band(faceTop, sidesEnd - faceTop, box.y + faceTop - extra, sidesEnd - faceTop + extra)
  band(sidesEnd, TILE_H / 2, box.y + sidesEnd, TILE_H / 2)
}

// IsoTiles BigObjectStrip: the left, middle or right strip of a 2x2 object's doubled image, drawn by the tile it stands on.
const BIG_STRIPS = { '0,1': [0, 0.25], '1,1': [0.25, 0.75], '1,0': [0.75, 1] }
function drawBigStrip(context, tile, position, origin, mirror, pass) {
  const strip = BIG_STRIPS[`${position.x - origin.x},${position.y - origin.y}`]
  if (!strip) return
  const [from, to] = strip
  const centre = project({ x: origin.x + 0.5, y: origin.y + 0.5 })
  const width = IMAGE_W * BIG_SCALE
  const height = IMAGE_H * BIG_SCALE
  const drawStrip = (href) => {
    const source = mirror ? mirroredImage(href) : loaded.get(href)
    if (!source) return
    const w = source.naturalWidth ?? source.width
    const h = source.naturalHeight ?? source.height
    context.drawImage(source, from * w, 0, (to - from) * w, h, centre.x - width / 2 + from * width, centre.y + TILE_H - height, (to - from) * width, height)
  }
  solid(context, pass, () => drawStrip(tile.image))
  drawLights(context, tileAnimations(tile), drawStrip, pass, lightPhase(origin))
}

// IsoTiles WallBlock / BlockTile, as the editor draws a block (tall, never faded; ghost: See-through blocks). pass: null
// for the board, or the light layer being drawn (LIGHT_LAYERS).
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
  const box = tileImageBox(position)
  const boxArgs = [box.x, box.y, box.width, box.height]
  if (tile.wall) drawTallWall(context, tile, position, panel, pass)
  else if (tile.tall) solid(context, pass, () => drawTallBlock(context, tile, position))
  else solid(context, pass, () => drawImage(context, href, ...boxArgs))
  // A lowered wall (heightVariants) is plain bulkhead, so its fitting's lights would float above it.
  if (!tile.wall && !Object.values(tile.heightVariants ?? {}).includes(href)) {
    drawLights(context, tileAnimations(tile), (light) => drawImage(context, light, ...boxArgs), pass, lightPhase(position))
  }
  if (tile.role === 'hazardControl' && tile.activeImage) solid(context, pass, () => drawImage(context, tile.activeImage, ...boxArgs))
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
      if (colour) glows.push({ position, colour })
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
  const rx = TILE_W * 1.5
  const ry = TILE_H * 1.5
  for (const { position, colour } of glows) {
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
// options: { ghost (See-through blocks), lighting (shadows and light pools), pass (null: the board; or one of
// LIGHT_LAYERS: only its lights, with the blocks in front cut out of it) }.
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

// The ids of the LIGHT_LAYERS this layout has anything on (a light, an animated fitting or a star window), so that no
// canvas is made for an empty layer. May include a layer that turns out empty.
export function lightLayersIn(layout) {
  const { map, panels, bigGroups } = layout
  const ids = new Set()
  const add = (style, phase) => {
    if (LIGHT_STYLES.includes(style) || style === 'twinkle') ids.add(`${style}-${phase}`)
  }
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      if (!isBlock(id)) return
      const position = { x, y }
      const tile = getTile(id)
      const at = keyOf(position)
      const panel = panels.get(at)
      const timing = bigGroups.get(at) ?? position
      const art = tile.wall ? panelArt(tile, panel, position) : null
      if (art) art.lights.forEach((light) => add(light.style, lightPhase(art.timing)))
      else {
        const lights = tile.wall && !panel?.window ? (wallVariant(tile, position)?.lights ?? tileAnimations(tile)) : tileAnimations(tile)
        lights.forEach((light) => add(light.style, lightPhase(timing)))
      }
      if (!panel) return
      if (!tile.panelFitting && panel.window && tile.windowView === 'space') {
        for (let i = 0; i < 5; i++) add('twinkle', starPhase(starSeed(position, i)))
      }
    }),
  )
  return ids
}
