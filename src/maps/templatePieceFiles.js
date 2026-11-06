// Dev map editor: saves Template Piece cover / fade / emissive / emitColour into templatePieces.json via /__templates.
import { requestJson } from '../files/jsonHttp.js'
import {
  setTemplateOverlayEmitColourLocal,
  setTemplateOverlayEmissiveLocal,
  setTemplatePieceFlagLocal,
} from './templatePieces.js'

export const canEditTemplatePieces = import.meta.env.DEV

export async function setTemplatePieceFlag(id, flag, value) {
  setTemplatePieceFlagLocal(id, flag, value)
  if (!canEditTemplatePieces) return value
  await requestJson('/__templates', 'PUT', { id, [flag]: value })
  return value
}

export async function setTemplateOverlayEmissive(id, value) {
  const next = setTemplateOverlayEmissiveLocal(id, value)
  if (!canEditTemplatePieces) return next
  await requestJson('/__templates', 'PUT', { id, emissive: next })
  return next
}

export async function setTemplateOverlayEmitColour(id, colour) {
  const next = setTemplateOverlayEmitColourLocal(id, colour)
  if (!canEditTemplatePieces) return next
  await requestJson('/__templates', 'PUT', { id, emitColour: next })
  return next
}
