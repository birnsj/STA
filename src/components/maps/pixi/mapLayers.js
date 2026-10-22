import { Sprite } from 'pixi.js'
import { textureOf } from './pixiDraw.js'
import { isBlock, project } from '../../../maps/iso.js'
import { FULL_LIGHT } from '../../../maps/mapFormat.js'
import { DARK_MARGIN, darknessOpacity, effectsEpochOf, emissiveEpochOf, frameAt, overlayEmissive } from '../../../maps/tileArt.js'
import {
  animatedArea,
  animatedTiles,
  blockAreaOf,
  blockDrawnArea,
  blockLookKey,
  boardBounds,
  changedArea,
  drawBlockAt,
  drawBoard,
  drawDarkness,
  emissiveTiles,
  GHOST_OPACITY,
  imagesFor,
  isLoaded,
  loadImage,
  snapToPixels,
} from '../canvasTiles.js'
import { fadeLevelAt, fadeLevels, retarget, settle } from '../fadeLevels.js'
import { perfEnd, perfOff, perfStart } from '../../../dev/perfProbe.js'

// A board's map in Pixi (pixiStage.js), drawn by canvasTiles.js: the floor and its lighting, and the darkness, as
// canvases cut into chunks a GPU texture can hold; each block a sprite of its own, sorted by depth among the figures. Blocks that look alike share a texture
// (canvasTiles.js blockLookKey), animated ones one per frame. Faded blocks ease their opacity on fadeLevels.js's clock.
// Presentation only.

// The floor at up to twice world size within the pixel budget; the darkness coarser.
const PIXEL_BUDGET = 12_000_000
const MAX_SCALE = 2
const DARK_PIXEL_BUDGET = 4_000_000
// The largest canvas a chunk is (every WebGL device takes textures this big).
const CHUNK_PX = 2048
// Block textures' pixels per world unit.
const BLOCK_RES = 2
// More emissive tiles than this changing frame in one tick repaint the whole visible darkness instead.
const MAX_TILE_REPAINTS = 60

const padded = (bounds, margin) => ({ x: bounds.x - margin, y: bounds.y - margin, width: bounds.width + 2 * margin, height: bounds.height + 2 * margin })
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const intersect = (a, b) => {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return { x, y, width: Math.min(a.x + a.width, b.x + b.width) - x, height: Math.min(a.y + a.height, b.y + b.height) - y }
}
const union = (a, b) => {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
}
const keyOf = ({ x, y }) => `${x},${y}`

// A world area drawn into canvases of at most CHUNK_PX square at `scale` pixels per unit, each a sprite in `container`.
// paint(context, transform, area, options) repaints a world area of one chunk.
class ChunkedLayer {
  constructor(container, bounds, scale, paint) {
    this.scale = scale
    this.paint = paint
    this.chunks = []
    const width = Math.ceil(bounds.width * scale)
    const height = Math.ceil(bounds.height * scale)
    for (let py = 0; py < height; py += CHUNK_PX) {
      for (let px = 0; px < width; px += CHUNK_PX) {
        const canvas = document.createElement('canvas')
        canvas.width = Math.min(CHUNK_PX, width - px)
        canvas.height = Math.min(CHUNK_PX, height - py)
        const area = { x: bounds.x + px / scale, y: bounds.y + py / scale, width: canvas.width / scale, height: canvas.height / scale }
        const texture = textureOf(canvas)
        const sprite = new Sprite(texture)
        sprite.position.set(area.x, area.y)
        sprite.scale.set(1 / scale)
        container.addChild(sprite)
        this.chunks.push({ area, canvas, texture, sprite, dirty: false })
      }
    }
  }

  paintArea(area, options) {
    for (const chunk of this.chunks) {
      if (!overlaps(chunk.area, area)) continue
      const part = snapToPixels(intersect(chunk.area, area), chunk.area, this.scale)
      const transform = [this.scale, 0, 0, this.scale, -chunk.area.x * this.scale, -chunk.area.y * this.scale]
      this.paint(chunk.canvas.getContext('2d'), transform, part, options)
      chunk.dirty = true
    }
  }

  flush() {
    for (const chunk of this.chunks) {
      if (!chunk.dirty) continue
      chunk.dirty = false
      chunk.texture.source.update()
    }
  }

