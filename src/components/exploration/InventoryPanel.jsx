import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadInventoryWindow, saveInventoryWindow } from '../../character/persistence.js'
import { getPortraitById } from '../../rules/appearance.js'
import { getCategoryName, getItemById, getItemStatLines } from '../../rules/equipment.js'
import { TILE_H, tileImageBox } from '../../maps/iso.js'
import { TILE_IMAGE } from '../../maps/mapFormat.js'
import {
  BAG_CAPACITY,
  BAG_COLS,
  BAG_VISIBLE_ROWS,
  EQUIP_SLOTS,
  canEquipToSlot,
  emptyInventory,
  resolveItem,
} from '../../rules/inventory.js'
import CombatPortrait from '../combat/CombatPortrait.jsx'
import InfoTipBubble from '../InfoTipBubble.jsx'
import { useStageSize } from '../stageSize.js'

const SLOT_LABELS = {
  body: 'Body',
  sidearm: 'Sidearm',
  scanner: 'Scanner',
  communicator: 'Communicator',
}

const DEFAULT_SIZE = { width: 320, height: 440 }
const MARGIN = 8
// Clear of the left party rail (same inset as the character sheet).
const DEFAULT_LEFT = 8 + 178 + 12
const DEFAULT_TOP = 72

function clampPosition(left, top, stageWidth, stageHeight, width = DEFAULT_SIZE.width, height = DEFAULT_SIZE.height) {
  const maxLeft = Math.max(MARGIN, stageWidth - width - MARGIN)
  const maxTop = Math.max(MARGIN, stageHeight - height - MARGIN)
  return {
    left: Math.min(Math.max(MARGIN, left), maxLeft),
    top: Math.min(Math.max(MARGIN, top), maxTop),
  }
}

// CSS left/top are design pixels inside the scaled stage; pointer deltas are screen pixels.
function stageScaleOf(el) {
  if (!el) return 1
  const width = el.offsetWidth
  if (!width) return 1
  return el.getBoundingClientRect().width / width
}

// Same InfoTipBubble content shape as the character creator (useInfoTip.js).
function itemTipContent(def, quantity = 1) {
  if (!def) return null
  const category = getCategoryName(def.category)
  const sections = [
    category ? { label: 'Type', text: category } : null,
    quantity > 1 ? { label: 'Quantity', text: String(quantity) } : null,
    ...(def.stats ? getItemStatLines(def) : []).map((line) => ({ label: line.label, text: line.value })),
  ].filter(Boolean)
  return { title: def.name, text: def.description || null, sections }
}

// Long enough that sliding across the grid does not flash a box on every icon; shorter than TitleTips (1.5s).
const ITEM_TIP_DELAY_MS = 350

// The element the pointer is resting on that owns an item tip (an equipment slot, or a carried cell).
function itemTipTarget(target) {
  if (!(target instanceof Element)) return null
  return target.closest('[data-item-tip]')
}

function ItemCell({ def, quantity, selected, invalid, dimmed, onPointerDown, bagDrop = null }) {
  const filled = Boolean(def)
  const draggable = Boolean(def && onPointerDown)
  // Divs, not disabled buttons: empty cells must not eat clicks, and buttons fight pointer-drag in Electron.
  // Filled cells always take hits across the full box — pointer-events:none punched through to the map SVG.
  // Bag cells are always hit targets so a drop lands on that cell, not the first open one.
  // A carried cell is its own tip target. Equipped cells sit inside the slot that owns data-item-tip.
  return (
    <div
      className={`inventory-item-cell${selected ? ' is-selected' : ''}${invalid ? ' is-invalid' : ''}${dimmed ? ' is-dimmed' : ''}${filled ? ' is-filled' : ' is-empty'}${draggable ? ' is-draggable' : ''}${bagDrop ? ' is-bag-cell' : ''}`}
      data-inventory-drop={bagDrop ? 'bag' : undefined}
      data-member-id={bagDrop?.memberId}
      data-bag-index={bagDrop ? bagDrop.bagIndex : undefined}
      data-item-tip={bagDrop && def ? def.id : undefined}
      data-item-qty={bagDrop && def ? quantity : undefined}
      onPointerDown={
        draggable
          ? (event) => {
              if (event.button !== 0) return
              event.preventDefault()
              event.stopPropagation()
              onPointerDown(event)
            }
          : undefined
      }
      role={draggable ? 'button' : undefined}
      tabIndex={draggable ? 0 : undefined}
    >
      {def?.icon ? <img key={def.id} src={def.icon} alt="" draggable={false} /> : def ? <span className="inventory-item-fallback">{def.name.slice(0, 2)}</span> : null}
      {quantity > 1 && <span className="inventory-item-qty">{quantity}</span>}
    </div>
  )
}

