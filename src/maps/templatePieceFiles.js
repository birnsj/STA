// Dev map editor: saves Template Piece cover / fade / layer / emissive / emitColour into templatePieces.json via /__templates.
// Delete removes the piece + orphan art.
import { requestJson } from '../files/jsonHttp.js'
import {
  removeTemplatePieceLocal,
  setTemplateOverlayEmitColourLocal,
  setTemplateOverlayEmissiveLocal,
  setTemplatePieceFlagLocal,
  setTemplatePieceLayerLocal,
} from './templatePieces.js'

export const canEditTemplatePieces = import.meta.env.DEV

export async function deleteTemplatePiece(id) {
  if (!canEditTemplatePieces) throw new Error('Deleting Template Pieces needs the Vite DEV server.')
  const result = await requestJson('/__templates', 'PUT', { id, delete: true })
  removeTemplatePieceLocal(id)
  return result
}

export async function setTemplatePieceFlag(id, flag, value) {
  setTemplatePieceFlagLocal(id, flag, value)
  if (!canEditTemplatePieces) return value
  await requestJson('/__templates', 'PUT', { id, [flag]: value })
  return value
}

export async function setTemplatePieceLayer(id, layer) {
  setTemplatePieceLayerLocal(id, layer)
  if (!canEditTemplatePieces) return layer
  await requestJson('/__templates', 'PUT', { id, layer })
  return layer
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
