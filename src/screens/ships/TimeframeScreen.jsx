import { useEffect, useState } from 'react'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import { getTimeframeById, getTimeframes } from '../../ships/shipModel.js'

const INTRO = 'Choose the era in which your starship serves. Your choice determines which ship classes are available, and may affect available options, refits, and equipment.'
const YEAR_NOTE = 'Select the exact year within this era. This may affect available ship classes and options.'
const SOURCE = 'Star Trek Adventures 2E Core Rulebook, pp. 192–193'

// campaignStart/campaignEnd when the era has them. Otherwise the years on the card: "2260s–2270s" is 2260–2270.
function yearSpan(era) {
  if (Number.isFinite(era?.campaignStart) && Number.isFinite(era?.campaignEnd)) {
    return { start: era.campaignStart, end: era.campaignEnd }
  }
  const nums = [...(era?.years ?? '').matchAll(/\d{4}/g)].map((match) => Number(match[0]))
  if (nums.length < 2) return null
  return { start: nums[0], end: nums[1] }
}

function defaultYear(span) {
  return Math.round((span.start + span.end) / 2)
}

function BulletList({ items }) {
  if (!items?.length) return null
  return (
    <ul className="timeframe-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

export default function TimeframeScreen({ step, ship, onSelect, onBack, onClear, onAuto, onAutofill, onShowSummary, onNext }) {
  const eras = getTimeframes()
  const selected = getTimeframeById(ship.timeframeId)
  const span = yearSpan(selected)
  // The shown year is not part of the ship. A year that still falls in the next era stays; otherwise that era's default is used.
  const [pickedYear, setPickedYear] = useState(null)
  useEffect(() => {
    if (!span) return
    setPickedYear((current) => (current != null && current >= span.start && current <= span.end ? current : defaultYear(span)))
  }, [selected?.id, span?.start, span?.end])
  const year = span ? (pickedYear != null && pickedYear >= span.start && pickedYear <= span.end ? pickedYear : defaultYear(span)) : null

  return (
    <section className="screen timeframe-screen">
      <div className="screen-title">
        <div className="timeframe-heading">
          <span className="screen-number">{step.number}</span>
          <h1 className="screen-heading">{step.title}</h1>
        </div>
        <p className="screen-intro">
          {INTRO}
          <span className="source-ref">{SOURCE}</span>
        </p>
      </div>

      <div className="timeframe-eras" role="listbox" aria-label="Timeframe">
        {eras.map((era) => {
          const isSelected = era.id === ship.timeframeId
          return (
            <button
              key={era.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`timeframe-era${isSelected ? ' is-selected' : ''}`}
              onClick={() => onSelect(era.id)}
            >
              <ShipArt src={`/art/ships/eras/${era.id}.png`} alt="" className="timeframe-era-art" />
              <span className="timeframe-era-name">{era.name}</span>
              <span className="timeframe-era-years">{era.years}</span>
            </button>
          )
        })}
      </div>

      <div className="timeframe-detail panel">
        <ShipArt src={selected ? `/art/ships/eras/${selected.id}.png` : '/art/ships/summary.png'} alt="" className="timeframe-detail-art" />
        <div className="timeframe-detail-text">
          <h2 className="timeframe-detail-name">{selected?.name ?? 'No timeframe selected'}</h2>
          {selected?.summary && <p>{selected.summary}</p>}
          {selected?.summary && <p className="source-ref">{SOURCE}</p>}
        </div>
      </div>

      <div className="timeframe-panels">
        <section className="panel timeframe-panel">
          <h3 className="panel-heading">Era Details</h3>
          <div className="timeframe-panel-body">
            <ShipArt src={selected ? `/art/ships/eras/${selected.id}-details.png` : '/art/ships/eras/details.png'} alt="" className="timeframe-panel-art" />
            <div className="timeframe-panel-text">
              {selected?.overview && <p>{selected.overview}</p>}
            </div>
          </div>
        </section>
        <section className="panel timeframe-panel">
          <h3 className="panel-heading">Key Characteristics</h3>
          <div className="timeframe-panel-body">
            <ShipArt src={selected ? `/art/ships/eras/${selected.id}-characteristics.png` : '/art/ships/eras/characteristics.png'} alt="" className="timeframe-panel-art" />
            <div className="timeframe-panel-text">
              <BulletList items={selected?.characteristics} />
            </div>
          </div>
        </section>
      </div>

      <div className="timeframe-year panel">
        <div className="timeframe-year-copy">
          <h3 className="panel-heading">Campaign Year</h3>
          <p>{YEAR_NOTE}</p>
        </div>
        <div className="timeframe-year-control">
          <button
            type="button"
            className="timeframe-year-button"
            aria-label="Earlier year"
            disabled={!span || year <= span.start}
            onClick={() => setPickedYear(year - 1)}
          >
            −
          </button>
          <span className="timeframe-year-value">{year ?? '—'}</span>
          <button
            type="button"
            className="timeframe-year-button"
            aria-label="Later year"
            disabled={!span || year >= span.end}
            onClick={() => setPickedYear(year + 1)}
          >
            +
          </button>
          <span className="timeframe-year-range">{span ? `Range: ${span.start} – ${span.end}` : 'Range: —'}</span>
        </div>
      </div>

      <ShipScreenFooter
        ship={ship}
        onBack={onBack}
        onClear={onClear}
        onAuto={onAuto}
        onAutofill={onAutofill}
        onShowSummary={onShowSummary}
        canShowSummary={Boolean(selected)}
        onNext={onNext}
      />
    </section>
  )
}
