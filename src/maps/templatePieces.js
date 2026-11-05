// Catalogue of modular Template Pieces (fractional overlays; not tiles). Presentation + editor placement only.
import catalogue from '../data/adaptation/maps/templatePieces.json'

export const TEMPLATE_PIECES = catalogue.pieces ?? []
const BY_ID = new Map(TEMPLATE_PIECES.map((piece) => [piece.id, piece]))

export const getTemplatePiece = (id) => BY_ID.get(id) ?? null

export const templatePieceIds = () => TEMPLATE_PIECES.map((piece) => piece.id)

export function templatePieceGroups() {
  return [
    {
      id: 'starship-walls',
      label: 'Starship Walls (32 thick)',
      pieces: TEMPLATE_PIECES.filter((piece) => piece.tags?.includes('thick32')),
    },
    {
      id: 'starship-half',
      label: 'Half Bulkheads',
      pieces: TEMPLATE_PIECES.filter((piece) => piece.tags?.includes('halfBulkhead')),
    },
    {
      id: 'starship-floors',
      label: 'Starship Floors',
      pieces: TEMPLATE_PIECES.filter((piece) => piece.tags?.includes('floor')),
    },
    {
      id: 'starship-props',
      label: 'Starship Props',
      pieces: TEMPLATE_PIECES.filter((piece) => piece.tags?.includes('prop')),
    },
  ].filter((group) => group.pieces.length)
}
