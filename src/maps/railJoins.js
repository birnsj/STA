// Joined railings (the editor, exploration and Combat Type 1). A tile with joinImages (tiles.json) is drawn as a piece
// running from its centre towards up to two neighbouring tiles of the same kind, so a run of them, straight or curved,
// reads as one railing. Presentation only: movement, sight and cover still read the single tiles.
import { getTile } from './mapFormat.js'

// N is -y, E is +x; the order also names the image files (tosRail-N-E.png).
const DIRECTIONS = [
  ['N', 0, -1],
  ['NE', 1, -1],
  ['E', 1, 0],
  ['SE', 1, 1],
  ['S', 0, 1],
  ['SW', -1, 1],
  ['W', -1, 0],
  ['NW', -1, -1],
]

// The joined piece's image for the tile at position, or null when it has nothing to join (drawn as the plain tile).
// Edge neighbours join first; a corner neighbour only joins when neither tile between them is the same kind, so a
// diagonal step joins once rather than as a triangle.
export function joinedImage(map, { x, y }) {
  const id = map.tiles[y][x]
  const template = getTile(id).joinImages
  if (!template) return null
  const same = (dx, dy) => map.tiles[y + dy]?.[x + dx] === id
  const edges = DIRECTIONS.filter(([, dx, dy]) => (dx === 0 || dy === 0) && same(dx, dy))
  const corners = DIRECTIONS.filter(([, dx, dy]) => dx !== 0 && dy !== 0 && same(dx, dy) && !same(dx, 0) && !same(0, dy))
  const joins = [...edges, ...corners].slice(0, 2)
  if (!joins.length) return null
  const names = DIRECTIONS.filter((direction) => joins.includes(direction)).map(([name]) => name)
  return template.replace('{joins}', names.join('-'))
}
