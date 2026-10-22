import { useCallback, useEffect, useRef, useState } from 'react'
import { playItemPickup } from '../../audio/uiSounds.js'
import { bagFreeSlots, canPlaceAt, resolveItem } from '../../rules/inventory.js'
import { inventoryDropAt, syncInventoryGhostPosition } from './inventoryDrag.js'

// Drag an item between the inventory panel and the world: the item follows the pointer until release or Escape.
// Owns the drag's UI state (the dragged item and the place preview) and its window listeners. The game change itself
// (transferItem / dropItem) is dispatched to the exploration reducer when the pointer is released.
//
// Returns:
//   itemDrag, placeHover        render state: what is being dragged and where it would land
//   itemDragRef, placeHoverRef  the same, readable inside handlers without waiting for a render
//   placeHelpersRef             filled by the board with toTiles / memberAt (screen point -> tile / party member)
//   inventoryPanelRef           attach to the inventory panel so the drag knows when the pointer is over it
//   beginItemDrag(start)        start a drag: { instanceId, from, clientX, clientY, pointerId }
//   clearItemDrag()             abandon the drag (Escape)
//   onBoardPlaceHover(hover)    the board reports a new hover; keeps a drop-on-member target already found
export default function useItemDrag({ state, dispatch }) {
  const [itemDrag, setItemDrag] = useState(null)
  const [placeHover, setPlaceHover] = useState(null)
  const placeHoverRef = useRef(null)
  const placeHelpersRef = useRef(null)
  const inventoryPanelRef = useRef(null)
  const itemDragRef = useRef(null)
  const stopItemDragListenersRef = useRef(null)
  // Pointer handlers outlive a render, so they read the latest exploration state from here.
  const exploreStateRef = useRef(state)

  useEffect(() => {
    exploreStateRef.current = state
  }, [state])

  useEffect(() => {
    itemDragRef.current = itemDrag
    document.body.classList.toggle('is-item-dragging', Boolean(itemDrag))
    return () => document.body.classList.remove('is-item-dragging')
  }, [itemDrag])

  const pointerOverInventory = useCallback((clientX, clientY) => {
    const panel = inventoryPanelRef.current?.getBoundingClientRect()
    if (!panel) return false
    return clientX >= panel.left && clientX <= panel.right && clientY >= panel.top && clientY <= panel.bottom
  }, [])

  const updatePlaceHover = useCallback((clientX, clientY, overWorld) => {
    if (!overWorld) {
      if (placeHoverRef.current) {
        placeHoverRef.current = null
        setPlaceHover(null)
      }
      return
    }
    const helpers = placeHelpersRef.current
    // Floor unproject for fallback; board point for iso-correct tabletop hits (placement.supportAtBoard).
    const boardPoint = helpers?.toBoard?.(clientX, clientY) ?? null
    const point = helpers?.toTiles?.(clientX, clientY) ?? null
    if (!point && !boardPoint) {
      if (placeHoverRef.current) {
        placeHoverRef.current = null
        setPlaceHover(null)
      }
      return
    }
    const dragging = itemDragRef.current
    const resolved = dragging?.instanceId ? resolveItem(exploreStateRef.current, dragging.instanceId) : null
    const check = canPlaceAt(exploreStateRef.current, point ?? { x: 0, y: 0 }, {
      excludeInstanceId: dragging?.from?.location === 'ground' ? dragging.instanceId : null,
      category: resolved?.def.category ?? null,
      boardPoint,
    })
    // Prefer giving the item to a party member under the pointer (green ring) when their bag has room.
    let dropMemberId = null
    const memberId = helpers?.memberAt?.(clientX, clientY) ?? null
    if (memberId) {
      const member = exploreStateRef.current.party?.members?.[memberId]
      if (member?.character?.inventory && bagFreeSlots(member.character) > 0) dropMemberId = memberId
    }
    // support / z come from canPlaceAt (placement.js); floor drops leave them null / 0. end() still only reads
    // hover.position + valid — dropItem re-resolves support from the position.
    const hover = {
      position: check.position ?? point,
      valid: check.ok,
      dropMemberId,
      support: check.support ?? null,
      z: check.z ?? 0,
    }
    const prev = placeHoverRef.current
    if (
      prev &&
      prev.valid === hover.valid &&
      prev.dropMemberId === hover.dropMemberId &&
      prev.position.x === hover.position.x &&
      prev.position.y === hover.position.y &&
      (prev.z ?? 0) === hover.z &&
      (prev.support?.kind ?? null) === (hover.support?.kind ?? null) &&
      (prev.support?.kind !== 'tile' || (prev.support.tile.x === hover.support.tile.x && prev.support.tile.y === hover.support.tile.y)) &&
      (prev.support?.kind !== 'item' || prev.support.instanceId === hover.support.instanceId)
    ) {
      return
    }
    placeHoverRef.current = hover
    setPlaceHover(hover)
  }, [])

  const onBoardPlaceHover = useCallback((hover) => {
    if (!hover) {
      placeHoverRef.current = null
      setPlaceHover(null)
      return
    }
    const prev = placeHoverRef.current
    // Board hover is authoritative for position/valid/support/z; keep only dropMemberId from the drag path.
    const next = { dropMemberId: prev?.dropMemberId ?? null, ...hover }
    placeHoverRef.current = next
    setPlaceHover(next)
  }, [])

  const clearItemDrag = useCallback(() => {
    stopItemDragListenersRef.current?.()
    stopItemDragListenersRef.current = null
    setItemDrag(null)
    setPlaceHover(null)
    placeHoverRef.current = null
    itemDragRef.current = null
  }, [])

  const beginItemDrag = useCallback(
    (start) => {
      if (itemDragRef.current) return
      const drag = { ...start, overWorld: !pointerOverInventory(start.clientX, start.clientY) }
      itemDragRef.current = drag
      setItemDrag(drag)
      updatePlaceHover(start.clientX, start.clientY, drag.overWorld)
      syncInventoryGhostPosition(start.clientX, start.clientY)
      // Category grab chirp when lifting from bag, slot, or ground (click pickup plays via the reducer).
      const lifted = resolveItem(state, start.instanceId)
      if (lifted) playItemPickup(lifted.def.category)

      // Re-project place preview every frame so a moving camera cannot leave the diamond behind the cursor.
      let rafId = 0
      const tick = () => {
        const current = itemDragRef.current
        if (!current) return
        if (current.overWorld) updatePlaceHover(current.clientX, current.clientY, true)
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)

      const move = (moveEvent) => {
        if (start.pointerId != null && moveEvent.pointerId !== start.pointerId) return
        if (!itemDragRef.current) return
        const overWorld = !pointerOverInventory(moveEvent.clientX, moveEvent.clientY)
        const overChanged = overWorld !== itemDragRef.current.overWorld
        const next = { ...itemDragRef.current, clientX: moveEvent.clientX, clientY: moveEvent.clientY, overWorld }
        itemDragRef.current = next
        // Screen position without a React render — setState every move lagged behind the pointer on a scaled stage.
        syncInventoryGhostPosition(moveEvent.clientX, moveEvent.clientY)
        if (overChanged) setItemDrag(next)
        updatePlaceHover(moveEvent.clientX, moveEvent.clientY, overWorld)
      }

      const teardown = () => {
        cancelAnimationFrame(rafId)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
        stopItemDragListenersRef.current = null
      }

      const end = (endEvent) => {
        if (start.pointerId != null && endEvent.pointerId !== start.pointerId) return
        const current = itemDragRef.current
        teardown()
        if (!current) return
        const cancelled = endEvent.type === 'pointercancel'
        const overWorld = !pointerOverInventory(endEvent.clientX, endEvent.clientY)
        if (overWorld && !cancelled) updatePlaceHover(endEvent.clientX, endEvent.clientY, true)
        const hover = placeHoverRef.current
        const instanceId = current.instanceId
        // Hit-test inventory here: board-started drags never deliver React pointerUp to bag/slot targets.
        const invDrop = !cancelled && !overWorld ? inventoryDropAt(endEvent.clientX, endEvent.clientY) : null
        setItemDrag(null)
        setPlaceHover(null)
        placeHoverRef.current = null
        itemDragRef.current = null
        if (!instanceId || cancelled) return
        if (invDrop) {
          // Same bag → same bag is a no-op; ignore so a tiny drag on the medkit does not feel "stuck".
          const from = current.from
          const sameBag =
            invDrop.kind === 'bag' &&
            from?.location === 'bag' &&
            from.memberId === invDrop.memberId &&
            (invDrop.bagIndex == null || from.bagIndex === invDrop.bagIndex)
          const sameSlot =
            invDrop.kind === 'slot' && from?.location === 'slot' && from.memberId === invDrop.memberId && from.slot === invDrop.slot
          if (!sameBag && !sameSlot) {
            dispatch({
              type: 'transferItem',
              instanceId,
              toMemberId: invDrop.memberId,
              toSlot: invDrop.kind === 'slot' ? invDrop.slot : null,
              toBagIndex: invDrop.kind === 'bag' ? (invDrop.bagIndex ?? null) : null,
              // Grab chirp already played when the drag began; drop plays on successful place.
              skipPickupSound: true,
              playDropSound: true,
            })
          }
          return
        }
        // World drag released over a party figure → that member's bag (same path as inventory party-card drops).
        if (overWorld && hover?.dropMemberId) {
          dispatch({
            type: 'transferItem',
            instanceId,
            toMemberId: hover.dropMemberId,
            skipPickupSound: true,
            playDropSound: true,
          })
          return
        }
        if (overWorld && hover?.valid) {
          dispatch({
            type: 'dropItem',
            instanceId,
            position: hover.position,
            // Optional: floor omits support; elevated passes the hover's support (same as canPlaceAt).
            ...(hover.support ? { support: hover.support } : {}),
          })
        }
      }

      stopItemDragListenersRef.current = teardown
      window.addEventListener('pointermove', move, { passive: true })
      window.addEventListener('pointerup', end)
      window.addEventListener('pointercancel', end)
    },
    [dispatch, pointerOverInventory, state, updatePlaceHover],
  )

  return {
    itemDrag,
    placeHover,
    itemDragRef,
    placeHoverRef,
    placeHelpersRef,
    inventoryPanelRef,
    beginItemDrag,
    clearItemDrag,
    onBoardPlaceHover,
  }
}