  destroy() {
    for (const chunk of this.chunks) {
      chunk.sprite.destroy()
      chunk.texture.destroy(true)
    }
    this.chunks = []
  }
}

// The canvas a block (or a faded panel's two halves together) is drawn on: the board's drawing, with the animation
// layer's frame at `time` over it (drawn apart, since that pass cuts out what is under it). area: the world rect it
// covers. opacity: each block drawn see-through (the editor's See-through blocks), in the drawing rather than on the
// sprite, since the lights' additive glow builds up differently on a see-through drawing.
function drawBlocks(layout, positions, area, time, animated, opacity = 1) {
  const width = Math.max(1, Math.ceil(area.width * BLOCK_RES))
  const height = Math.max(1, Math.ceil(area.height * BLOCK_RES))
  const canvas = document.createElement('canvas')
  Object.assign(canvas, { width, height })
  const context = canvas.getContext('2d')
  const transform = [BLOCK_RES, 0, 0, BLOCK_RES, -area.x * BLOCK_RES, -area.y * BLOCK_RES]
  context.setTransform(...transform)
  for (const position of positions) drawBlockAt(context, layout, position, opacity, null)
  if (animated) {
    const frames = document.createElement('canvas')
    Object.assign(frames, { width, height })
    const framesContext = frames.getContext('2d')
    framesContext.setTransform(...transform)
    for (const position of positions) drawBlockAt(framesContext, layout, position, opacity, { layer: 'frames', time })
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.drawImage(frames, 0, 0)
  }
  return canvas
}

// The map's layers: floor (under the ground items), blocks (into the depth-sorted container, beside the figures) and
// darkness (over everything). Build with build() once its images have loaded.
// Options: playing (animated tiles run; else each holds its loop's first frame), ghost (every
// block see-through, the editor's See-through blocks), lighting (contact/cast shadows and darkness drawn).
export class MapLayers {
  constructor({ floorLayer, depthLayer, darkLayer }, layout, { playing = true, ghost = false, lighting = true } = {}) {
    this.layout = layout
    this.target = layout
    this.playing = playing
    this.lighting = lighting
    this.opacity = ghost ? GHOST_OPACITY : 1
    this.depthLayer = depthLayer
    this.darkContainer = darkLayer
    this.floorContainer = floorLayer
    this.textures = new Map()
    this.blocks = new Map()
    this.fade = { target: new Set(), changes: new Map() }
    this.fading = new Set()
    this.ready = false
    this.destroyed = false
    this.animated = animatedTiles(layout).map((item) => ({ ...item, shown: null }))
    this.emissive = new Set(emissiveTiles(layout).map((item) => item.key))
    this.emissiveEpoch = emissiveEpochOf()
    this.effectsEpoch = effectsEpochOf()
  }

  // Loads the map's images, then draws it. Resolves true once drawn (false if destroyed first).
  async build() {
    const { map } = this.layout
    const missing = imagesFor(map).filter((href) => !isLoaded(href))
    if (missing.length) await Promise.all(missing.map(loadImage))
    if (this.destroyed) return false
    const bounds = boardBounds({ width: map.width, height: map.height })
    const scale = Math.min(MAX_SCALE, Math.sqrt(PIXEL_BUDGET / (bounds.width * bounds.height)))
    this.floor = new ChunkedLayer(this.floorContainer, bounds, scale, (context, transform, area) => drawBoard(context, transform, this.layout, area, { lighting: this.lighting, part: 'floor' }))
    this.floor.paintArea(bounds)
    this.floor.flush()
    this.darkness = this.lighting ? darknessOpacity(map) : 0
    if (this.darkness > 0) {
      const darkBounds = padded(bounds, DARK_MARGIN)
      const darkScale = Math.min(1, Math.sqrt(DARK_PIXEL_BUDGET / (darkBounds.width * darkBounds.height)))
      this.darkBounds = darkBounds
      this.dark = new ChunkedLayer(this.darkContainer, darkBounds, darkScale, (context, transform, area, options) => drawDarkness(context, transform, this.layout, area, options))
      this.dark.paintArea(darkBounds, { faded: this.fade.target, time: this.time(performance.now()) })
      this.dark.flush()
    }
    this.buildBlocks()
    this.ready = true
    return true
  }

  time(now) {
    return this.playing ? now / 1000 : null
  }

