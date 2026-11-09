import { EDITOR_VIEW_SCALES } from '../../maps/editorViewScale.js'

// Floating View → View scale popover (same shell as Grid Options).

export default function EditorViewScale({ show, onClose, viewScale, onViewScale }) {
  if (!show) return null
  return (
    <div className="ed-grid-options" role="dialog" aria-label="View scale">
      <div className="ed-grid-options-head">
        <span>View Scale</span>
        <button type="button" className="me-button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="me-text">Enlarge the editor UI. Higher values help on smaller screens.</p>
      <div className="ed-seg" role="group" aria-label="View scale">
        {EDITOR_VIEW_SCALES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`me-button${viewScale === entry.id ? ' is-on' : ''}`}
            aria-pressed={viewScale === entry.id}
            title={entry.hint}
            onClick={() => onViewScale(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  )
}
