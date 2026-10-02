import AutofillButton from './AutofillButton.jsx'
import ClearButton from './ClearButton.jsx'
import ExportButton from './ExportButton.jsx'

export default function ScreenFooter({ onBack, onNext, onClear, nextLabel, canGoBack, canGoNext, canShowSummary, onShowSummary, showAuto, canAuto, onAuto }) {
  return (
    <footer className="screen-footer">
      <button type="button" className="nav-button nav-back" onClick={onBack} disabled={!canGoBack}>
        ← Back
      </button>
      <div className="dev-buttons">
        <AutofillButton />
        <ClearButton onClear={onClear} />
        <ExportButton />
      </div>
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