  buildBlocks() {
    const { map, panels } = this.layout
    const animatedByKey = new Map(this.animated.map((item) => [item.key, item]))
    const now = performance.now()
    const entries = []
    map.tiles.forEach((row, y) =>
      row.forEach((id, x) => {
        if (isBlock(id)) entries.push({ x, y })
      }),
    )
    // Painter's order: by depth, then as the board draws them (row by row), which the sort keeps for equal depths.
    entries.sort((a, b) => a.x + a.y - (b.x + b.y))
    for (const position of entries) {
      const key = keyOf(position)
      const item = animatedByKey.get(key) ?? null
      const record = { key, look: blockLookKey(this.layout, position), position, panel: panels.get(key) ?? null, item, sprite: null, pair: null, level: 1 }
      record.sprite = this.blockSprite(record, now)
      this.depthLayer.addChild(record.sprite)
      this.blocks.set(key, record)
    }
  }

  // The shared texture of one block at `now`: { texture, offset (its drawing's top left from the tile centre) }.
  blockTexture(record, now) {
    const { position, item } = record
    const index = item ? this.frameIndex(item, now) : null
    // Overlay emissive strength is part of the bake (emit colour only tints ground spill, not this sprite).
    const glow = item?.book?.overlay ? Math.round(overlayEmissive(item.book.id) * 10) : ''
    const key = `${record.look}|${index ?? ''}|e${glow}`
    if (!this.textures.has(key)) {
      const centre = project(position)
      const area = blockDrawnArea(this.layout, position)
      const canvas = drawBlocks(this.layout, [position], area, this.time(now), Boolean(item), this.opacity)
      this.textures.set(key, { texture: textureOf(canvas), offset: { x: area.x - centre.x, y: area.y - centre.y } })
    }
    return this.textures.get(key)
  }

  frameIndex(item, now) {
    const time = this.time(now)
    return time === null ? item.book.frames[0] : frameAt(item.book, time + item.offset)
  }

  blockSprite(record, now) {
    const { texture, offset } = this.blockTexture(record, now)
    const centre = project(record.position)
    const sprite = new Sprite(texture)
    sprite.position.set(centre.x + offset.x, centre.y + offset.y)
    sprite.scale.set(1 / BLOCK_RES)
    sprite.zIndex = record.position.x + record.position.y
    if (record.item) record.item.shown = this.frameIndex(record.item, now)
    return sprite
  }

  // A faded panel's two halves drawn as one (canvasTiles.js drawBlock), at the near half's depth.
  pairSprite(record, now) {
    const far = record.panel.axis === 'x' ? { x: record.position.x - 1, y: record.position.y } : { x: record.position.x, y: record.position.y - 1 }
    const farRecord = this.blocks.get(keyOf(far))
    const halves = [far, record.position]
    const indexes = [farRecord?.item, record.item].map((item) => (item ? this.frameIndex(item, now) : ''))
    const glows = [farRecord?.item, record.item].map((item) => (item?.book?.overlay ? Math.round(overlayEmissive(item.book.id) * 10) : ''))
    const key = `pair|${halves.map((half) => blockLookKey(this.layout, half)).join('|')}|${indexes.join(',')}|e${glows.join(',')}`
    const centre = project(record.position)
    if (!this.textures.has(key)) {
      const area = union(blockDrawnArea(this.layout, far), blockDrawnArea(this.layout, record.position))
      const canvas = drawBlocks(this.layout, halves, area, this.time(now), Boolean(farRecord?.item || record.item), this.opacity)
      this.textures.set(key, { texture: textureOf(canvas), offset: { x: area.x - centre.x, y: area.y - centre.y } })
    }
    const { texture, offset } = this.textures.get(key)
    if (!record.pair) {
      record.pair = new Sprite(texture)
      record.pair.scale.set(1 / BLOCK_RES)
      record.pair.zIndex = record.position.x + record.position.y
      this.depthLayer.addChild(record.pair)
    }
    record.pair.texture = texture
    record.pair.position.set(centre.x + offset.x, centre.y + offset.y)
    return record.pair
  }

