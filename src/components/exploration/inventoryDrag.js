import { TILE_H, tileImageBox } from '../../maps/iso.js'
import { TILE_IMAGE } from '../../maps/mapFormat.js'

// DOM helpers for dragging an inventory item. Kept apart from InventoryPanel.jsx, which holds only components.

// Screen-space size of a world prop at the current board zoom (same as GroundLootView / tileImageBox).
export function worldGhostScreenSize(scale, toClient) {
  const design = { width: TILE_IMAGE.width * scale, height: TILE_IMAGE.height * scale }
  const floorRatio = (TILE_H / 2) / design.height
  const box = tileImageBox({ x: 0, y: 0 }, design)
  if (!toClient) return { width: design.width, height: design.height, floorFromBottom: design.height * floorRatio }
  const topLeft = toClient(box.x, box.y)
  const bottomRight = toClient(box.x + box.width, box.y + box.height)
  if (!topLeft || !bottomRight) return { width: design.width, height: design.height, floorFromBottom: design.height * floorRatio }
  const width = Math.max(1, bottomRight.x - topLeft.x)
  const height = Math.max(1, bottomRight.y - topLeft.y)
  return { width, height, floorFromBottom: height * floorRatio }
}

export const INVENTORY_GHOST_ID = 'inventory-item-ghost'

// Pin the portaled ghost to the pointer without a React render (avoids lag / drift under stage scale + camera).
let ghostEl = null
export function syncInventoryGhostPosition(clientX, clientY) {
  const el = ghostEl?.isConnected ? ghostEl : (ghostEl = document.getElementById(INVENTORY_GHOST_ID))
  if (!el) return
  el.style.left = `${clientX}px`
  el.style.top = `${clientY}px`
}

// Hit-test inventory drop zones (works when the drag started on the board — React target pointerUp is unreliable then).
// Only explicit slot / bag / party targets count — not the whole panel (that made bag items look immovable:
// release still over the window was treated as a bag drop and became a no-op).
export function inventoryDropAt(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY)
  if (!el) return null
  const slot = el.closest('[data-inventory-drop="slot"]')
  if (slot?.dataset.memberId && slot.dataset.slot) {
    return { kind: 'slot', memberId: slot.dataset.memberId, slot: slot.dataset.slot }
  }
  const party = el.closest('[data-inventory-drop="party"]')
  if (party?.dataset.memberId) return { kind: 'bag', memberId: party.dataset.memberId }
  const bag = el.closest('[data-inventory-drop="bag"]')
  if (bag?.dataset.memberId) {
    const raw = bag.dataset.bagIndex
    const bagIndex = raw == null || raw === '' ? null : Number(raw)
    return {
      kind: 'bag',
      memberId: bag.dataset.memberId,
      bagIndex: Number.isInteger(bagIndex) ? bagIndex : null,
    }
  }
  return null
}
