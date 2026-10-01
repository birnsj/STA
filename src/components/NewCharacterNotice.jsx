export default function NewCharacterNotice({ savedCount, onContinue, onCancel }) {
  const plural = savedCount === 1 ? '' : 's'
  return (
    <div className="menu-notice-backdrop">
      <div className="ship-builder-panel menu-notice" role="alertdialog" aria-modal="true" aria-labelledby="new-character-notice-title">
        <h2 id="new-character-notice-title" className="menu-notice-title">New Character</h2>
        <p className="menu-notice-text">
          You already have {savedCount} saved character{plural}. Starting a new character will not replace {savedCount === 1 ? 'it' : 'them'};
          every confirmed character stays saved.
        </p>
        <div className="menu-notice-actions">
          <button type="button" className="nav-button nav-back" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="nav-button nav-next" onClick={onContinue} autoFocus>
            Create New Character →
          </button>
        </div>
      </div>
    </div>
  )
}
