import { TILE_W } from '../maps/iso.js'

export const ITEM_GRID = 32
export const ITEM_CELL_PX = TILE_W / ITEM_GRID

// Snap a tile-space point to a world-pixel cell size (2, 4, 8, 16, 32, 64, …).
export function snapItemPosition(point, cellPx = ITEM_CELL_PX) {
  const size = Number(cellPx) > 0 ? Number(cellPx) : ITEM_CELL_PX
  const step = size / TILE_W
  return {
    x: Math.round(point.x / step) * step,
    y: Math.round(point.y / step) * step,
  }
}

export function itemGridKey(position, cellPx = ITEM_CELL_PX) {
  const snapped = snapItemPosition(position, cellPx)
  return `${snapped.x},${snapped.y}`
}
