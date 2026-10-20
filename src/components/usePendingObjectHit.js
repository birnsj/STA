import { useEffect } from 'react'

// An object shot is laser first, then Structure damage or an explosion once the beam has landed: the reducer parks the
// shot as state.pendingObjectHit and this applies it after its impactMs. Shared by exploration (paused while a fight
// runs, enabled: false) and combat (the battle speed shortens the wait, speed).
// The effect depends on the shot's parts, not the object, so one timer runs per shot and a re-render never restarts it.
export default function usePendingObjectHit(pendingHit, dispatch, { enabled = true, speed = 1 } = {}) {
  const pending = pendingHit != null
  const key = pendingHit?.key
  const impactMs = pendingHit?.impactMs
  useEffect(() => {
    if (!pending || !enabled) return undefined
    const timer = setTimeout(() => dispatch({ type: 'applyPendingObjectHit' }), impactMs / speed)
    return () => clearTimeout(timer)
  }, [pending, key, impactMs, enabled, speed, dispatch])
}
