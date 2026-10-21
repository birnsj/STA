// Dev map editor: saves overlay emissive / emit colour / light-pool into tileEffects.json via /__effects.
import {
  overlayEmissive,
  overlayEmitColour,
  setOverlayEmissiveLocal,
  setOverlayEmitColourLocal,
  setTileGlowLocal,
} from './tileArt.js'

export const canEditEffects = import.meta.env.DEV

async function putEffects(body) {
  const response = await fetch('/__effects', {
    method: 'PUT',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok || result?.error) throw new Error(result?.error ?? `${response.status} ${response.statusText}`)
  return result
}

// Persists emissive strength (and refreshes the live catalogue). Prefer setOverlayEmissiveLocal while dragging.
export async function setOverlayEmissive(id, value) {
  const next = setOverlayEmissiveLocal(id, value)
  if (!canEditEffects) return next
  await putEffects({ id, emissive: next })
  return next
}

export async function setOverlayEmitColour(id, colour) {
  const next = setOverlayEmitColourLocal(id, colour)
  if (!canEditEffects) return next
  await putEffects({ id, emitColour: next })
  return next
}

export async function setTileGlow(id, changes, kind = null) {
  const next = setTileGlowLocal(id, changes, kind)
  if (!canEditEffects) return next
  await putEffects({ id, kind: next.kind, colour: next.colour, brightness: next.brightness })
  return next
}

export { overlayEmissive, overlayEmitColour }
