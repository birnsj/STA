import { Container, Graphics, Sprite } from 'pixi.js'
import { diamond, project } from '../../../maps/iso.js'
import { drawLoneTiles } from '../canvasTiles.js'
import { EASE } from './cssTiming.js'
import { makeLabel, placeLabel, textureOf } from './pixiDraw.js'

// The map editor's markers, room labels and tile previews, drawn by Pixi over the map: player starts, enemy spawns,
// NPCs, challenge objects and objectives as small labelled diamonds, with a facing arrow where they face a way.
// Presentation only.

const MARKER_FILLS = { player: 0x3fb6e8, enemy: 0xe5483a, npc: 0xb07ee8, objective: 0xe0a800, object: 0x1fa59a, patrol: 0xe8c44a }
const HIGHLIGHT = 0xffb347
const OUTLINE = 0x03060e
// Erase Marker: what a click would remove pulses between full and this opacity, 0.8 s each way.
const DOOMED_MS = 800
const DOOMED_LOW = 0.45

function doomedAlpha(now) {
  const phase = (now % (DOOMED_MS * 2)) / DOOMED_MS
  const t = EASE.easeInOut(phase <= 1 ? phase : 2 - phase)
  return 1 + (DOOMED_LOW - 1) * t
}

// The arrow for a facing (degrees, 0 = +x), just outside the marker's diamond so it never crosses its outline or
// label. Points relative to the marker's tile centre.
function drawFacing(graphics, position, facing) {
  const centre = project(position)
  const radians = (facing * Math.PI) / 180
  const along = (distance) => {
    const p = project({ x: position.x + Math.cos(radians) * distance, y: position.y + Math.sin(radians) * distance })
    return { x: p.x - centre.x, y: p.y - centre.y }
  }
  const [base, tip] = [along(0.34), along(0.8)]
  const length = Math.hypot(tip.x - base.x, tip.y - base.y) || 1
  const [ux, uy] = [(tip.x - base.x) / length, (tip.y - base.y) / length]
  const neck = { x: tip.x - ux * 11, y: tip.y - uy * 11 }
  const head = [tip.x, tip.y, neck.x - uy * 7, neck.y + ux * 7, neck.x + uy * 7, neck.y - ux * 7]
  // A dark edge under the white shaft, as the CSS drop-shadows give it, so it reads on any floor.
  graphics.moveTo(base.x, base.y).lineTo(neck.x, neck.y).stroke({ color: OUTLINE, width: 4.5, alpha: 0.7, cap: 'round' })
  graphics.moveTo(base.x, base.y).lineTo(neck.x, neck.y).stroke({ color: 0xffffff, width: 2.5, cap: 'round' })
  graphics.poly(head, true).fill({ color: 0xffffff }).stroke({ color: OUTLINE, width: 1.2, join: 'round' })
}

// item: { id, position (tiles), kind ('player', 'enemy', 'npc', 'objective' or 'object'), label, facing (degrees or
// null), selected, doomed }.
export class EditorMarkerView {
  constructor() {
    this.container = new Container()
    this.arrow = new Graphics()
    this.shape = new Graphics()
    this.container.addChild(this.arrow, this.shape)
    this.label = null
    this.drawn = null
  }

  update(item, now, animate) {
    const { position, kind, label, facing, selected, doomed } = item
    const centre = project(position)
    this.container.position.set(centre.x, centre.y)
    const key = `${position.x},${position.y},${kind},${label},${facing},${selected},${doomed}`
    if (key !== this.drawn) {
      this.drawn = key
      this.arrow.clear()
      if (facing !== null) drawFacing(this.arrow, position, facing)
      const points = diamond(position, 0, 0.6).flatMap(([x, y]) => [x - centre.x, y - centre.y])
      const outline = selected || doomed ? { color: HIGHLIGHT, width: 3 } : { color: 0xffffff, width: 1 }
      this.shape.clear().poly(points, true).fill({ color: MARKER_FILLS[kind] }).stroke(outline)
      this.label?.destroy()
      this.label = makeLabel(label, { size: 10, fill: 0xffffff, outline: false })
      placeLabel(this.label, 0, 4)
      this.container.addChild(this.label)
    }
    this.shape.alpha = doomed ? (animate ? doomedAlpha(now) : 1) : selected ? 1 : 0.9
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}

// The selected destructible's or hazard region's footprint, outlined on the floor. item: { id, tiles [{ x, y }], square
// ({ position, radius }: the square an explosion reaches, walls aside) or null, colour, fillAlpha, route (draw a
// looping polyline through tiles in order — NPC patrol preview) }.
export class EditorOutlineView {
  constructor() {
    this.graphics = new Graphics()
    this.container = this.graphics
    this.drawn = null
  }

