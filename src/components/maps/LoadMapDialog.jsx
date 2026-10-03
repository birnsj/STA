import { useEffect } from 'react'

// The map editor's Load list: every map file in maps/. currentId marks the file being edited.
export default function LoadMapDialog({ maps, currentId, onLoad, onCancel }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="me-dialog-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="me-dialog" role="dialog" aria-modal="true" aria-labelledby="me-load-title">
        <p id="me-load-title" className="me-heading">
          Load Map
        </p>
        {maps.length ? (
          <ul className="me-load-list">
            {maps.map((entry) => (
              <li key={entry.id}>
                <button type="button" className={`me-tool${entry.id === currentId ? ' is-selected' : ''}`} onClick={() => onLoad(entry.id)}>
                  <span className="me-load-name">{entry.name}</span>
                  <span className="me-load-file">maps/{entry.id}.json</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="me-text">No saved maps yet.</p>
        )}
        <div className="me-dialog-actions">
          <button type="button" className="me-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
