import { Container, Graphics, Sprite } from 'pixi.js'
import { isBlock, project, tileImageBox } from '../../../maps/iso.js'
import { getTile, TILE_IMAGE } from '../../../maps/mapFormat.js'
import { getCategoryHighlight } from '../../../rules/equipment.js'
import { drawBlockAt, drawTileAt, loadImage } from '../../maps/canvasTiles.js'
import { MARKER_DIAMOND, MARKER_NAME, MARKER_STATE, OUTLINE_COLOURS } from '../boardGeometry.js'
import { dashedEllipse, drawnCanvas, makeLabel, placeLabel, textureOf } from '../../maps/pixi/pixiDraw.js'
import { perfOff } from '../../../dev/perfProbe.js'

const PROP_RES = 2
const propImageFor = (tileId) => getTile(tileId)?.image ?? getTile('crate')?.image ?? null

// Challenge objects' outlines and markers, the last-known markers and the click rings on the Pixi boards.
// Presentation only.

const RES = 2
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const hex = (colour) => parseInt(colour.slice(1), 16)

const blank = (width, height) => Object.assign(document.createElement('canvas'), { width, height })

// A challenge object's outline, drawn once on a canvas: the art's silhouette grown by 1 (1.6 with the glow)
// less the art itself, in the state's colour; the glow adds the ring blurred (3) outside the art, twice over.
function outlineCanvas(layout, tiles, area, colour, glow) {
  const art = drawnCanvas(area, RES, (context) => {
    for (const position of tiles) drawTileAt(context, layout, position)
  })
  // The animation layer's first frame too: a tile drawn only by its animation has nothing on the board.
  const frames = drawnCanvas(area, RES, (context) => {
    for (const position of tiles) if (isBlock(layout.map.tiles[position.y][position.x])) drawBlockAt(context, layout, position, 1, { layer: 'frames', time: null })
  })
  const artContext = art.getContext('2d')
  artContext.setTransform(1, 0, 0, 1, 0, 0)
  artContext.drawImage(frames, 0, 0)
  const { width, height } = art
  const edge = blank(width, height)
  const e = edge.getContext('2d')
  const radius = (glow ? 1.6 : 1) * RES
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2
    e.drawImage(art, Math.cos(angle) * radius, Math.sin(angle) * radius)
  }
  e.globalCompositeOperation = 'source-in'
  e.fillStyle = colour
  e.fillRect(0, 0, width, height)
  e.globalCompositeOperation = 'destination-out'
  e.drawImage(art, 0, 0)
  if (!glow) return edge
  const halo = blank(width, height)
  const h = halo.getContext('2d')
  h.filter = `blur(${3 * RES}px)`
  h.drawImage(edge, 0, 0)
  h.filter = 'none'
  h.globalCompositeOperation = 'destination-out'
  h.drawImage(art, 0, 0)
  const out = blank(width, height)
  const o = out.getContext('2d')
  o.drawImage(halo, 0, 0)
  o.drawImage(halo, 0, 0)
  o.drawImage(edge, 0, 0)
  return out
}

// A challenge object's outline. object: { id, tiles, area (highlightBox), depth, changed, inReach, hovered }.
export class HighlightView {
  constructor() {
    this.sprite = new Sprite()
    this.look = null
  }

  update(layout, object, now) {
    this.sprite.visible = !perfOff('filters')
    if (!this.sprite.visible) return
    const look = `${object.changed}|${object.inReach}|${object.tiles.map(({ x, y }) => `${x},${y}`).join(';')}`
    if (this.look !== look || this.layout !== layout) {
      this.look = look
      this.layout = layout
      const canvas = outlineCanvas(layout, object.tiles, object.area, OUTLINE_COLOURS[object.changed ? 'changed' : 'unresolved'], object.inReach)
      this.texture?.destroy(true)
      this.texture = textureOf(canvas)
      this.sprite.texture = this.texture
      this.sprite.position.set(object.area.x, object.area.y)
      this.sprite.scale.set(1 / RES)
    }
    this.sprite.zIndex = object.depth
    // Faint out of reach; in reach it pulses (1 -> 0.5 -> 1 over 1.6 s), steady
    // while hovered.
    if (!object.inReach) this.sprite.alpha = 0.6
    else if (object.hovered || reducedMotion()) this.sprite.alpha = 1
    else this.sprite.alpha = 0.75 + 0.25 * Math.cos(((now % 1600) / 1600) * Math.PI * 2)
  }

  destroy() {
    this.texture?.destroy(true)
    this.sprite.destroy()
  }
}

const PANEL = 0x060c1c
const FRAME_PAD_X = 6
const FRAME_PAD_Y = 2

