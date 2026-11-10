// Drag payload for Generator Editor palette → role slots.
export const GE_ASSET_DRAG_TYPE = 'application/x-sta-ge-asset'

/** Drag ghost at the thumb's displayed size (avoids HiDPI canvas / CSS scale blow-up). */
export function setThumbDragImage(event, source) {
  if (!event?.dataTransfer || !source) return
  const rect = source.getBoundingClientRect()
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  const ghost = document.createElement('canvas')
  ghost.width = width
  ghost.height = height
  Object.assign(ghost.style, {
    position: 'fixed',
    left: '-10000px',
    top: '-10000px',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
  })
  const ctx = ghost.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = true
  try {
    ctx.drawImage(source, 0, 0, width, height)
  } catch {
    return
  }
  document.body.appendChild(ghost)
  event.dataTransfer.setDragImage(ghost, Math.round(width / 2), Math.round(height / 2))
  // Chrome snapshots the drag image after dragstart returns.
  window.setTimeout(() => ghost.remove(), 0)
}

export function setGeAssetDrag(event, kind, id, preview = null) {
  if (!event?.dataTransfer || !kind || !id) return
  const payload = JSON.stringify({ kind, id })
  event.dataTransfer.setData(GE_ASSET_DRAG_TYPE, payload)
  event.dataTransfer.setData('text/plain', id)
  event.dataTransfer.effectAllowed = 'copy'
  const source =
    preview ||
    event.currentTarget?.querySelector?.('.me-thumb-preview') ||
    event.currentTarget?.querySelector?.('canvas, img')
  if (source) setThumbDragImage(event, source)
}

export function readGeAssetDrag(event) {
  const raw = event?.dataTransfer?.getData(GE_ASSET_DRAG_TYPE)
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    if (!data?.kind || !data?.id) return null
    if (data.kind !== 'tile' && data.kind !== 'piece') return null
    return data
  } catch {
    return null
  }
}
