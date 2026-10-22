// Dev Generator Editor: saves Generate Map wall-variant sets into generatedWallVariants.json via /__wall-variants.
import { getWallVariantDraft, setWallVariantSetLocal } from './generators/wallVariantStyles.js'

export const canEditWallVariants = import.meta.env.DEV

// body: { wallId, share?, panelVariants?, tileVariants? }
export async function saveWallVariantSet(body) {
  const wallId = body?.wallId ?? body?.id
  const next = setWallVariantSetLocal(wallId, body)
  if (!canEditWallVariants) return { wallId, ...next }
  const response = await fetch('/__wall-variants', {
    method: 'PUT',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallId,
      share: next.share,
      panelVariants: next.panelVariants,
      tileVariants: next.tileVariants,
    }),
  })
  const result = await response.json()
  if (!response.ok || result?.error) throw new Error(result?.error ?? `${response.status} ${response.statusText}`)
  const applied = setWallVariantSetLocal(result.wallId, {
    share: result.share,
    panelVariants: result.panelVariants ?? [],
    tileVariants: result.tileVariants ?? [],
  })
  return { wallId: result.wallId, ...applied }
}

export { getWallVariantDraft }
