import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// Starts a Pixi board's scene once the board mounts (StrictMode-safe) and destroys it on unmount. start(host,
// isCancelled) resolves to { destroy } (or null if cancelled first) and rejects if WebGL can't start. Returns
// { hostRef } for the scene's host element and failed: true once the scene couldn't start, so the board can say so
// (WebglUnavailable).
export default function usePixiScene(start) {
  const hostRef = useRef(null)
  const [failed, setFailed] = useState(false)
  const startRef = useRef(start)
  useLayoutEffect(() => {
    startRef.current = start
  })
  useEffect(() => {
    let cancelled = false
    let scene = null
    startRef
      .current(hostRef.current, () => cancelled)
      .then((started) => {
        if (cancelled) started?.destroy()
        else scene = started
      })
      .catch((error) => {
        console.error('Pixi board failed to start.', error)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      scene?.destroy()
    }
  }, [])
  return { hostRef, failed }
}