// A challenge object's marker: a diamond over the object's art with its state and name above, framed. Shown only while
// the pointer is over the object (or a ground drop). On an active objective's object (objective) a glow round the frame
// pulses (0.15 -> 0.9 -> 0.15 over 1.6 s; steady with reduced motion).
// object: { position, artTop, name, stateLabel, changed, objective, inReach, depth, hovered }.
export class MarkerView {
  constructor() {
    this.container = new Container()
    this.look = null
    this.glow = null
  }

  update(object, now) {
    const centre = project(object.position)
    this.container.position.set(centre.x, centre.y)
    this.container.zIndex = object.depth
    this.container.visible = Boolean(object.hovered)
    if (!this.container.visible) return
    this.container.alpha = object.inReach ? 1 : 0.75
    const look = `${object.name}|${object.stateLabel}|${object.changed}|${object.objective}|${object.artTop}`
    if (this.look !== look) this.draw(object, look)
    if (this.glow) this.glow.alpha = reducedMotion() ? 0.6 : 0.525 - 0.375 * Math.cos(((now % 1600) / 1600) * Math.PI * 2)
  }

  draw(object, look) {
    this.look = look
    this.container.removeChildren().forEach((child) => child.destroy())
    const colour = hex(OUTLINE_COLOURS[object.changed ? 'changed' : 'unresolved'])
    const diamond = -object.artTop - MARKER_DIAMOND
    const shape = new Graphics()
      .poly([0, diamond - 20, 9, diamond - 10, 0, diamond, -9, diamond - 10])
      .fill({ color: colour })
      .stroke({ color: 0x03060e, width: 1.5 })
    const name = makeLabel(object.name, { size: 10, fill: colour, outline: false })
    placeLabel(name, 0, -object.artTop - MARKER_NAME)
    const state = makeLabel(object.stateLabel, { size: 9, weight: '600', fill: colour, outline: false })
    placeLabel(state, 0, -object.artTop - MARKER_STATE)
    // The HUD panels' frame (base.css --panel, rounded, bordered) in the marker's colour.
    const width = Math.max(name.width, state.width) + FRAME_PAD_X * 2
    const top = name.y - FRAME_PAD_Y
    const height = state.y + state.height + FRAME_PAD_Y - top
    const frame = new Graphics()
      .roundRect(-width / 2, top, width, height, 4)
      .fill({ color: PANEL })
      .stroke({ color: colour, width: 1.5 })
    this.glow = object.objective
      ? new Graphics()
          .roundRect(-width / 2 - 2.5, top - 2.5, width + 5, height + 5, 6)
          .stroke({ color: colour, width: 2.5 })
          .roundRect(-width / 2 - 5, top - 5, width + 10, height + 10, 8)
          .stroke({ color: colour, width: 2, alpha: 0.4 })
      : null
    this.container.addChild(...(this.glow ? [this.glow] : []), shape, frame, name, state)
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}

// Room around the prop so the yellow ring and blur are not clipped at the texture edge.
const OUTLINE_PAD = Math.ceil(7 * PROP_RES)

// Yellow silhouette around a prop canvas (same grow-and-cut approach as challenge-object outlines).
// Returns { canvas, pad } — pad is pixels to inset when positioning so the prop stays on its floor point.
function propOutlineCanvas(art, colour) {
  const pad = OUTLINE_PAD
  const width = art.width + pad * 2
  const height = art.height + pad * 2
  const placed = blank(width, height)
  placed.getContext('2d').drawImage(art, pad, pad)
  const edge = blank(width, height)
  const e = edge.getContext('2d')
  const radius = 1.6 * PROP_RES
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2
    e.drawImage(placed, Math.cos(angle) * radius, Math.sin(angle) * radius)
  }
  e.globalCompositeOperation = 'source-in'
  e.fillStyle = colour
  e.fillRect(0, 0, width, height)
  e.globalCompositeOperation = 'destination-out'
  e.drawImage(placed, 0, 0)
  const halo = blank(width, height)
  const h = halo.getContext('2d')
  h.filter = `blur(${2.5 * PROP_RES}px)`
  h.drawImage(edge, 0, 0)
  h.filter = 'none'
  h.globalCompositeOperation = 'destination-out'
  h.drawImage(placed, 0, 0)
  const out = blank(width, height)
  const o = out.getContext('2d')
  o.drawImage(halo, 0, 0)
  o.drawImage(halo, 0, 0)
  o.drawImage(edge, 0, 0)
  o.drawImage(placed, 0, 0)
  return { canvas: out, pad }
}

// A dropped inventory item as a real isometric map prop (dedicated worldImage, else tiles.json worldTile — never the inventory icon).
// Sized with worldScale (fraction of the 64×96 tile image) and anchored with tileImageBox so feet sit on the floor.
// object: { position, worldImage?, worldTile?, worldScale?, category?, inReach, depth, hovered }.
export class GroundLootView {
  constructor() {
    this.container = new Container()
    this.sprite = null
    this.look = null
    this.paintKey = 0
    this.artCanvas = null
    this.spritePad = 0
  }

