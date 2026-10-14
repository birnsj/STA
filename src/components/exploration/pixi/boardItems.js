import { Container, Graphics, Sprite } from 'pixi.js'
import { isBlock, project } from '../../../maps/iso.js'
import { drawBlockAt, drawTileAt } from '../../maps/canvasTiles.js'
import { MARKER_DIAMOND, MARKER_NAME, MARKER_STATE, OUTLINE_COLOURS } from '../boardGeometry.js'
import { dashedEllipse, drawnCanvas, makeLabel, placeLabel, textureOf } from '../../maps/pixi/pixiDraw.js'

// Challenge objects' outlines and markers, the last-known markers and the click rings on the Pixi board, drawn as the
// SVG board draws them (ExplorationBoard ObjectHighlight / ChallengeMarker / ClickPulse, LastKnownMarker; colours from
// exploration.css and combat.css). Presentation only.

const RES = 2
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const hex = (colour) => parseInt(colour.slice(1), 16)

const blank = (width, height) => Object.assign(document.createElement('canvas'), { width, height })

// ExplorationBoard ObjectOutlineFilters, done once on a canvas: the art's silhouette grown by 1 (1.6 with the glow)
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
    // exploration.css object-highlight: faint out of reach; in reach it pulses (1 -> 0.5 -> 1 over 1.6 s), steady
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

// ExplorationBoard ChallengeMarker: a diamond over the object's art with its state and name above.
// object: { position, artTop, name, stateLabel, changed, inReach, depth }.
export class MarkerView {
  constructor() {
    this.container = new Container()
    this.look = null
  }

  update(object) {
    const centre = project(object.position)
    this.container.position.set(centre.x, centre.y)
    this.container.zIndex = object.depth
    this.container.alpha = object.inReach ? 1 : 0.75
    const look = `${object.name}|${object.stateLabel}|${object.changed}|${object.artTop}`
    if (this.look === look) return
    this.look = look
    this.container.removeChildren().forEach((child) => child.destroy())
    const colour = hex(OUTLINE_COLOURS[object.changed ? 'changed' : 'unresolved'])
    const diamond = -object.artTop - MARKER_DIAMOND
    const shape = new Graphics()
      .poly([0, diamond - 20, 9, diamond - 10, 0, diamond, -9, diamond - 10])
      .fill({ color: colour })
      .stroke({ color: 0x03060e, width: 1.5 })
    const name = makeLabel(object.name, { size: 10, fill: colour })
    placeLabel(name, 0, -object.artTop - MARKER_NAME)
    const state = makeLabel(object.stateLabel, { size: 9, weight: '600', fill: colour })
    placeLabel(state, 0, -object.artTop - MARKER_STATE)
    this.container.addChild(shape, name, state)
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}

// LastKnownMarker: where the away team last saw an NPC. marker: { position, label }.
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
