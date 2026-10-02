import DevButtons from './DevButtons.jsx'

export default function ScreenFooter({ onBack, onQuit, onNext, onClear, nextLabel, canGoBack, canGoNext, canShowSummary, onShowSummary, showAuto, canAuto, onAuto }) {
  return (
    <footer className="screen-footer">
      <div className="footer-back">
        <button type="button" className="nav-button nav-back" onClick={onBack} disabled={!canGoBack}>
          ← Back
        </button>
        {onQuit && (
          <button type="button" className="nav-button nav-quit" onClick={onQuit} title="Return to the Main Menu.">
            Quit
          </button>
        )}
      </div>
      <DevButtons onClear={onClear} />
      <div className="footer-forward">
        {showAuto && (
          <button
            type="button"
            className="nav-button nav-auto"
            onClick={onAuto}
            disabled={!canAuto}
            title={canAuto ? 'Replace every choice on this screen with a random valid one.' : 'Complete the earlier screens first.'}
          >
            Auto
          </button>
        )}
        {canShowSummary && (
          <button type="button" className="nav-button nav-summary" onClick={onShowSummary}>
            Summary
          </button>
        )}
        <button type="button" className="nav-button nav-next" onClick={onNext} disabled={!canGoNext}>
          {nextLabel} →
        </button>
      </div>
    </footer>
  )
}
