// Dev Generator Editor: saves deck Generate Map styles into deckGenerators.json via /__deck-generators.
import { requestJson } from '../files/jsonHttp.js'
import { getDeckStyle, setDeckStyleLocal } from './generators/deckStyles.js'

export const canEditDeckGenerators = import.meta.env.DEV

// style: { id, floor?, wall?, door?, crate?, machinery?, hazard? }. Updates memory first, then persists in DEV.
export async function saveDeckGeneratorStyle(style) {
  const { id, ...patch } = style ?? {}
  const next = setDeckStyleLocal(id, patch)
  if (!canEditDeckGenerators) return next
  const result = await requestJson('/__deck-generators', 'PUT', { id, ...next })
  return setDeckStyleLocal(result.id, result)
}

export { getDeckStyle }
