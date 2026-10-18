import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadInventoryWindow, saveInventoryWindow } from '../../character/persistence.js'
import { getPortraitById } from '../../rules/appearance.js'
import { getCategoryName, getItemStatLines } from '../../rules/equipment.js'
import { TILE_H, tileImageBox } from '../../maps/iso.js'
import { TILE_IMAGE } from '../../maps/mapFormat.js'
import { BAG_CAPACITY, BAG_COLS, BAG_ROWS, EQUIP_SLOTS, emptyInventory, resolveItem } from '../../rules/inventory.js'
import CombatPortrait from '../combat/CombatPortrait.jsx'
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

function itemTooltip(def) {
  if (!def) return ''
  const stats = getItemStatLines(def)
    .map((line) => `${line.label} ${line.value}`)
    .join(' · ')
  return [def.name, def.description, getCategoryName(def.category), stats].filter(Boolean).join('\n')
}

function ItemCell({ def, quantity, selected, invalid, dimmed, onPointerDown, title }) {
  const filled = Boolean(def)
  const draggable = Boolean(def && onPointerDown)
  // Divs, not disabled buttons: empty cells must not eat clicks, and buttons fight pointer-drag in Electron.
  // Filled cells always take hits across the full box — pointer-events:none punched through to the map SVG.
  return (
    <div
      className={`inventory-item-cell${selected ? ' is-selected' : ''}${invalid ? ' is-invalid' : ''}${dimmed ? ' is-dimmed' : ''}${filled ? ' is-filled' : ' is-empty'}${draggable ? ' is-draggable' : ''}`}
      title={title ?? (def ? itemTooltip(def) : undefined)}
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
  const dragResolved = dragging ? resolveItem(state, dragging) : null
  const invalid = Boolean(dragging && dragResolved && dragResolved.def.equipSlot !== slot)
  const canDrop = Boolean(dragging && dragResolved && dragResolved.def.equipSlot === slot)
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
      onPointerDown={startDrag}
      title={resolved ? itemTooltip(resolved.def) : undefined}
    >
      <span className="inventory-slot-label">{SLOT_LABELS[slot]}</span>
      <ItemCell
        def={resolved?.def}
        quantity={resolved?.instance.quantity ?? 1}
        selected={drag?.instanceId === instanceId}
        dimmed={drag?.instanceId === instanceId}
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
export function syncInventoryGhostPosition(clientX, clientY) {
  const el = document.getElementById(INVENTORY_GHOST_ID)
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
  if (bag?.dataset.memberId) return { kind: 'bag', memberId: bag.dataset.memberId }
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

  const startWindowDrag = (event) => {
    if (event.button !== 0 || drag) return
    event.preventDefault()
    event.stopPropagation()
    const panel = panelRef?.current
    const scale = stageScaleOf(panel)
    const origin = { x: event.clientX, y: event.clientY, left: position.left, top: position.top }
    const target = event.currentTarget
    target.setPointerCapture?.(event.pointerId)
    const move = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return
      const next = clampPosition(
        origin.left + (moveEvent.clientX - origin.x) / scale,
        origin.top + (moveEvent.clientY - origin.y) / scale,
        stage.width,
        stage.height,
      )
      setPosition(next)
    }
    const end = (endEvent) => {
      if (endEvent.pointerId !== event.pointerId) return
      target.releasePointerCapture?.(event.pointerId)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setPosition((current) => {
        const clamped = clampPosition(current.left, current.top, stage.width, stage.height)
        saveInventoryWindow(clamped)
        return clamped
      })
    }
    window.addEventListener('pointermove', move)
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
      style={{ left: position.left, top: position.top }}
      data-viewed-id={member.id}
      onPointerDown={(event) => event.stopPropagation()}
      role="dialog"
      aria-label="Inventory"
    >
      <header className="inventory-titlebar" onPointerDown={startWindowDrag}>
        <h2 className="inventory-title">Inventory</h2>
        <button type="button" className="inventory-close" aria-label="Close inventory" title="Close (B)" onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>
          ×
        </button>
      </header>

      <div className="inventory-party-strip">
        {members.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`inventory-party-card${entry.id === member.id ? ' is-selected' : ''}${drag && drag.from.memberId !== entry.id ? ' is-drop-target' : ''}`}
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

      <div className={`inventory-bag${drag ? ' is-drop-target' : ''}`} style={{ '--bag-cols': BAG_COLS, '--bag-rows': BAG_ROWS }} data-inventory-drop="bag" data-member-id={member.id}>
        <p className="inventory-bag-label">Carried</p>
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
                onPointerDown={resolved ? (event) => beginItemDrag(event, { instanceId, location: 'bag' }) : undefined}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Portaled to document.body. Position is written directly on pointermove (syncInventoryGhostPosition); this only
// switches UI vs world art when the drag crosses the inventory edge.
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
        left: drag.clientX,
        top: drag.clientY,
        width: sized.width,
        height: sized.height,
        transform: `translate(-50%, calc(-100% + ${sized.floorFromBottom}px))`,
      }
    : { left: drag.clientX, top: drag.clientY, transform: 'translate(-50%, -50%)' }

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
  useLayoutEffect(() => {
    const el = elRef.current
    if (!el) return
    el.style.left = `${clientX}px`
    el.style.top = `${clientY}px`
  }, [elRef, clientX, clientY])
  return (
    <div id={INVENTORY_GHOST_ID} ref={elRef} className={className} style={style} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : <span>{fallback}</span>}
    </div>
  )
}
