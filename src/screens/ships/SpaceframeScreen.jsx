import { useState } from 'react'
import HelpTip from '../../components/HelpTip.jsx'
import { useInfoTip } from '../../components/useInfoTip.js'
import { useWholeCardCarousel } from '../../components/wholeCardCarousel.js'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import { classArt, classViewArts } from '../../ships/shipArtPaths.js'
import { spaceframeTip } from '../../ships/shipInfoTips.js'
import { getEligibleSpaceframes, getSpaceframeById, getSpecialRule } from '../../ships/shipModel.js'

const INTRO = 'Select the ship class for your starship. Eligibility uses your campaign year. Each class brings Scale, traits, and system ratings that form the ship’s baseline.'

const SYSTEMS = [
  ['comms', 'Comms'],
  ['engines', 'Engines'],
  ['structure', 'Structure'],
  ['computers', 'Computers'],
  ['sensors', 'Sensors'],
  ['weapons', 'Weapons'],
]

const DEPARTMENTS = [
  ['command', 'Command'],
  ['conn', 'Conn'],
  ['engineering', 'Engineering'],
  ['security', 'Security'],
  ['science', 'Science'],
  ['medicine', 'Medicine'],
]

const modifier = (value) => (value > 0 ? `+${value}` : '—')

// Display groups for the era's eligible classes. A class can sit in more than one tab. This does not change which class can be chosen.
const FILTERS = [
  ['all', 'All Classes', null],
  ['exploration', 'Exploration', /explorer|pathfinder|reconnaissance/i],
  ['multi', 'Multi-Role', /multirole/i],
  ['science', 'Science', /scientific/i],
  ['support', 'Support', /colony|logistical|crisis|patrol|reserve/i],
  ['specialized', 'Specialized', /tactical|espionage|battlecruiser|technical testbed/i],
]

function matchesFilter(frame, pattern) {
  if (!pattern) return true
  return frame.suggestedMissionProfiles.some((name) => pattern.test(name))
}

// Hero plus four view thumbs. Drop-in PNGs at the same paths replace placeholders.
const VIEW_ANGLES = ['Profile', 'Bow', 'Stern', 'Dorsal', 'Port']

function viewSources(id) {
  return [classArt(id), ...classViewArts(id)]
}