function SlotCell({ slot, memberId, instanceId, state, drag, onStartDrag }) {
  const resolved = instanceId ? resolveItem(state, instanceId) : null
  const dragging = drag?.instanceId
  const fromThisSlot = drag?.from?.location === 'slot' && drag.from.memberId === memberId && drag.from.slot === slot
  const canDrop = Boolean(dragging && !fromThisSlot && canEquipToSlot(state, dragging, slot).ok)
  const invalid = Boolean(dragging && !fromThisSlot && !canDrop)
  const dimmed = drag?.instanceId === instanceId
  const startDrag = resolved
    ? (event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        onStartDrag(event, { instanceId, location: 'slot', slot })
      }
    : undefined
  return (
    <div
      className={`inventory-slot${resolved ? ' is-filled is-draggable' : ' is-empty'}${invalid ? ' is-invalid-target' : ''}${canDrop ? ' is-valid-target' : ''}`}
      data-inventory-drop="slot"
      data-slot={slot}
      data-member-id={memberId}
      data-item-tip={resolved ? resolved.def.id : undefined}
      data-item-qty={resolved ? resolved.instance.quantity ?? 1 : undefined}
      onPointerDown={startDrag}
    >
      <span className="inventory-slot-label">{SLOT_LABELS[slot]}</span>
      <ItemCell
        def={resolved?.def}
        quantity={resolved?.instance.quantity ?? 1}
        selected={dimmed}
        dimmed={dimmed}
        onPointerDown={startDrag}
      />
    </div>
  )
}

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