  update(item) {
    const key = JSON.stringify(item)
    if (key === this.drawn) return
    this.drawn = key
    const { tiles, square, colour, fillAlpha = 0, route = false } = item
    this.graphics.clear()
    if (square) {
      const { x, y } = square.position
      const r = square.radius + 0.5
      const corners = [
        [x - r, y - r],
        [x + r, y - r],
        [x + r, y + r],
        [x - r, y + r],
      ].flatMap(([cx, cy]) => {
        const p = project({ x: cx, y: cy })
        return [p.x, p.y]
      })
      this.graphics.poly(corners, true).fill({ color: colour, alpha: 0.08 }).stroke({ color: colour, width: 1.5, alpha: 0.8 })
    }
    if (route && tiles.length) {
      const centres = tiles.map((tile) => project(tile))
      const path = tiles.length > 1 ? [...centres, centres[0]] : centres
      this.graphics.moveTo(path[0].x, path[0].y)
      for (let i = 1; i < path.length; i++) this.graphics.lineTo(path[i].x, path[i].y)
      this.graphics.stroke({ color: colour, width: 2.5, alpha: 0.9, cap: 'round', join: 'round' })
    }
    tiles.forEach((tile) => {
      this.graphics.poly(diamond(tile).flat(), true).fill({ color: colour, alpha: fillAlpha }).stroke({ color: colour, width: 2, alpha: 0.95 })
    })
  }

  destroy() {
    this.graphics.destroy()
  }
}

// The brush or the Move tool's swap, drawn see-through over everything as the tiles would look placed: preview:
// { layout (the map as it would be), positions, key } or null. Drawn from canvasTiles.js drawLoneTiles, so the tiles
// look exactly as the board draws them; a new key or map redraws it.
const PREVIEW_ALPHA = 0.75
const PREVIEW_RESOLUTION = 2
export class TilePreviewView {
  constructor(container) {
    this.container = container
    this.sprite = null
    this.shown = null
  }

  update(preview) {
    if (preview?.layout === this.shown?.layout && preview?.key === this.shown?.key) return
    this.shown = preview && { layout: preview.layout, key: preview.key }
    if (!preview) {
      this.clear()
      return
    }
    const asked = this.shown
    drawLoneTiles(preview.layout, preview.positions, PREVIEW_RESOLUTION).then(({ canvas, area }) => {
      if (this.shown !== asked) return
      this.clear()
      this.sprite = new Sprite(textureOf(canvas))
      this.sprite.position.set(area.x, area.y)
      this.sprite.scale.set(1 / PREVIEW_RESOLUTION)
      this.sprite.alpha = PREVIEW_ALPHA
      this.container.addChild(this.sprite)
    })
  }

  clear() {
    if (!this.sprite) return
    this.sprite.destroy({ texture: true, textureSource: true })
    this.sprite = null
  }

  destroy() {
    this.shown = null
    this.clear()
  }
}

// A room's name on the floor. item: { id, position (tiles), name, doomed }.
export class AreaLabelView {
  constructor() {
    this.container = new Container()
    this.label = null
    this.strike = new Graphics()
    this.drawn = null
  }

  update(item, now, animate) {
    const { position, name, doomed } = item
    const centre = project(position)
    this.container.position.set(centre.x, centre.y)
    const key = `${name},${doomed}`
    if (key !== this.drawn) {
      this.drawn = key
      this.label?.destroy()
      const fill = doomed ? HIGHLIGHT : { color: 0xc8e1e6, alpha: 0.6 }
      this.label = makeLabel(name.toUpperCase(), { size: 10, weight: '400', fill, letterSpacing: 1.2, outline: false })
      placeLabel(this.label, 0, 4)
      this.strike.clear()
      if (doomed) this.strike.moveTo(-this.label.width / 2, 0.5).lineTo(this.label.width / 2, 0.5).stroke({ color: HIGHLIGHT, width: 1 })
      this.container.addChild(this.label, this.strike)
    }
    this.container.alpha = doomed && animate ? doomedAlpha(now) : 1
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}