function Stat({ label, value }) {
  return (
    <div className="spaceframe-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export default function SpaceframeScreen({
  step,
  ship,
  onSelect,
  onBack,
  onQuit,
  onClear,
  onAuto,
  onAutofill,
  onShowSummary,
  nextDisabled = false,
  onNext,
}) {
  const frames = getEligibleSpaceframes(ship.timeframeId, ship.campaignYear)
  const selected = getSpaceframeById(ship.spaceframeId)
  const rules = selected ? selected.specialRuleIds.map(getSpecialRule).filter(Boolean) : []
  const [filterId, setFilterId] = useState('all')
  const [viewIndex, setViewIndex] = useState(0)
  const filter = FILTERS.find((entry) => entry[0] === filterId) ?? FILTERS[0]
  const shown = frames.filter((frame) => matchesFilter(frame, filter[2]))
  const { carouselRef, trackRef, fits, scroll } = useWholeCardCarousel(shown.length, 196, 8)
  const views = selected ? viewSources(selected.id) : []
  const preview = views[viewIndex] ?? null
  const year = Number.isFinite(ship.campaignYear) ? ship.campaignYear : null
  const tip = useInfoTip()

  const choose = (id) => {
    setViewIndex(0)
    onSelect(id)
  }

  return (
    <section className="screen spaceframe-screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className="screen-heading"><HelpTip helpId="spaceframeScreen">{step.title}</HelpTip></h1>
          <p className="screen-intro">
            {INTRO}
            {year != null && (
              <span className="spaceframe-year-note"> Campaign year {year}.</span>
            )}
            <span className="source-ref">Star Trek Adventures 2E Core Rulebook, pp. 195–211</span>
          </p>
        </div>
      </div>

      <div className="spaceframe-filters" role="toolbar" aria-label="Class filters">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`spaceframe-filter${id === filterId ? ' is-selected' : ''}`}
            aria-pressed={id === filterId}
            onClick={() => setFilterId(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="carousel spaceframe-carousel" ref={carouselRef}>
        {!fits && (
          <button type="button" className="carousel-arrow" onClick={() => scroll(-1)} aria-label="Scroll classes left">‹</button>
        )}
        <div className="carousel-track spaceframe-cards" ref={trackRef} role="listbox" aria-label="Spaceframe">
        {shown.map((frame) => {
          const isSelected = frame.id === ship.spaceframeId
          return (
            <button
              key={frame.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`spaceframe-card help-tip${isSelected ? ' is-selected' : ''}`}
              onClick={() => choose(frame.id)}
              {...tip.bind(spaceframeTip(frame))}
            >
              <ShipArt src={classArt(frame.id)} alt="" className="spaceframe-card-art" />
              <span className="spaceframe-card-name">{frame.name}</span>
              <span className="spaceframe-card-line">{frame.suggestedMissionProfiles[0]}</span>
            </button>
          )
        })}
        </div>
        {!fits && (
          <button type="button" className="carousel-arrow" onClick={() => scroll(1)} aria-label="Scroll classes right">›</button>
        )}
        {tip.element}
      </div>

      <div className="spaceframe-detail">
        <div className="spaceframe-preview">
          <ShipArt src={preview} alt="" className="spaceframe-preview-art" />
          <div className="spaceframe-views" role="group" aria-label="View angle">
            {(views.length ? views : VIEW_ANGLES.map(() => null)).map((src, index) => {
              const angle = VIEW_ANGLES[index] ?? `View ${index + 1}`
              return (
                <button
                  key={src ?? `empty-${index}`}
                  type="button"
                  className={`spaceframe-view${src && index === viewIndex ? ' is-selected' : ''}`}
                  aria-pressed={Boolean(src && index === viewIndex)}
                  disabled={!src}
                  onClick={() => setViewIndex(index)}
                >
                  {angle}
                </button>
              )
            })}
          </div>
        </div>
        <div className="spaceframe-detail-text">
          <h2 className="spaceframe-detail-name">{selected ? `${selected.name} class` : 'No spaceframe selected'}</h2>
          {selected && <p className="spaceframe-overview">{selected.overview}</p>}
          {selected && <p className="source-ref">Star Trek Adventures 2E Core Rulebook, p. {selected.page}</p>}
          {selected && (
            <>
              <h3 className="spaceframe-stats-heading">Class Characteristics</h3>
              <dl className="spaceframe-stats">
              <Stat label="Launch year" value={selected.launchYear} />
              <Stat label="Scale" value={selected.scale} />
              <Stat label="Traits" value={selected.traits?.join(', ') || '—'} />
              {SYSTEMS.map(([key, label]) => (
                <Stat key={key} label={label} value={selected.systems[key]} />
              ))}
              {DEPARTMENTS.map(([key, label]) => (
                <Stat key={key} label={`${label} modifier`} value={modifier(selected.departmentModifiers[key])} />
              ))}
              </dl>
            </>
          )}
        </div>
      </div>

      <div className="spaceframe-panels">
        <section className="panel spaceframe-panel">
          <h3 className="panel-heading"><HelpTip helpId="spaceframeCapabilities">Primary Capabilities</HelpTip></h3>
          {selected && (
            <div className="spaceframe-panel-body">
              <ul className="spaceframe-list">
                {selected.weapons.map((weapon) => (
                  <li key={weapon}>{weapon}</li>
                ))}
              </ul>
              <p>{selected.capabilities}</p>
            </div>
          )}
        </section>
        <section className="panel spaceframe-panel">
          <h3 className="panel-heading"><HelpTip helpId="spaceframeConsiderations">Considerations</HelpTip></h3>
          {selected && (
            <div className="spaceframe-panel-body">
              <ul className="spaceframe-list">
                {rules.map((rule) => (
                  <li key={rule.id}>
                    <strong>{rule.name}.</strong> {rule.text}
                  </li>
                ))}
              </ul>
              <p>{selected.refits}</p>
            </div>
          )}
        </section>
        <section className="panel spaceframe-panel">
          <h3 className="panel-heading"><HelpTip helpId="spaceframeNotes">Notes</HelpTip></h3>
          {selected && (
            <div className="spaceframe-panel-body">
              <p>{selected.notableExamples}</p>
              <p>{selected.naming}</p>
              <p>Suggested mission profiles: {selected.suggestedMissionProfiles.join(', ')}.</p>
            </div>
          )}
        </section>
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
        autoDisabled={!ship.timeframeId}
        autoTitle="Choose an eligible class at random."
        nextLabel="Next: Mission Profile →"
        nextDisabled={nextDisabled}
        onNext={onNext}
      />
    </section>
  )
}