  // The map changed (an edit, or in play a challenge object's tile, applyScenarioTiles): the floor and darkness are
  // repainted where it did, and every block whose drawing changed gets a new sprite. A tile whose images haven't
  // loaded waits for them (a block texture drawn without them would be cached blank). target: the layout last asked for.
  setLayout(layout, now) {
    this.target = layout
    const missing = imagesFor(layout.map).filter((href) => !isLoaded(href))
    if (!missing.length) {
      this.applyLayout(layout, now)
      return
    }
    Promise.all(missing.map(loadImage)).then(() => {
      if (!this.destroyed && this.target === layout) this.applyLayout(layout, performance.now())
    })
  }

  ensureDarkness(map, now, faded) {
    const wanted = this.lighting ? darknessOpacity(map) : 0
    this.darkness = wanted
    if (wanted <= 0) {
      if (this.dark) {
        this.dark.destroy()
        this.dark = null
        this.darkBounds = null
      }
      return
    }
    if (!this.dark) {
      const bounds = boardBounds({ width: map.width, height: map.height })
      const darkBounds = padded(bounds, DARK_MARGIN)
      const darkScale = Math.min(1, Math.sqrt(DARK_PIXEL_BUDGET / (darkBounds.width * darkBounds.height)))
      this.darkBounds = darkBounds
      this.dark = new ChunkedLayer(this.darkContainer, darkBounds, darkScale, (context, transform, area, options) => drawDarkness(context, transform, this.layout, area, options))
    }
    this.dark.paintArea(this.darkBounds, { faded: faded ?? this.fade.target, time: this.time(now) })
    this.dark.flush()
  }

  applyLayout(layout, now) {
    const before = this.layout
    const ambientBefore = before.map.ambient ?? FULL_LIGHT
    const ambientAfter = layout.map.ambient ?? FULL_LIGHT
    const colourBefore = before.map.ambientColour || ''
    const colourAfter = layout.map.ambientColour || ''
    const ambientChanged = ambientBefore !== ambientAfter || colourBefore !== colourAfter
    this.layout = layout
    this.animated = animatedTiles(layout).map((item) => ({ ...item, shown: null }))
    this.emissive = new Set(emissiveTiles(layout).map((item) => item.key))
    if (!this.ready) return
    const changed = changedArea(before, layout)
    if (!changed && !ambientChanged) return
    const { map } = layout
    if (ambientChanged) this.ensureDarkness(map, now, fadeLevels(this.fade, now))
    if (!changed) return
    const area = changed === 'all' ? boardBounds({ width: map.width, height: map.height }) : changed
    this.floor.paintArea(area)
    this.floor.flush()
    if (!ambientChanged) this.dark?.paintArea(changed === 'all' ? this.darkBounds : area, { faded: fadeLevels(this.fade, now), time: this.time(now) })
    const animatedByKey = new Map(this.animated.map((item) => [item.key, item]))
    map.tiles.forEach((row, y) =>
      row.forEach((id, x) => {
        const position = { x, y }
        const key = keyOf(position)
        const old = this.blocks.get(key)
        const look = isBlock(id) ? blockLookKey(layout, position) : null
        if (old && old.look === look) {
          old.item = animatedByKey.get(key) ?? null
          old.panel = layout.panels.get(key) ?? null
          return
        }
        if (old) {
          old.sprite.destroy()
          old.pair?.destroy()
          this.blocks.delete(key)
        }
        if (!look) return
        const record = { key, look, position, panel: layout.panels.get(key) ?? null, item: animatedByKey.get(key) ?? null, sprite: null, pair: null, level: 1 }
        record.sprite = this.blockSprite(record, now)
        this.depthLayer.addChild(record.sprite)
        this.blocks.set(key, record)
        this.applyLevel(record, fadeLevelAt(this.fade, key, now), now)
      }),
    )
  }

  // Shows a block at an opacity: a faded panel draws whole from its near half (its far half draws nothing).
  applyLevel(record, level, now) {
    record.level = level
    if (!record.panel || level === 1) {
      record.sprite.visible = true
      record.sprite.alpha = level
      if (record.pair) record.pair.visible = false
      return
    }
    record.sprite.visible = false
    if (record.panel.half === 0) return
    const pair = this.pairSprite(record, now)
    pair.visible = true
    pair.alpha = level
  }

