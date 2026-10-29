import { useLayoutEffect, useState } from 'react'
import { EDGE_MARGIN } from '../combat/useCamera.js'

// Screen-space band matching useCamera's edge-scroll margin (getBoundingClientRect coords).
// Debug only; pointer-events none so it never blocks the board.
export default function EdgeScrollDebugOverlay({ boardRef }) {
  const [box, setBox] = useState(null)

  useLayoutEffect(() => {
    const sync = () => {
      const element = boardRef?.current
      if (!element) {
        setBox(null)
        return
      }
      const rect = element.getBoundingClientRect()
      setBox({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    }
    sync()
    window.addEventListener('resize', sync)
    const id = window.setInterval(sync, 200)
    return () => {
      window.removeEventListener('resize', sync)
      window.clearInterval(id)
    }
  }, [boardRef])

  if (!box || box.width < 2 || box.height < 2) return null

  return (
    <div
      className="edge-scroll-debug"
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        boxShadow: `inset 0 0 0 ${EDGE_MARGIN}px rgba(255, 110, 0, 0.3)`,
      }}
      aria-hidden
    >
      <span className="edge-scroll-debug-label">edge scroll {EDGE_MARGIN}px</span>
    </div>
  )
}
