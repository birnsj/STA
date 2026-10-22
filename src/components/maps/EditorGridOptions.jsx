import { EDITOR_GRID_SIZES } from './editorGrid.js'

// Floating grid options popover. Guide grid, map boundary and centre overlays (view-only for bounds/centre).

export default function EditorGridOptions({
  show,
  onClose,
  showGrid,
  onShowGrid,
  gridSize,
  onGridSize,
  showBounds = true,
  onShowBounds,
  showCentre = false,
  onShowCentre,
}) {
  if (!show) return null
  return (
    <div className="ed-grid-options" role="dialog" aria-label="Grid options">
      <div className="ed-grid-options-head">
        <span>Grid Options</span>
        <button type="button" className="me-button" onClick={onClose}>
          Close
        </button>
      </div>
      <label className="me-check">
        <input type="checkbox" checked={showGrid} onChange={(event) => onShowGrid(event.target.checked)} />
        Show tile grid
      </label>
      <label className="me-check">
        <input type="checkbox" checked={showBounds} onChange={(event) => onShowBounds?.(event.target.checked)} />
        Show map boundary
      </label>
      <label className="me-check">
        <input type="checkbox" checked={showCentre} onChange={(event) => onShowCentre?.(event.target.checked)} />
        Show map centre
      </label>
      <p className="me-text">Spacing in world pixels. Ground items snap to this size (64 = one tile; 8 = fine item grid).</p>
      <label className="me-field">
        Grid size
        <select className="me-select me-wide" value={gridSize} onChange={(event) => onGridSize(Number(event.target.value))}>
          {EDITOR_GRID_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}px {size === 64 ? '(tile)' : size === 8 ? '(fine items)' : ''}
            </option>
          ))}
        </select>
      </label>
      <p className="me-text is-muted">Guide lines align with item snap points. Elevation guides are not implemented yet.</p>
    </div>
  )
}
