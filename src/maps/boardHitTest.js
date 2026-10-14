// What a pointer is over on a board drawn without per-element hit testing (the Pixi exploration board): the frontmost
// target whose shapes contain the board point. Targets are { kind, id, depth (painter's x + y, as drawn), shapes };
// shapes are { type: 'rect', x, y, width, height }, { type: 'ellipse', cx, cy, rx, ry } or { type: 'diamond', cx, cy,
// rx, ry } in board coordinates. Presentation only.

const inside = (point, shape) => {
  if (shape.type === 'rect') return point.x >= shape.x && point.x <= shape.x + shape.width && point.y >= shape.y && point.y <= shape.y + shape.height
  const dx = (point.x - shape.cx) / shape.rx
  const dy = (point.y - shape.cy) / shape.ry
  if (shape.type === 'diamond') return Math.abs(dx) + Math.abs(dy) <= 1
  return dx * dx + dy * dy <= 1
}

// The target drawn on top at `point`, or null. Of two at the same depth the later one is drawn on top.
export function hitTest(point, targets) {
  let found = null
  for (const target of targets) {
    if (found && target.depth < found.depth) continue
    if (target.shapes.some((shape) => inside(point, shape))) found = target
  }
  return found
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
