import { downloadJson } from '../../export/downloadJson.js'

// Same control row as the character creator footer. These buttons act on the ship, not the character.
export default function ShipScreenFooter({
  ship,
  onBack,
  onQuit,
  onClear,
  onAuto,
  onAutofill,
  onShowSummary,
  canShowSummary,
  showAuto = true,
  autoDisabled = false,
  autoTitle = 'Choose an era at random.',
  nextLabel = 'Next: Spaceframe →',
  nextDisabled = false,
  onNext,
}) {
  return (
    <footer className="screen-footer">
      <div className="footer-back">
        <button type="button" className="nav-button nav-back" onClick={onBack}>
          ← Back
        </button>
        {onQuit && (
          <button type="button" className="nav-button nav-quit" onClick={onQuit} title="Return to the Main Menu.">
            Quit
          </button>
        )}
      </div>
      <div className="dev-buttons" role="group" aria-label="Developer tools">
        <span className="dev-buttons-tag">Dev</span>
        <button type="button" className="dev-button" onClick={onAutofill}>
          Autofill
        </button>
        <button type="button" className="dev-button" onClick={onClear}>
          Clear
        </button>
        <button type="button" className="dev-button" onClick={() => downloadJson(ship, 'starship.json')}>
          Export JSON
        </button>
      </div>
      <div className="footer-forward">
        {showAuto && (
          <button
            type="button"
            className="nav-button nav-auto"
            onClick={onAuto}
            disabled={autoDisabled}
            title={autoDisabled ? 'Complete the earlier screens first.' : autoTitle}
          >
            Auto
          </button>
        )}
        {canShowSummary && (
          <button type="button" className="nav-button nav-summary" onClick={onShowSummary}>
            Summary
          </button>
        )}
        <button type="button" className="nav-button nav-next" onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
        </button>
      </div>
    </footer>
  )
}
