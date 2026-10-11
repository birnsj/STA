// Arrow on a figure's ground ring pointing along a direction on the tile grid, in the tiles' isometric projection.
// Shared by the exploration board and the combat battlefield.
export default function FacingArrow({ facing }) {
  const length = Math.hypot(facing.x - facing.y, facing.x + facing.y) || 1
  const dir = { x: (facing.x - facing.y) / length, y: (facing.x + facing.y) / length }
  const side = { x: -dir.y, y: dir.x }
  const toScreen = (x, y) => `${x.toFixed(1)},${(y / 2).toFixed(1)}`
  const tip = toScreen(dir.x * 38, dir.y * 38)
  const left = toScreen(dir.x * 21 + side.x * 11, dir.y * 21 + side.y * 11)
  const right = toScreen(dir.x * 21 - side.x * 11, dir.y * 21 - side.y * 11)
  return <polygon className="iso-unit-facing" points={`${tip} ${left} ${right}`} />
}
