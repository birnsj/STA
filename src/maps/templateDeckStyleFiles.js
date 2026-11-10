// Dev Generator Editor: saves Template Deck style into templateDeckStyle.json via /__template-deck-style.
import { requestJson } from '../files/jsonHttp.js'
import { getTemplateDeckStyle, setTemplateDeckStyleLocal } from './generators/templateDeckStyles.js'

export const canEditTemplateDeckStyle = import.meta.env.DEV

export async function saveTemplateDeckStyle(patch) {
  const next = setTemplateDeckStyleLocal(patch)
  if (!canEditTemplateDeckStyle) return next
  const result = await requestJson('/__template-deck-style', 'PUT', next)
  return setTemplateDeckStyleLocal(result)
}

export { getTemplateDeckStyle }
