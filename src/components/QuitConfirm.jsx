export default function QuitConfirm({ onQuit, onCancel }) {
  return (
    <div className="menu-notice-backdrop">
      <div className="ship-builder-panel menu-notice quit-confirm" role="alertdialog" aria-modal="true" aria-labelledby="quit-confirm-title">
        <h2 id="quit-confirm-title" className="menu-notice-title">Quit to Main Menu?</h2>
        <p className="menu-notice-text">Your unfinished character will be lost.</p>
        <div className="menu-notice-actions">
          <button type="button" className="nav-button nav-back" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button type="button" className="nav-button quit-confirm-button" onClick={onQuit}>
            Quit
          </button>
        </div>
      </div>
    </div>
  )
}
