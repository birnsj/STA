import HelpTip from '../../components/HelpTip.jsx'
import { useInfoTip } from '../../components/useInfoTip.js'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import { eraArt, shipSummaryArt } from '../../ships/shipArtPaths.js'
import { eraTip } from '../../ships/shipInfoTips.js'
import {
  allCampaignYearSpan,
  getTimeframeById,
  getTimeframes,
  timeframeYearSpan,
} from '../../ships/shipModel.js'

const INTRO = 'Choose the era of play. That choice sets which spaceframes are available. Then set the campaign year — it decides class eligibility and how many refits the ship earns (Core p. 193).'
const YEAR_NOTE = 'Campaign year is required for spaceframe eligibility and refit decades. Classes that launch after this year are not offered.'
const SOURCE = 'Star Trek Adventures 2E Core Rulebook, pp. 192–193'

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

export default function TimeframeScreen({
  step,
  ship,
  onSelect,
  onYear,
  onBack,
  onQuit,
  onClear,
  onAuto,
  onAutofill,
  onShowSummary,
  nextDisabled = false,
  onNext,
}) {
  const eras = getTimeframes()
  const selected = getTimeframeById(ship.timeframeId)
  const span = timeframeYearSpan(selected)
  const globalSpan = allCampaignYearSpan()
  const year = Number.isFinite(ship.campaignYear) ? ship.campaignYear : null
  const tip = useInfoTip()
  const atStart = !globalSpan || year == null || year <= globalSpan.start
  const atEnd = !globalSpan || year == null || year >= globalSpan.end

  return (
    <section className="screen timeframe-screen">
      <div className="screen-title">
        <div className="screen-title-heading">
          <span className="screen-number">{step.number}</span>
          <h1 className={`screen-heading${selected ? '' : ' is-missing'}`}>
            <HelpTip helpId="timeframeScreen">{step.title}</HelpTip>
          </h1>
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
              className={`timeframe-era help-tip${isSelected ? ' is-selected' : ''}`}
              onClick={() => onSelect(era.id)}
              {...tip.bind(eraTip(era))}
            >
              <ShipArt src={eraArt(era.id)} alt="" className="timeframe-era-art" />
              <span className="timeframe-era-name">{era.name}</span>
              <span className="timeframe-era-years">{era.years}</span>
            </button>
          )
        })}
        {tip.element}
      </div>

      <div className="timeframe-detail panel">
        <ShipArt src={selected ? eraArt(selected.id) : shipSummaryArt()} alt="" className="timeframe-detail-art" />
        <div className="timeframe-detail-text">
          <h2 className="timeframe-detail-name">{selected?.name ?? 'No timeframe selected'}</h2>
          {selected?.summary && <p>{selected.summary}</p>}
          {selected?.summary && <p className="source-ref">{SOURCE}</p>}
        </div>
      </div>

      <div className="timeframe-panels">
        <section className="panel timeframe-panel">
          <h3 className="panel-heading"><HelpTip helpId="timeframeEraDetails">Era Details</HelpTip></h3>
          <div className="timeframe-panel-body">
            <ShipArt src={eraArt(selected?.id, 'details')} alt="" className="timeframe-panel-art" />
            <div className="timeframe-panel-text">
              {selected?.overview && <p>{selected.overview}</p>}
            </div>
          </div>
        </section>
        <section className="panel timeframe-panel">
          <h3 className="panel-heading"><HelpTip helpId="timeframeCharacteristics">Key Characteristics</HelpTip></h3>
          <div className="timeframe-panel-body">
            <ShipArt src={eraArt(selected?.id, 'characteristics')} alt="" className="timeframe-panel-art" />
            <div className="timeframe-panel-text">
              <BulletList items={selected?.characteristics} />
            </div>
          </div>
        </section>
      </div>

      <div className="timeframe-year panel">
        <div className="timeframe-year-copy">
          <h3 className="panel-heading"><HelpTip helpId="timeframeCampaignYear">Campaign Year</HelpTip></h3>
          <p>{YEAR_NOTE}</p>
        </div>
        <div className="timeframe-year-control">
          <button
            type="button"
            className="timeframe-year-button"
            aria-label="Earlier year"
            disabled={atStart}
            onClick={() => onYear?.(year - 1)}
          >
            −
          </button>
          <span className="timeframe-year-value">{year ?? '—'}</span>
          <button
            type="button"
            className="timeframe-year-button"
            aria-label="Later year"
            disabled={atEnd}
            onClick={() => onYear?.(year + 1)}
          >
            +
          </button>
          <span className="timeframe-year-range">
            {span ? `Era range: ${span.start} – ${span.end}` : 'Era range: —'}
          </span>
        </div>
      </div>

      <ShipScreenFooter
        ship={ship}
        onBack={onBack}
        onQuit={onQuit}
        onClear={onClear}
        onAuto={onAuto}
        onAutofill={onAutofill}
        onShowSummary={onShowSummary}
        canShowSummary={Boolean(selected)}
        nextLabel="Next: Spaceframe →"
        nextDisabled={nextDisabled}
        onNext={onNext}
      />
    </section>
  )
}
