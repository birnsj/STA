import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// Starts a Pixi board's scene once the board mounts (StrictMode-safe) and destroys it on unmount. start(host,
// isCancelled) resolves to { destroy } (or null if cancelled first) and rejects if WebGL can't start; null start: no
// scene (the SVG board is in use). Returns { hostRef } for the scene's host element and failed: true once the scene
// couldn't start, so the board can draw itself the SVG way instead.
export default function usePixiScene(start) {
  const hostRef = useRef(null)
  const [failed, setFailed] = useState(false)
  const startRef = useRef(start)
  useLayoutEffect(() => {
    startRef.current = start
  })
  const enabled = Boolean(start)
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    let scene = null
    startRef
      .current(hostRef.current, () => cancelled)
      .then((started) => {
        if (cancelled) started?.destroy()
        else scene = started
      })
      .catch((error) => {
        console.error('Pixi board failed to start; using the SVG board.', error)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      scene?.destroy()
    }
  }, [enabled])
  return { hostRef, failed }
}
