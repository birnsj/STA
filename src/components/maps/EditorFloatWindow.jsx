import { useCallback, useEffect, useRef, useState } from 'react'

// Draggable floating tool window for the map editor. Reports busy (hover/drag) so the board can ignore input.

export default function EditorFloatWindow({
  title,
  open,
  onClose,
  x = 80,
  y = 80,
  width = 220,
  onBusyChange,
  children,
}) {
  const [pos, setPos] = useState({ x, y })
  const drag = useRef(null)
  const busy = useRef(false)
  // The parent's callback changes every render; a ref keeps setBusy stable so the effects below don't re-run for it.
  const busyChange = useRef(onBusyChange)
  useEffect(() => {
    busyChange.current = onBusyChange
  })

  const setBusy = useCallback((next) => {
    if (busy.current === next) return
    busy.current = next
    busyChange.current?.(next)
  }, [])

  // The window returns to its start position each time it opens (or its start moves). Worked out while rendering.
  const [placement, setPlacement] = useState({ open, x, y })
  if (placement.open !== open || placement.x !== x || placement.y !== y) {
    setPlacement({ open, x, y })
    if (open) setPos({ x, y })
  }

  useEffect(() => {
    if (!open) setBusy(false)
  }, [open, setBusy])

  useEffect(() => {
    if (!open) return undefined
    const onMove = (event) => {
      if (!drag.current) return
      setPos({
        x: Math.max(0, event.clientX - drag.current.ox),
        y: Math.max(0, event.clientY - drag.current.oy),
      })
    }
    const onUp = (event) => {
      if (!drag.current) return
      drag.current = null
      const el = document.elementFromPoint(event.clientX, event.clientY)
      setBusy(Boolean(el?.closest?.('.ed-float')))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setBusy(false)
    }
  }, [open, setBusy])

  if (!open) return null

  return (
    <div
      className="ed-float"
      style={{ left: pos.x, top: pos.y, width }}
      role="dialog"
      aria-label={title}
      onPointerEnter={() => setBusy(true)}
      onPointerLeave={() => {
        if (!drag.current) setBusy(false)
      }}
    >
      <div
        className="ed-float-title"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          drag.current = { ox: event.clientX - pos.x, oy: event.clientY - pos.y }
          setBusy(true)
        }}
      >
        <span>{title}</span>
        <button type="button" className="me-button ed-float-close" aria-label={`Close ${title}`} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="ed-float-body">{children}</div>
    </div>
  )
}
