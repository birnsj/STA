import { useEffect } from 'react'
import ShipArt from './ShipArt.jsx'

// Same shell and Close guide target as CharacterStepSummaryModal; content comes from shipStepSummary.js.
export default function ShipStepSummaryModal({ summary, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (!summary) return null

  return (
    <div className="step-summary-overlay" role="presentation" onClick={onClose}>
      <section
        className="step-summary"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ship-step-summary-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="step-summary-header">
          <h2 id="ship-step-summary-title" className="step-summary-title">
            <span>Summary</span>
            <span className="step-summary-step">
              <span className="step-summary-number">{summary.number}</span> {summary.title}
            </span>
          </h2>
          <p className="step-summary-kicker">{summary.kicker}</p>
          {summary.grants && (
            <p className="step-summary-grants">
              <span className="summary-term">{summary.bookStep}:</span> {summary.grants}
              {summary.grantsSource && <cite> {summary.grantsSource}</cite>}
            </p>
          )}
        </header>

        <div className="step-summary-content">
          <section className="summary-section summary-intro">
            {summary.imageSrc && (
              <ShipArt src={summary.imageSrc} alt="" className="summary-portrait" />
            )}
            <div className="summary-intro-text">
              <h3 className="summary-section-heading">What You Chose</h3>
              <dl className="summary-choices">
                {summary.choices.map((choice) => (
                  <div key={choice.label} className="summary-choice">
                    <dt>{choice.label}</dt>
                    <dd>{choice.value || '\u2014'}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {summary.meaning?.length > 0 && (
            <section className="summary-section">
              <h3 className="summary-section-heading">What This Means</h3>
              {summary.meaning.map((item) => (
                <p key={item.title} className="summary-meaning">
                  <span className="summary-term">{item.title}:</span> {item.text}
                </p>
              ))}
            </section>
          )}

          {summary.why?.length > 0 && (
            <section className="summary-section">
              <h3 className="summary-section-heading">Why This Matters</h3>
              {summary.why.map((paragraph) => (
                <p key={paragraph} className="summary-why">{paragraph}</p>
              ))}
            </section>
          )}
        </div>

        <footer className="step-summary-footer">
          <p className="step-summary-hint">Read the report, then close it. You stay on this screen; press Next when you are ready.</p>
          <button type="button" className="nav-button step-summary-close" onClick={onClose} autoFocus>
            Close
          </button>
        </footer>
      </section>
    </div>
  )
}
