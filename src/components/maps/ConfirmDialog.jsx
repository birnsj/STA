import { useEffect } from 'react'

// The map editor's yes / no question (in place of the browser's confirm box). Escape or a click outside cancels.
export default function ConfirmDialog({ title, message, confirmLabel = 'OK', onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="me-dialog-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="me-dialog" role="alertdialog" aria-modal="true" aria-labelledby="me-confirm-title" aria-describedby="me-confirm-text">
        <p id="me-confirm-title" className="me-heading">
          {title}
        </p>
        <p id="me-confirm-text" className="me-text">
          {message}
        </p>
        <div className="me-dialog-actions">
          <button type="button" className="me-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="me-button is-primary" autoFocus onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
