import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import { getTimeframeById, getTimeframes } from '../../ships/shipModel.js'

const INTRO = 'Choose the era in which your starship serves. Your choice determines which ship classes are available, and may affect available options, refits, and equipment.'

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

  return (
    <section className="screen timeframe-screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className="screen-heading">{step.title}</h1>
          <p className="screen-intro">
            {INTRO}
            <span className="source-ref">Star Trek Adventures 2E Core Rulebook, pp. 192–193</span>
          </p>
        </div>
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
        <ShipArt src={selected ? `/art/ships/eras/${selected.id}.png` : null} alt="" className="timeframe-detail-art" />
        <div className="timeframe-detail-text">
          <h2 className="timeframe-detail-name">{selected?.name ?? 'No timeframe selected'}</h2>
          {selected?.summary && <p>{selected.summary}</p>}
        </div>
      </div>

      <div className="timeframe-panels">
        <section className="panel timeframe-panel">
          <h3 className="panel-heading">Era Overview</h3>
          {selected?.overview && <p>{selected.overview}</p>}
        </section>
        <section className="panel timeframe-panel">
          <h3 className="panel-heading">Key Characteristics</h3>
          <BulletList items={selected?.characteristics} />
        </section>
        <section className="panel timeframe-panel">
          <h3 className="panel-heading">Considerations</h3>
          <BulletList items={selected?.considerations} />
        </section>
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
