import { Container, Graphics } from 'pixi.js'
import { diamond, project } from '../../../maps/iso.js'
import { makeLabel, placeLabel } from '../../maps/pixi/pixiDraw.js'

// The combat board's ground items on the Pixi board: the highlighted tiles, the planned move, the challenge objects'
// marks and the snap marks. Presentation only.

const YELLOW = 0xf6b928

// A dashed polyline (SVG stroke-dasharray dash gap, stroke-dashoffset offset): the dashes as sub-paths, continuing
// round the corners they span.
function dashedPolyline(graphics, points, dash, gap, offset, stroke) {
  const period = dash + gap
  let along = (((offset % period) + period) % period)
  let drawing = false
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    let done = 0
    while (done < length) {
      const on = along < dash
      const step = Math.min(length - done, (on ? dash : period) - along)
      const at = (part) => [a.x + (b.x - a.x) * part, a.y + (b.y - a.y) * part]
      if (on) {
        if (!drawing) graphics.moveTo(...at(done / length))
        graphics.lineTo(...at((done + step) / length))
      }
      done += step
      along += step
      if (along >= period - 1e-9) along = 0
      drawing = on && along < dash && along !== 0
    }
  }
  graphics.stroke(stroke)
}

// The highlighted tiles: in reach, on the planned path, the destination; a tile in reach under the mouse is
// brighter. tiles: { reachableKeys, pathKeys, destinationKey }.
export class TilesView {
  constructor() {
    this.graphics = new Graphics()
    this.tiles = null
    this.hoverKey = null
    this.look = null
  }

  update(tiles, hoverKey) {
    if (tiles === this.tiles && hoverKey === this.hoverKey) return
    this.tiles = tiles
    this.hoverKey = hoverKey
    const { reachableKeys, pathKeys, destinationKey } = tiles
    const look = [[...(reachableKeys ?? [])].join(';'), [...(pathKeys ?? [])].join(';'), destinationKey, hoverKey].join('|')
    if (this.look === look) return
    this.look = look
    const keys = new Set([...(reachableKeys ?? []), ...(pathKeys ?? []), ...(destinationKey ? [destinationKey] : [])])
    const graphics = this.graphics.clear()
    for (const key of keys) {
      const [x, y] = key.split(',').map(Number)
      const reachable = reachableKeys?.has(key)
      let fill = null
      let stroke = null
      if (reachable) {
        fill = { color: 0x2c78ff, alpha: 0.35 }
        stroke = { color: 0x6eaaff, alpha: 0.7, width: 0.8 }
      }
      if (pathKeys?.has(key)) fill = { color: 0x78c8ff, alpha: 0.6 }
      if (key === destinationKey) {
        fill = { color: YELLOW, alpha: 0.45 }
        stroke = { color: YELLOW, width: 1.2 }
      }
      if (reachable && key === hoverKey) fill = { color: 0x4696ff, alpha: 0.5 }
      graphics.poly(diamond({ x, y }).flat())
      if (fill) graphics.fill(fill)
      if (stroke) graphics.stroke({ ...stroke, join: 'miter' })
    }
  }

  destroy() {
    this.graphics.destroy()
  }
}

// The planned move, tile centre to tile centre, dashes marching along it (12 units every 0.8 s), and a marker on the destination. path: [positions] or null.
const MARCH_MS = 800
export class MovePathView {
  constructor() {
    this.graphics = new Graphics()
  }

  update(path, now, playing) {
    const graphics = this.graphics.clear()
    if (!path) return
    const centres = path.map(project)
    const offset = playing ? -12 * ((now % MARCH_MS) / MARCH_MS) : 0
    dashedPolyline(graphics, centres, 7, 5, offset, { color: YELLOW, width: 3, cap: 'round', join: 'round' })
    const end = centres[centres.length - 1]
    graphics.ellipse(end.x, end.y, 9, 4.5).fill({ color: YELLOW })
  }

  destroy() {
    this.graphics.destroy()
  }
}

// ObjectMarker: a challenge object's diamond and name; gold when the acting character can reach it.
// mark: { position, name, inReach }.
export class ObjectMarkView {
  constructor() {
    this.container = new Container()
    this.look = null
  }

  update(mark) {
    const centre = project(mark.position)
    this.container.position.set(centre.x, centre.y)
    const look = `${mark.name}|${mark.inReach}`
    if (this.look === look) return
    this.look = look
    this.container.removeChildren().forEach((child) => child.destroy())
    const shape = new Graphics()
      .poly([0, -30, 9, -21, 0, -12, -9, -21])
      .fill(mark.inReach ? { color: 0xffd25a, alpha: 0.45 } : { color: 0x78c8ff, alpha: 0.25 })
      .stroke(mark.inReach ? { color: 0xffd25a, width: 1.5 } : { color: 0xa0dcff, alpha: 0.8, width: 1.5 })
    const name = makeLabel(mark.name, { size: 9, weight: '600', fill: 0xc8e6ff })
    name.alpha = 0.85
    placeLabel(name, 0, -34)
    this.container.addChild(shape, name)
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}

// Debug: each fighter's world position and the cell it was snapped to. marks: [{ id, from, cell }] or null.
export class SnapMarksView {
  constructor() {
    this.graphics = new Graphics()
    this.marks = undefined
  }

  update(marks) {
    if (this.marks === marks) return
    this.marks = marks
    const graphics = this.graphics.clear()
    for (const mark of marks ?? []) {
      const from = project(mark.from)
      const to = project(mark.cell)
      dashedPolyline(graphics, [from, to], 4, 3, 0, { color: 0xff5bd0, width: 2 })
      graphics.circle(from.x, from.y, 4).fill({ color: 0xff5bd0 })
    }
  }

  destroy() {
    this.graphics.destroy()
  }
}
