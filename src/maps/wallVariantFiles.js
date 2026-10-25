// Dev Generator Editor: saves Generate Map wall-variant sets into generatedWallVariants.json via /__wall-variants.
import { requestJson } from '../files/jsonHttp.js'
import { getWallVariantDraft, setWallVariantSetLocal } from './generators/wallVariantStyles.js'

export const canEditWallVariants = import.meta.env.DEV

// body: { wallId, share?, panelVariants?, tileVariants? }
export async function saveWallVariantSet(body) {
  const wallId = body?.wallId ?? body?.id
  const next = setWallVariantSetLocal(wallId, body)
  if (!canEditWallVariants) return { wallId, ...next }
  const result = await requestJson('/__wall-variants', 'PUT', {
    wallId,
    share: next.share,
    panelVariants: next.panelVariants,
    tileVariants: next.tileVariants,
  })
  const applied = setWallVariantSetLocal(result.wallId, {
    share: result.share,
    panelVariants: result.panelVariants ?? [],
    tileVariants: result.tileVariants ?? [],
  })
  return { wallId: result.wallId, ...applied }
}

export { getWallVariantDraft }