  update(object) {
    const scale = Math.max(0.15, Math.min(1, object.worldScale ?? 0.4))
    const size = { width: TILE_IMAGE.width * scale, height: TILE_IMAGE.height * scale }
    const box = tileImageBox(object.position, size)
    this.container.zIndex = object.depth
    this.container.alpha = 1
    const href = object.worldImage || propImageFor(object.worldTile ?? 'crate')
    const hovered = Boolean(object.hovered)
    const highlight = getCategoryHighlight(object.category)
    const look = `${object.position.x},${object.position.y}|${href}|${scale}|${hovered ? 1 : 0}|${highlight}`
    if (this.look === look) {
      if (this.sprite) this.sprite.position.set(box.x - this.spritePad / PROP_RES, box.y - this.spritePad / PROP_RES)
      return
    }
    // Hover toggle only: reuse the cached prop art and rebuild the outline.
    if (this.artCanvas && this.look?.startsWith(`${object.position.x},${object.position.y}|${href}|${scale}|`)) {
      this.look = look
      if (hovered) {
        const outlined = propOutlineCanvas(this.artCanvas, highlight)
        this.applySprite(outlined.canvas, box, outlined.pad)
      } else {
        this.applySprite(this.artCanvas, box, 0)
      }
      return
    }
    this.look = look
    this.paint(href, box, size, look, hovered, highlight)
  }

  applySprite(canvas, box, pad = 0) {
    // Copy into a display canvas so destroying the sprite texture never clears the cached prop art.
    const display = blank(canvas.width, canvas.height)
    display.getContext('2d').drawImage(canvas, 0, 0)
    if (this.sprite) {
      this.container.removeChild(this.sprite)
      this.sprite.destroy({ texture: true, textureSource: true })
    }
    this.spritePad = pad
    this.sprite = new Sprite(textureOf(display))
    this.sprite.scale.set(1 / PROP_RES)
    this.sprite.position.set(box.x - pad / PROP_RES, box.y - pad / PROP_RES)
    this.container.addChild(this.sprite)
  }

  async paint(href, box, size, look, hovered, highlight) {
    const key = ++this.paintKey
    const prop = href ? await loadImage(href) : null
    if (key !== this.paintKey || this.look !== look) return
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(size.width * PROP_RES))
    canvas.height = Math.max(1, Math.round(size.height * PROP_RES))
    const context = canvas.getContext('2d')
    context.imageSmoothingEnabled = false
    context.setTransform(PROP_RES, 0, 0, PROP_RES, 0, 0)
    if (prop) context.drawImage(prop, 0, 0, size.width, size.height)
    this.artCanvas = canvas
    if (hovered) {
      const outlined = propOutlineCanvas(canvas, highlight)
      this.applySprite(outlined.canvas, box, outlined.pad)
    } else {
      this.applySprite(canvas, box, 0)
    }
  }

  destroy() {
    this.paintKey += 1
    this.artCanvas = null
    this.container.destroy({ children: true })
  }
}

// Where the away team last saw an NPC. marker: { position, label }.
export class LastKnownView {
  constructor() {
    this.container = new Container()
    this.look = null
  }

  update(marker) {
    const centre = project(marker.position)
    this.container.position.set(centre.x, centre.y)
    if (this.look === marker.label) return
    this.look = marker.label
    this.container.removeChildren().forEach((child) => child.destroy())
    const ring = new Graphics().ellipse(0, 0, 18, 9).fill({ color: 0xff5c5c, alpha: 0.08 })
    dashedEllipse(ring, 0, 0, 18, 9, 4, 3, { color: 0xff7878, alpha: 0.7, width: 1.5 })
    const mark = makeLabel('?', { size: 14, fill: 0xff9696, outline: false })
    mark.alpha = 0.9
    placeLabel(mark, 0, -8)
    this.container.addChild(ring, mark)
    if (marker.label) {
      const label = makeLabel(marker.label, { size: 9, weight: '600', fill: 0xff9696 })
      label.alpha = 0.9
      placeLabel(label, 0, 20)
      this.container.addChild(label)
    }
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}

// ClickPulse: a ring on the ground where a click-to-move landed, growing and fading over 380 ms (ease-out).
const PULSE_MS = 380
export class PulseView {
  constructor() {
    this.graphics = new Graphics().circle(0, 0, 26).fill({ color: 0xffd23f, alpha: 0.25 }).stroke({ color: 0xf6b928, width: 4 })
  }

  update(pulse, now) {
    const centre = project(pulse.point)
    const t = Math.min(1, (now - pulse.bornAt) / PULSE_MS)
    const eased = 1 - (1 - t) ** 2
    const scale = 0.25 + (1.2 - 0.25) * eased
    this.graphics.position.set(centre.x, centre.y)
    this.graphics.scale.set(scale, scale * 0.5)
    this.graphics.alpha = 1 - eased
  }

  destroy() {
    this.graphics.destroy()
  }
}
