// Debug: X toggles clip names over every figure's head (exploration + combat).

const STORAGE_KEY = 'sta.animClipDebug'

/** @type {Map<string, string>} */
const liveClips = new Map()

export function isAnimClipDebugOn() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setAnimClipDebugOn(on) {
  try {
    sessionStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* private mode */
  }
}

export function toggleAnimClipDebug() {
  const next = !isAnimClipDebugOn()
  setAnimClipDebugOn(next)
  return next
}

/** Spike3d reports the clip actually playing on each actor (id matches figure.id). */
export function reportLiveClip(id, name) {
  if (!id) return
  if (!name) {
    liveClips.delete(id)
    return
  }
  liveClips.set(id, name)
}

export function clearLiveClip(id) {
  if (id) liveClips.delete(id)
}

export function liveClipOf(id) {
  return liveClips.get(id) ?? null
}

/** Fallback from board figure fields when Spike3d is off or has not painted yet. */
export function clipNameFromFigure(figure) {
  if (!figure) return 'idle'
  if (figure.pose?.animation) return figure.pose.animation
  if (figure.panic) {
    if (figure.gait === 'walk' || figure.gait === 'sneakWalk') return 'hazardPanicWalk'
    if (figure.gait === 'run' || figure.isWalking) return 'hazardPanicRun'
    return 'hazardPanic'
  }
  if (figure.down) return 'down'
  if (figure.gait) return figure.gait
  if (figure.isWalking) return 'run'
  return 'idle'
}

export function clipLabelForFigure(figure) {
  return liveClipOf(figure?.id) || clipNameFromFigure(figure)
}
