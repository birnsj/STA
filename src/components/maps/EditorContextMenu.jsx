import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Right-click menus inside ScaledStage must live in stage/design pixels and portal into the shell.
// Client coordinates + position:fixed look/feel wrong under CSS transform:scale (and can close on open).

function hostOf(el) {
  return el?.closest?.('.me-screen') || el?.closest?.('.stage') || null
}

function pointInHost(clientX, clientY, host) {
  if (!host) return { x: clientX, y: clientY }
  const rect = host.getBoundingClientRect()
  const scaleX = rect.width / (host.offsetWidth || 1)
  const scaleY = rect.height / (host.offsetHeight || 1)
  if (!(scaleX > 0) || !(scaleY > 0)) return { x: clientX, y: clientY }
  return {
    x: (clientX - rect.left) / scaleX,
    y: (clientY - rect.top) / scaleY,
  }
}

export function contextMenuPlacement(event) {
  const host = hostOf(event.currentTarget)
  if (!host) return null
  const point = pointInHost(event.clientX, event.clientY, host)
  return { host, x: point.x, y: point.y }
}

function clampMenu(x, y, width, height, host) {
  const pad = 4
  const maxX = Math.max(pad, (host?.offsetWidth ?? window.innerWidth) - width - pad)
  const maxY = Math.max(pad, (host?.offsetHeight ?? window.innerHeight) - height - pad)
  return {
    x: Math.min(Math.max(pad, x), maxX),
    y: Math.min(Math.max(pad, y), maxY),
  }
}

// items: [{ id, label, disabled?, onSelect }]
export default function EditorContextMenu({ host, x, y, items, onClose }) {
  const rootRef = useRef(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const node = rootRef.current
    if (!node || !host) {
      setPos({ x, y })
      return
    }
    setPos(clampMenu(x, y, node.offsetWidth || 160, node.offsetHeight || 80, host))
  }, [host, x, y, items])

  useEffect(() => {
    // Defer so the opening contextmenu / pointerup does not instantly dismiss the menu.
    const onPointer = (event) => {
      if (rootRef.current?.contains(event.target)) return
      onClose()
    }
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointer, true)
      window.addEventListener('keydown', onKey, true)
      window.addEventListener('scroll', onClose, true)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  if (!host) return null

  return createPortal(
    <ul
      ref={rootRef}
      className="ed-menu-list ed-ctx-menu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <li key={item.id} role="presentation">
          <button
            type="button"
            role="menuitem"
            className="ed-menu-item"
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onSelect?.()
            }}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>,
    host,
  )
}
