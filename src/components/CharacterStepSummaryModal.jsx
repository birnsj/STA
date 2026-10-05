import { useEffect, useRef } from 'react'
import { getScoreTip } from '../rules/infoTips.js'
import { getConceptHelp } from '../rules/sectionHelp.js'
import HelpTip from './HelpTip.jsx'
import Portrait from './Portrait.jsx'
import { useInfoTip } from './useInfoTip.js'

// Step Complete report for screens 1-7. Renders the plain data from rules/stepSummary.js; it calculates nothing.
// Fixed outer size (see .step-summary in styles.css); only the content area scrolls.

// These steps show portrait-shaped pictures on their own screens; the rest use the wide card shape.
const TALL_PORTRAIT_STEPS = new Set(['species', 'finishingTouches'])

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

function Choices({ choices }) {
  const tip = useInfoTip()
  return (
    <dl className="summary-choices">
      {choices.map((choice) => (
        <div key={choice.label} className={`summary-choice${choice.tip ? ' help-tip' : ''}`} {...tip.bind(choice.tip)}>
          <dt>{choice.label}</dt>
          <dd>{choice.value || '\u2014'}</dd>
        </div>
      ))}
      {tip.element}
    </dl>
  )
}

function BlockHeading({ title, conceptId, children }) {
  return (
    <h4 className="summary-block-heading">
      <HelpTip content={getConceptHelp(conceptId)}>{title}</HelpTip>
      {children}
    </h4>
  )
}

// One row per score; the full sentence, reasons and definition are in the row's hover tip.
function changeTip(row) {
  const scoreTip = getScoreTip(row.id)
  return {
    title: row.name,
    text: row.description,
    sections: [
      { label: 'This step', text: changeSentence(row) },
      ...(row.reasons.length ? [{ label: 'Why', text: row.reasons.join(' ') }] : []),
    ],
    source: scoreTip?.source,
  }
}

function ScoreChanges({ title, conceptId, concept, rows }) {
  const tip = useInfoTip()
  if (!rows.length) return null
  return (
    <div className="summary-block">
      <BlockHeading title={title} conceptId={conceptId} />
      <Concept concept={concept} />
      <ul className="summary-changes">
        {rows.map((row, index) => (
          <li key={row.id} className="summary-change help-tip" {...tip.bind(changeTip(row))}>
            <span className="summary-change-name">{row.name}</span>
            <span className="summary-change-numbers">
              {row.before} <span className="summary-arrow">→</span> <strong>{row.after}</strong>
            </span>
            <span className={`summary-delta${row.delta < 0 ? ' is-negative' : ''}`} style={{ '--delay': `${150 + index * 120}ms` }}>
              {signed(row.delta)}
            </span>
            <span className="summary-change-reason">{row.reasons.join(' ')}</span>
          </li>
        ))}
      </ul>
      {tip.element}
    </div>
  )
}

