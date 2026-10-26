import { useState } from 'react'

export default function ImportShipDialog({ ships, onLoad, onDelete, onCancel }) {
  const [pendingId, setPendingId] = useState(null)
  return (
    <div className="menu-notice-backdrop">
      <div className="ship-builder-panel menu-notice ship-import" role="dialog" aria-modal="true" aria-labelledby="import-ship-title">
        <h2 id="import-ship-title" className="menu-notice-title">Import Ship</h2>
        <ul className="ship-import-list">
          {ships.map((entry) => (
            <li key={entry.id} className="ship-import-row">
              <span>{entry.name || 'Unnamed ship'}</span>
              <button type="button" className="nav-button nav-next" onClick={() => onLoad(entry)}>
                Load
              </button>
              <button
                type="button"
                className="nav-button nav-back"
                onClick={() => {
                  if (pendingId === entry.id) onDelete(entry.id)
                  else setPendingId(entry.id)
                }}
              >
                {pendingId === entry.id ? 'Remove' : 'Delete'}
              </button>
            </li>
          ))}
        </ul>
        <div className="menu-notice-actions">
          <button type="button" className="nav-button nav-back" onClick={onCancel} autoFocus>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