// Floating inventory over exploration. Screen owns the drag lifecycle so world ↔ UI stays one continuous grab.
export default function InventoryPanel({
  state,
  members,
  viewedId,
  onViewMember,
  onClose,
  drag,
  panelRef,
  onDragStart,
}) {
  const stage = useStageSize()
  const [position, setPosition] = useState(() => {
    const saved = loadInventoryWindow()
    return saved
      ? clampPosition(saved.left, saved.top, stage.width, stage.height)
      : clampPosition(DEFAULT_LEFT, DEFAULT_TOP, stage.width, stage.height)
  })

  useEffect(() => {
    const onResize = () => setPosition((current) => clampPosition(current.left, current.top, stage.width, stage.height))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [stage.width, stage.height])

  useEffect(() => {
    setPosition((current) => clampPosition(current.left, current.top, stage.width, stage.height))
  }, [stage.width, stage.height])

  // Panel-level tip by item id (not useInfoTip / TitleTips): exploration re-renders every world tick and recreates
  // cell DOM; matching the catalogue id keeps the delay and tip alive, and retargets the anchor when the node changes.
  // Always on — independent of Settings → Tooltips (that switch only covers TitleTips chrome elsewhere).
  const tipsEnabled = !drag
  const [itemTip, setItemTip] = useState(null)
  useEffect(() => {
    const panel = panelRef?.current
    if (!panel || !tipsEnabled) {
      setItemTip(null)
      return undefined
    }
    let hoveredId = null
    let timer = null
    const clear = () => {
      clearTimeout(timer)
      timer = null
      hoveredId = null
      setItemTip(null)
    }
    const dimmed = (target) =>
      target.classList.contains('is-dimmed') || Boolean(target.querySelector('.inventory-item-cell.is-dimmed'))
    const over = (event) => {
      const target = itemTipTarget(event.target)
      const itemId = target?.dataset.itemTip || null
      if (!target || !itemId || dimmed(target)) {
        if (hoveredId) clear()
        return
      }
      if (itemId === hoveredId) {
        setItemTip((tip) => (tip && tip.anchor !== target ? { ...tip, anchor: target } : tip))
        return
      }
      clearTimeout(timer)
      hoveredId = itemId
      setItemTip(null)
      const quantity = Number(target.dataset.itemQty) || 1
      timer = setTimeout(() => {
        if (hoveredId !== itemId) return
        setItemTip({ itemId, quantity, anchor: target })
      }, ITEM_TIP_DELAY_MS)
    }
    const out = (event) => {
      if (!hoveredId) return
      const next = event.relatedTarget
      const nextTarget = next instanceof Element ? itemTipTarget(next) : null
      if (nextTarget?.dataset.itemTip === hoveredId) return
      if (next instanceof Element && next.closest('.info-tip')) return
      clear()
    }
    panel.addEventListener('pointerover', over)
    panel.addEventListener('pointerout', out)
    return () => {
      clearTimeout(timer)
      panel.removeEventListener('pointerover', over)
      panel.removeEventListener('pointerout', out)
    }
  }, [panelRef, tipsEnabled])

  // Live panel spot while dragging; React state only commits on release so world ticks cannot snap it back.
  const positionRef = useRef(position)
  const windowDraggingRef = useRef(false)
  useEffect(() => {
    positionRef.current = position
  }, [position])
  useEffect(() => () => document.body.classList.remove('is-window-dragging'), [])
  useLayoutEffect(() => {
    if (windowDraggingRef.current) return
    const panel = panelRef?.current
    if (!panel) return
    panel.style.left = `${position.left}px`
    panel.style.top = `${position.top}px`
  }, [position, panelRef])

  const startWindowDrag = (event) => {
    if (event.button !== 0 || drag) return
    event.preventDefault()
    event.stopPropagation()
    const panel = panelRef?.current
    if (!panel) return
    const scale = stageScaleOf(panel)
    const origin = { x: event.clientX, y: event.clientY, left: positionRef.current.left, top: positionRef.current.top }
    const target = event.currentTarget
    target.setPointerCapture?.(event.pointerId)
    windowDraggingRef.current = true
    target.classList.add('is-dragging')
    document.body.classList.add('is-window-dragging')
    let latest = positionRef.current
    const move = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return
      latest = clampPosition(
        origin.left + (moveEvent.clientX - origin.x) / scale,
        origin.top + (moveEvent.clientY - origin.y) / scale,
        stage.width,
        stage.height,
      )
      // Direct DOM — setState every move lagged behind the pointer (same issue as the item ghost).
      panel.style.left = `${latest.left}px`
      panel.style.top = `${latest.top}px`
    }
    const end = (endEvent) => {
      if (endEvent.pointerId !== event.pointerId) return
      target.releasePointerCapture?.(event.pointerId)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      target.classList.remove('is-dragging')
      document.body.classList.remove('is-window-dragging')
      windowDraggingRef.current = false
      const clamped = clampPosition(latest.left, latest.top, stage.width, stage.height)
      positionRef.current = clamped
      panel.style.left = `${clamped.left}px`
      panel.style.top = `${clamped.top}px`
      setPosition(clamped)
      saveInventoryWindow(clamped)
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const member = members.find((entry) => entry.id === viewedId) ?? members[0]
  if (!member) return null
  const inventory = member.character.inventory ?? emptyInventory()
  const portrait = getPortraitById(member.character.portrait?.id)
  const fullBody = portrait?.fullBody ?? member.character.portrait?.image ?? null

  const beginItemDrag = (event, from) => {
    onDragStart({
      instanceId: from.instanceId,
      from: { memberId: member.id, ...from },
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
    })
  }

  const bagCells = Array.from({ length: BAG_CAPACITY }, (_, index) => inventory.bag[index] ?? null)

  return (
    <div
      ref={panelRef}
      className="combat-panel inventory-panel"
      data-viewed-id={member.id}
      onPointerDown={(event) => event.stopPropagation()}
      role="dialog"
      aria-label="Inventory"
    >
      <header className="inventory-titlebar" onPointerDown={startWindowDrag} title="Drag to move">
        <span className="inventory-drag-handle" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 3v6M12 15v6M3 12h6M15 12h6M12 3l-2.5 3.5h5ZM12 21l-2.5-3.5h5ZM3 12l3.5-2.5v5ZM21 12l-3.5-2.5v5Z" />
          </svg>
        </span>
        <h2 className="inventory-title">Inventory</h2>
        <button type="button" className="inventory-close" aria-label="Close inventory" title="Close (I)" onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>
          ×
        </button>
      </header>

      <div className="inventory-party-strip">
        {members.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`inventory-party-card${entry.id === member.id ? ' is-selected' : ''}${drag ? ' is-drop-target' : ''}`}
            data-inventory-drop="party"
            data-member-id={entry.id}
            onClick={() => onViewMember(entry.id)}
            title={entry.character.name}
          >
            <CombatPortrait character={entry.character} className="inventory-party-portrait" />
            <span className="inventory-party-name">{entry.character.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      <div className="inventory-body-row">
        <div className="inventory-slots-col">
          {EQUIP_SLOTS.slice(0, 2).map((slot) => (
            <SlotCell key={slot} slot={slot} memberId={member.id} instanceId={inventory.slots[slot]} state={state} drag={drag} onStartDrag={beginItemDrag} />
          ))}
        </div>
        <div className="inventory-body-art">
          {fullBody ? <img src={fullBody} alt="" draggable={false} /> : <CombatPortrait character={member.character} className="inventory-body-fallback" />}
          <p className="inventory-body-name">{member.character.name}</p>
        </div>
        <div className="inventory-slots-col">
          {EQUIP_SLOTS.slice(2).map((slot) => (
            <SlotCell key={slot} slot={slot} memberId={member.id} instanceId={inventory.slots[slot]} state={state} drag={drag} onStartDrag={beginItemDrag} />
          ))}
        </div>
      </div>

      <div
        className={`inventory-bag${drag ? ' is-drop-target' : ''}`}
        style={{ '--bag-cols': BAG_COLS, '--bag-visible-rows': BAG_VISIBLE_ROWS }}
        data-inventory-drop="bag"
        data-member-id={member.id}
      >
        <p className="inventory-bag-label">Carried</p>
        <div className="inventory-bag-scroll">
          <div className="inventory-bag-grid">
            {bagCells.map((instanceId, index) => {
              const resolved = instanceId ? resolveItem(state, instanceId) : null
              return (
                <ItemCell
                  key={instanceId ?? `empty-${index}`}
                  def={resolved?.def}
                  quantity={resolved?.instance.quantity ?? 1}
                  selected={drag?.instanceId === instanceId}
                  dimmed={Boolean(drag && instanceId && drag.instanceId === instanceId)}
                  bagDrop={{ memberId: member.id, bagIndex: index }}
                  onPointerDown={resolved ? (event) => beginItemDrag(event, { instanceId, location: 'bag', bagIndex: index }) : undefined}
                />
              )
            })}
          </div>
        </div>
      </div>
      {itemTip && tipsEnabled ? (
        <InfoTipBubble content={itemTipContent(getItemById(itemTip.itemId), itemTip.quantity)} anchor={itemTip.anchor} />
      ) : null}
    </div>
  )
}

// Portaled to document.body. left/top are never React style — exploration re-renders every world tick with a stale
// drag.clientX/Y, which yanked the ghost backward. pointermove (syncInventoryGhostPosition) owns position after mount.
export function InventoryDragGhost({ drag, state, placeHelpersRef = null }) {
  const elRef = useRef(null)
  if (!drag || typeof document === 'undefined') return null
  const resolved = resolveItem(state, drag.instanceId)
  if (!resolved) return null
  const overWorld = Boolean(drag.overWorld)
  const scale = Math.max(0.15, Math.min(1, resolved.def.worldScale ?? 0.4))
  const src = overWorld ? resolved.def.worldImage || resolved.def.icon : resolved.def.icon
  const sized = overWorld ? worldGhostScreenSize(scale, placeHelpersRef?.current?.toClient) : null
  const style = overWorld
    ? {
        width: sized.width,
        height: sized.height,
        transform: `translate(-50%, calc(-100% + ${sized.floorFromBottom}px))`,
      }
    : { transform: 'translate(-50%, -50%)' }

  return createPortal(
    <InventoryGhostMount
      key={`${drag.instanceId}:${overWorld ? 'world' : 'ui'}:${src ?? ''}`}
      elRef={elRef}
      className={`inventory-drag-ghost${overWorld ? ' is-world' : ' is-ui'}`}
      style={style}
      src={src}
      fallback={resolved.def.name.slice(0, 2)}
      clientX={drag.clientX}
      clientY={drag.clientY}
    />,
    document.body,
  )
}

function InventoryGhostMount({ elRef, className, style, src, fallback, clientX, clientY }) {
  // Pointer sample at mount only (grab start, or ui↔world art swap). Later React renders keep stale clientX/Y.
  const origin = useRef({ clientX, clientY })
  useLayoutEffect(() => {
    syncInventoryGhostPosition(origin.current.clientX, origin.current.clientY)
  }, [elRef])
  return (
    <div id={INVENTORY_GHOST_ID} ref={elRef} className={className} style={style} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : <span>{fallback}</span>}
    </div>
  )
}
