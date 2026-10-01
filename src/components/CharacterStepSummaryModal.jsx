import { useEffect } from 'react'
import Portrait from './Portrait.jsx'

// Step Complete report for screens 1-7. Renders the plain data from rules/stepSummary.js; it calculates nothing.
// Fixed outer size (see .step-summary in styles.css); only the content area scrolls.

const signed = (value) => (value > 0 ? `+${value}` : value < 0 ? `\u2212${-value}` : '\u00b10')

function changeSentence({ name, delta, after }) {
  if (delta > 0) return `This step added ${signed(delta)} ${name}. Your ${name} is now ${after}.`
  if (delta < 0) return `This step lowered ${name} by ${-delta}. Your ${name} is now ${after}.`
  return `${name} stays at ${after}.`
}

function Concept({ concept }) {
  return (
    <p className="summary-concept">
      {concept.text} {concept.source && <cite>{concept.source}</cite>}
    </p>
  )
}

function ScoreChanges({ title, concept, rows }) {
  if (!rows.length) return null
  return (
    <div className="summary-block">
      <h4 className="summary-block-heading">{title}</h4>
      <Concept concept={concept} />
      <ul className="summary-changes">
        {rows.map((row, index) => (
          <li key={row.id} className="summary-change">
            <div className="summary-change-line">
              <span className="summary-change-name">{row.name}</span>
              <span className="summary-change-numbers">
                {row.before} <span className="summary-arrow">→</span> <strong>{row.after}</strong>
              </span>
              <span className={`summary-delta${row.delta < 0 ? ' is-negative' : ''}`} style={{ '--delay': `${150 + index * 120}ms` }}>
                {signed(row.delta)}
              </span>
            </div>
            <p className="summary-change-total">{changeSentence(row)}</p>
            {row.reasons.map((reason) => (
              <p key={reason} className="summary-change-reason">{reason}</p>
            ))}
            <p className="summary-change-description">
              <span className="summary-term">{row.name}:</span> {row.description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Additions({ title, concept, items, quote = false }) {
  if (!items.length) return null
  return (
    <div className="summary-block">
      <h4 className="summary-block-heading">{title}</h4>
      <Concept concept={concept} />
      <ul className="summary-additions">
        {items.map((item, index) => (
          <li key={`${item.text}-${index}`} className="summary-addition">
            <p className="summary-addition-text">
              <span className="summary-plus">+</span> {quote ? `\u201c${item.text}\u201d` : item.text}
              {item.custom && <span className="summary-tag">your own</span>}
            </p>
            <p className="summary-change-reason">{item.reason}</p>
            {item.bookText && <p className="summary-book-text">{item.bookText}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChangeGroup({ group, concepts }) {
  return (
    <div className={`summary-group${group.title ? ' is-titled' : ''}`}>
      {group.title && (
        <div className="summary-group-header">
          {group.image && <Portrait label={group.image.label} image={group.image.src} className="summary-portrait-small" />}
          <div>
            <p className="summary-group-kicker">{group.title}</p>
            <h4 className="summary-group-title">{group.subtitle}</h4>
            {group.text && (
              <p className="summary-group-text">
                <span className="summary-term">What happened:</span> {group.text} {group.source && <cite>{group.source}</cite>}
              </p>
            )}
          </div>
        </div>
      )}
      <ScoreChanges title="Attributes" concept={concepts.attribute} rows={group.attributes} />
      <ScoreChanges title="Disciplines" concept={concepts.discipline} rows={group.disciplines} />
      <Additions title="Values" concept={concepts.value} items={group.values} quote />
      <Additions title="Focuses" concept={concepts.focus} items={group.focuses} />
      <Additions title="Traits" concept={concepts.trait} items={group.traits} />
    </div>
  )
}

function Checklist({ checklist }) {
  return (
    <section className="summary-section">
      <h3 className="summary-section-heading">Character Build Status</h3>
      <ul className="summary-checklist">
        {checklist.rows.map((row) => (
          <li key={row.label} className={`summary-check${row.ok ? ' is-ok' : ' is-bad'}`}>
            <span className="summary-check-mark" aria-hidden="true">{row.ok ? '\u2713' : '\u2717'}</span>
            <span className="summary-check-label">{row.label}</span>
            <span className="summary-check-detail">{row.detail}</span>
          </li>
        ))}
      </ul>
      {checklist.source && <cite className="summary-section-source">{checklist.source}</cite>}
    </section>
  )
}

function SnapshotScores({ title, scores }) {
  return (
    <div className="summary-snapshot-block">
      <h4 className="summary-block-heading">{title}</h4>
      <ul className="summary-snapshot-scores">
        {scores.map((score) => (
          <li key={score.id} className="summary-snapshot-score">
            <span className="summary-snapshot-name">{score.name}</span>
            <strong className="summary-snapshot-value">{score.score}</strong>
            <span className="summary-snapshot-sources">
              Start {score.start}
              {score.sources.map((source, index) => (
                <span key={index}> · {source.label} {signed(source.value)}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SnapshotList({ title, items, quote = false }) {
  if (!items.length) return null
  return (
    <div className="summary-snapshot-block">
      <h4 className="summary-block-heading">
        {title} <span className="summary-count">({items.length})</span>
      </h4>
      <ul className="summary-snapshot-list">
        {items.map((item, index) => (
          <li key={`${item.text}-${index}`}>
            {quote ? `\u201c${item.text}\u201d` : item.text} <span className="summary-snapshot-source">{item.source}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Snapshot({ snapshot }) {
  return (
    <section className="summary-section summary-snapshot">
      <h3 className="summary-section-heading">Your Character So Far</h3>
      <SnapshotScores title="Attributes" scores={snapshot.attributes} />
      <SnapshotScores title="Disciplines" scores={snapshot.disciplines} />
      <div className="summary-snapshot-lists">
        <SnapshotList title="Values" items={snapshot.values} quote />
        <SnapshotList title="Focuses" items={snapshot.focuses} />
        <SnapshotList title="Traits" items={snapshot.traits.map((text) => ({ text, source: 'Species' }))} />
      </div>
    </section>
  )
}

export default function CharacterStepSummaryModal({ summary, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="step-summary-overlay">
      <section className="step-summary" role="dialog" aria-modal="true" aria-labelledby="step-summary-title">
        <header className="step-summary-header">
          <p className="step-summary-kicker">Step Complete · Character Development Summary</p>
          <h2 id="step-summary-title" className="step-summary-title">
            <span className="step-summary-number">{summary.number}</span> {summary.title}
          </h2>
          <p className="step-summary-grants">
            <span className="summary-term">{summary.bookStep}:</span> {summary.grants} {summary.grantsSource && <cite>{summary.grantsSource}</cite>}
          </p>
        </header>

        <div className="step-summary-content">
          <section className="summary-section summary-intro">
            {summary.image && <Portrait label={summary.image.label} image={summary.image.src} className="summary-portrait" />}
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
              {summary.meaning.length > 0 && (
                <>
                  <h3 className="summary-section-heading">What This Means</h3>
                  {summary.meaning.map((item) => (
                    <p key={item.title} className="summary-meaning">
                      <span className="summary-term">{item.title}:</span> {item.text} {item.source && <cite>{item.source}</cite>}
                    </p>
                  ))}
                </>
              )}
            </div>
          </section>

          <section className="summary-section">
            <h3 className="summary-section-heading">How This Changed Your Character</h3>
            <p className="summary-concept">
              {summary.cumulative.text} {summary.cumulative.source && <cite>{summary.cumulative.source}</cite>}
            </p>
            {summary.groups.map((group, index) => (
              <ChangeGroup key={index} group={group} concepts={summary.concepts} />
            ))}
          </section>

          {summary.checklist && <Checklist checklist={summary.checklist} />}

          <section className="summary-section">
            <h3 className="summary-section-heading">Why This Matters</h3>
            {summary.why.map((paragraph) => (
              <p key={paragraph} className="summary-why">{paragraph}</p>
            ))}
          </section>

          <Snapshot snapshot={summary.snapshot} />

          {summary.closing && <p className="summary-closing">{summary.closing}</p>}
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