  // faded: the Set of 'x,y' keys to show see-through (it eases there). view: the world area on screen.
  update(faded, now, view) {
    if (!this.ready) return
    // tileEffects change: repaint floor shadows and darkness holes.
    const lightEpoch = effectsEpochOf()
    if (this.effectsEpoch !== lightEpoch) {
      this.effectsEpoch = lightEpoch
      if (this.floor) {
        this.floor.paintArea(boardBounds({ width: this.layout.map.width, height: this.layout.map.height }))
        this.floor.flush()
      }
      if (this.dark) this.dark.paintArea(view ?? this.darkBounds, { faded: fadeLevels(this.fade, now), time: this.time(now) })
    }

    // Overlay emissive / emit colour: rebake overlay tiles, refresh floor spill + darkness holes.
    const epoch = emissiveEpochOf()
    if (this.emissiveEpoch !== epoch) {
      this.emissiveEpoch = epoch
      for (const item of this.animated) {
        if (!item.book?.overlay) continue
        item.shown = null
        const record = this.blocks.get(item.key)
        if (!record) continue
        const { texture, offset } = this.blockTexture(record, now)
        record.sprite.texture = texture
        const centre = project(record.position)
        record.sprite.position.set(centre.x + offset.x, centre.y + offset.y)
        item.shown = this.frameIndex(item, now)
        if (record.level < 1 && record.panel) this.applyLevel(record, record.level, now)
      }
      if (this.floor) {
        this.floor.paintArea(boardBounds({ width: this.layout.map.width, height: this.layout.map.height }))
        this.floor.flush()
      }
      if (this.dark) {
        this.dark.paintArea(view ?? this.darkBounds, { faded: fadeLevels(this.fade, now), time: this.time(now) })
        this.dark.flush?.()
      }
    }
    if (faded !== this.fade.target) {
      const before = this.fade.target
      this.fade = retarget(this.fade, faded, now, this.playing)
      for (const key of before) if (!faded.has(key)) this.fading.add(key)
      for (const key of faded) if (!before.has(key)) this.fading.add(key)
    }
    const levels = fadeLevels(this.fade, now)
    if (this.fading.size) {
      const repaint = []
      for (const key of this.fading) {
        const record = this.blocks.get(key)
        if (record) this.applyLevel(record, fadeLevelAt(this.fade, key, now), now)
        repaint.push(key)
      }
      if (this.dark) for (const key of repaint) this.dark.paintArea(blockAreaOf(this.layout, key), { faded: levels, time: this.time(now) })
      this.fade = settle(this.fade, now)
      for (const key of [...this.fading]) if (!this.fade.changes.has(key)) this.fading.delete(key)
    }
    if (this.playing && !perfOff('animtick')) {
      const started = perfStart()
      this.animate(levels, now, view)
      perfEnd('anim.redraw', started)
    }
    this.dark?.flush()
  }

  // Animated blocks onto their current frame; the darkness repainted where a lit frame changed.
  animate(levels, now, view) {
    const lit = []
    for (const item of this.animated) {
      if (view && !overlaps(item.area, view)) continue
      const index = this.frameIndex(item, now)
      if (index === item.shown) continue
      item.shown = index
      const record = this.blocks.get(item.key)
      if (record) {
        const { texture } = this.blockTexture(record, now)
        record.sprite.texture = texture
        if (record.level < 1 && record.panel) this.applyLevel(record, record.level, now)
        const near = record.panel?.half === 0 ? this.blocks.get(keyOf(record.panel.axis === 'x' ? { x: item.position.x + 1, y: item.position.y } : { x: item.position.x, y: item.position.y + 1 })) : null
        if (near && near.level < 1) this.applyLevel(near, near.level, now)
      }
      if (this.emissive.has(item.key)) lit.push(item)
    }
    if (!this.dark || !lit.length) return
    const options = { faded: levels, time: this.time(now) }
    if (lit.length > MAX_TILE_REPAINTS) {
      this.dark.paintArea(view ?? this.darkBounds, options)
      return
    }
    for (const item of lit) {
      const area = animatedArea(this.layout, item)
      if (area) this.dark.paintArea(area, options)
    }
  }

  destroy() {
    this.destroyed = true
    this.floor?.destroy()
    this.dark?.destroy()
    for (const record of this.blocks.values()) {
      record.sprite.destroy()
      record.pair?.destroy()
    }
    for (const { texture } of this.textures.values()) texture.destroy(true)
    this.blocks.clear()
    this.textures.clear()
  }
}