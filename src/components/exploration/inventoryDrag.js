import { project } from '../../maps/iso.js'

// Screen-space size of a world prop at the current board zoom (same box GroundLootView draws).
// Over the board the ghost's bottom corner is the front tip of the place square, not the pointer.
export function worldGhostScreenSize(design, toClient) {
  const width0 = design?.width ?? 32
  const height0 = design?.height ?? 48
  if (!toClient) return { width: width0, height: height0, floorFromBottom: 0 }
  const topLeft = toClient(0, 0)
  const bottomRight = toClient(width0, height0)
  if (!topLeft || !bottomRight) return { width: width0, height: height0, floorFromBottom: 0 }
  return {
    width: Math.max(1, bottomRight.x - topLeft.x),
    height: Math.max(1, bottomRight.y - topLeft.y),
    floorFromBottom: 0,
  }
}

export const INVENTORY_GHOST_ID = 'inventory-item-ghost'

// Client point for the bottom corner of a world drag: the front tip of the green or red place square, lifted by z.
// Null when that square is hidden (over the inventory window, or over a party member who can take the item).
export function placeGhostClient(hover, toClient) {
  if (!hover?.position || hover.dropMemberId || typeof toClient !== 'function') return null
  const tip = project(hover.position)
  const screen = toClient(tip.x, tip.y - (Number(hover.z) || 0))
  return screen || null
}

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
