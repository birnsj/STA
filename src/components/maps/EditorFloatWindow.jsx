import { useCallback, useEffect, useRef, useState } from 'react'

// Draggable floating tool window for the map editor. Reports busy (hover/drag) so the board can ignore input.
// Coordinates are stage design pixels: ScaledStage applies CSS scale, so clientX/Y must be converted through the
// stage's getBoundingClientRect (fixed positioning is relative to that transformed ancestor, not the viewport).

function stagePoint(clientX, clientY, el) {
  const stage = el?.closest?.('.stage')
  if (!stage) return { x: clientX, y: clientY }
  const rect = stage.getBoundingClientRect()
  const scaleX = rect.width / (stage.offsetWidth || 1)
  const scaleY = rect.height / (stage.offsetHeight || 1)
  if (!(scaleX > 0) || !(scaleY > 0)) return { x: clientX, y: clientY }
  return { x: (clientX - rect.left) / scaleX, y: (clientY - rect.top) / scaleY }
}

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
  const root = useRef(null)
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
      if (!drag.current || !root.current) return
      const point = stagePoint(event.clientX, event.clientY, root.current)
      setPos({
        x: Math.max(0, point.x - drag.current.ox),
        y: Math.max(0, point.y - drag.current.oy),
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
      ref={root}
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
          const point = stagePoint(event.clientX, event.clientY, root.current)
          drag.current = { ox: point.x - pos.x, oy: point.y - pos.y }
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
