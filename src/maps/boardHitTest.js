import { pickProp } from './propPick.js'

// What a pointer is over on a board drawn without per-element hit testing (the Pixi exploration board): the frontmost
// target whose shapes contain the board point. Targets are { kind, id, depth (painter's x + y, as drawn), shapes };
// shapes are { type: 'rect', x, y, width, height }, { type: 'ellipse', cx, cy, rx, ry } or { type: 'diamond', cx, cy,
// rx, ry } in board coordinates. Dropped props are not in this list: they are picked by the pixels they draw
// (pickAt, maps/propPick.js), the same test the map editor uses.

const inside = (point, shape) => {
  if (shape.type === 'rect') return point.x >= shape.x && point.x <= shape.x + shape.width && point.y >= shape.y && point.y <= shape.y + shape.height
  const dx = (point.x - shape.cx) / shape.rx
  const dy = (point.y - shape.cy) / shape.ry
  if (shape.type === 'diamond') return Math.abs(dx) + Math.abs(dy) <= 1
  return dx * dx + dy * dy <= 1
}

// The target drawn on top at `point`, or null. Of two at the same depth the later one is drawn on top.
// `props` are the dropped items the board is drawing, in the order it was given them (the groundLoot list). A prop
// whose drawn pixel is under the point beats a shape target behind it or tied with it: props are added to the depth
// layer after figures and markers, so at the same depth the prop is the one on screen.
export function pickAt(point, targets, props) {
  const shape = hitTest(point, targets)
  const prop = pickProp(props, point)
  if (prop && (!shape || shape.depth <= prop.depth)) return { kind: 'groundItem', id: prop.id, depth: prop.depth }
  return shape
}

export function hitTest(point, targets) {
  let found = null
  for (const target of targets) {
    if (found && target.depth < found.depth) continue
    if (target.shapes.some((shape) => inside(point, shape))) found = target
  }
  return found
}

// The part of a rect at or below `floor` (screen y grows downward). The name tag floats above that line.
export function rectOnGround(rect, floor) {
  const y = Math.max(rect.y, floor)
  const height = rect.y + rect.height - y
  if (height <= 1) return null
  return { x: rect.x, y, width: rect.width, height }
}

// About how wide a label is (SVG text, the display font): for hit areas only.
export const labelWidth = (text, fontSize) => String(text).length * fontSize * 0.56

// What a figure standing at `centre` (board point of its feet) can be clicked on: the ground ring, the figure's outline (a sprite's, at its display scale; token: a portrait on a stand), and a
// label (text, and the y of its baseline) when it has one.
export function figureShapes(centre, { scale = 1, token = false, label = null, labelY = 0, labelSize = 9 } = {}) {
  const body = token ? { x: centre.x - 17, y: centre.y - 52, width: 34, height: 52 } : { x: centre.x - 9 * scale, y: centre.y - 54 * scale, width: 18 * scale, height: 56 * scale }
  const shapes = [{ type: 'ellipse', cx: centre.x, cy: centre.y, rx: 22, ry: 11 }, { type: 'rect', ...body }]
  if (label) {
    const width = labelWidth(label, labelSize)
    shapes.push({ type: 'rect', x: centre.x - width / 2, y: centre.y + labelY - labelSize, width, height: labelSize + 2 })
  }
  return shapes
}