function Additions({ title, conceptId, concept, items, quote = false }) {
  const tip = useInfoTip()
  if (!items.length) return null
  return (
    <div className="summary-block">
      <BlockHeading title={title} conceptId={conceptId} />
      <Concept concept={concept} />
      <ul className="summary-additions">
        {items.map((item, index) => (
          <li
            key={`${item.text}-${index}`}
            className={`summary-addition${item.bookText ? ' help-tip' : ''}`}
            {...tip.bind(item.bookText ? { title: item.text, text: item.bookText, sections: [{ label: 'Why', text: item.reason }] } : null)}
          >
            <span className="summary-addition-text">
              <span className="summary-plus">+</span> {quote ? `\u201c${item.text}\u201d` : item.text}
              {item.custom && <span className="summary-tag">your own</span>}
            </span>
            <span className="summary-change-reason">{item.reason}</span>
          </li>
        ))}
      </ul>
      {tip.element}
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
      <ScoreChanges title="Attributes" conceptId="attribute" concept={concepts.attribute} rows={group.attributes} />
      <ScoreChanges title="Disciplines" conceptId="discipline" concept={concepts.discipline} rows={group.disciplines} />
      <Additions title="Values" conceptId="value" concept={concepts.value} items={group.values} quote />
      <Additions title="Focuses" conceptId="focus" concept={concepts.focus} items={group.focuses} />
      <Additions title="Traits" conceptId="trait" concept={concepts.trait} items={group.traits} />
      <Additions title="Talent" conceptId="talent" concept={concepts.talent} items={group.talents} />
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

// Single-line bars, like the Character Complete score lists; where the points came from is in the hover tip.
function snapshotTip(score) {
  const scoreTip = getScoreTip(score.id)
  const breakdown = [`Start ${score.start}`, ...score.sources.map((source) => `${source.label} ${signed(source.value)}`)].join(' · ')
  return { title: score.name, text: scoreTip?.text, sections: [{ label: 'Where it comes from', text: breakdown }], source: scoreTip?.source }
}

function SnapshotScores({ title, conceptId, scores }) {
  const tip = useInfoTip()
  return (
    <div className="summary-snapshot-block">
      <BlockHeading title={title} conceptId={conceptId} />
      <ul className="summary-snapshot-scores">
        {scores.map((score) => (
          <li key={score.id} className="summary-snapshot-score help-tip" {...tip.bind(snapshotTip(score))}>
            <span className="summary-snapshot-name">{score.name}</span>
            <strong className="summary-snapshot-value">{score.score}</strong>
          </li>
        ))}
      </ul>
      {tip.element}
    </div>
  )
}

function SnapshotList({ title, conceptId, items, quote = false }) {
  if (!items.length) return null
  return (
    <div className="summary-snapshot-block">
      <BlockHeading title={title} conceptId={conceptId}>
        {' '}<span className="summary-count">({items.length})</span>
      </BlockHeading>
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
      <div className="summary-snapshot-columns">
        <div className="summary-snapshot-column">
          <SnapshotScores title="Attributes" conceptId="attribute" scores={snapshot.attributes} />
          <SnapshotList title="Traits" conceptId="trait" items={snapshot.traits.map((text) => ({ text, source: 'Species' }))} />
          <SnapshotList title="Species Ability" items={snapshot.speciesAbility ? [{ text: snapshot.speciesAbility, source: 'Species' }] : []} />
          <SnapshotList title="Values" conceptId="value" items={snapshot.values} quote />
        </div>
        <div className="summary-snapshot-column">
          <SnapshotScores title="Disciplines" conceptId="discipline" scores={snapshot.disciplines} />
          <SnapshotList title="Focuses" conceptId="focus" items={snapshot.focuses} />
          <SnapshotList title="Talents" conceptId="talent" items={snapshot.talents} />
        </div>
      </div>
    </section>
  )
}

const SHIMMER_GAP_MS = [1500, 5000]
const SHIMMER_DURATION_MS = [700, 1300]
const randomBetween = ([min, max]) => min + Math.random() * (max - min)

// A light sweep across the word at random intervals and speeds, so it reads as a glint rather than a loop.
function ShimmerWord({ children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const element = ref.current
    let timer = null
    const schedule = () => {
      timer = setTimeout(() => {
        element.style.setProperty('--shimmer-duration', `${Math.round(randomBetween(SHIMMER_DURATION_MS))}ms`)
        element.classList.remove('is-shimmering')
        // Reading layout restarts the animation when the class is added back.
        void element.offsetWidth
        element.classList.add('is-shimmering')
        schedule()
      }, randomBetween(SHIMMER_GAP_MS))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])
  return (
    <span ref={ref} className="shimmer-word">
      {children}
    </span>
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
          <h2 id="step-summary-title" className="step-summary-title">
            <ShimmerWord>Summary</ShimmerWord>
            <span className="step-summary-step">
              <span className="step-summary-number">{summary.number}</span> {summary.title}
            </span>
          </h2>
          <p className="step-summary-kicker">Here is what your choices on this screen did to your character, and why.</p>
          <p className="step-summary-grants">
            <span className="summary-term">{summary.bookStep}:</span> {summary.grants} {summary.grantsSource && <cite>{summary.grantsSource}</cite>}
          </p>
        </header>

        <div className="step-summary-content">
          <section className="summary-section summary-intro">
            {summary.image && (
              <Portrait
                label={summary.image.label}
                image={summary.image.src}
                className={`summary-portrait${TALL_PORTRAIT_STEPS.has(summary.stepId) ? ' summary-portrait-tall' : ''}`}
              />
            )}
            <div className="summary-intro-text">
              <h3 className="summary-section-heading">What You Chose</h3>
              <Choices choices={summary.choices} />
            </div>
          </section>

          {summary.meaning.length > 0 && (
            <section className="summary-section">
              <h3 className="summary-section-heading">What This Means</h3>
              {summary.meaning.map((item) => (
                <p key={item.title} className="summary-meaning">
                  <span className="summary-term">{item.title}:</span> {item.text} {item.source && <cite>{item.source}</cite>}
                </p>
              ))}
            </section>
          )}

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
