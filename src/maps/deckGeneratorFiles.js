// Dev Generator Editor: saves deck Generate Map styles into deckGenerators.json via /__deck-generators.
import { getDeckStyle, setDeckStyleLocal } from './generators/deckStyles.js'

export const canEditDeckGenerators = import.meta.env.DEV

// style: { id, floor?, wall?, door?, crate?, machinery?, hazard? }. Updates memory first, then persists in DEV.
export async function saveDeckGeneratorStyle(style) {
  const { id, ...patch } = style ?? {}
  const next = setDeckStyleLocal(id, patch)
  if (!canEditDeckGenerators) return next
  const response = await fetch('/__deck-generators', {
    method: 'PUT',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...next }),
  })
  const result = await response.json()
  if (!response.ok || result?.error) throw new Error(result?.error ?? `${response.status} ${response.statusText}`)
  return setDeckStyleLocal(result.id, result)
}

export { getDeckStyle }
