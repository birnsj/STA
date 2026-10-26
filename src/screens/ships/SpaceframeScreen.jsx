import { useState } from 'react'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import { getEligibleSpaceframes, getSpaceframeById, getSpecialRule } from '../../ships/shipModel.js'

const INTRO = 'Select the ship class for your starship. Only a class that had entered service by the end of your timeframe is offered.'

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

function cardLine(frame) {
  return frame.traits.filter((trait) => !trait.toLowerCase().endsWith(' class')).join(', ')
}

function Stat({ label, value }) {
  return (
    <div className="spaceframe-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export default function SpaceframeScreen({ step, ship, onSelect, onBack, onQuit, onClear, onAuto, onAutofill, onShowSummary, onNext }) {
  const frames = getEligibleSpaceframes(ship.timeframeId)
  const selected = getSpaceframeById(ship.spaceframeId)
  const rules = selected ? selected.specialRuleIds.map(getSpecialRule).filter(Boolean) : []
  const [viewIndex, setViewIndex] = useState(0)
  const views = selected?.views ?? []
  const shownView = views[viewIndex] ?? null
  const preview = shownView ?? (selected ? `/art/ships/classes/${selected.id}.png` : null)

  const choose = (id) => {
    setViewIndex(0)
    onSelect(id)
  }

  return (
    <section className="screen spaceframe-screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className="screen-heading">{step.title}</h1>
          <p className="screen-intro">
            {INTRO}
            <span className="source-ref">Star Trek Adventures 2E Core Rulebook, pp. 195–211</span>
          </p>
        </div>
      </div>

      <div className="spaceframe-filters" role="toolbar" aria-label="Class filters">
        <button type="button" className="spaceframe-filter is-selected" aria-pressed="true">
          All Classes
        </button>
      </div>

      <div className="spaceframe-cards" role="listbox" aria-label="Spaceframe">
        {frames.map((frame) => {
          const isSelected = frame.id === ship.spaceframeId
          return (
            <button
              key={frame.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`spaceframe-card${isSelected ? ' is-selected' : ''}`}
              onClick={() => choose(frame.id)}
            >
              <ShipArt src={`/art/ships/classes/${frame.id}.png`} alt="" className="spaceframe-card-art" />
              <span className="spaceframe-card-name">{frame.name}</span>
              <span className="spaceframe-card-line">{cardLine(frame)}</span>
            </button>
          )
        })}
      </div>

      <div className="spaceframe-detail panel">
        <div className="spaceframe-preview">
          <ShipArt src={preview} alt="" className="spaceframe-preview-art" />
          {views.length > 0 && (
            <div className="spaceframe-views">
              {views.slice(0, 4).map((src, index) => (
                <button key={src} type="button" className={`spaceframe-view${index === viewIndex ? ' is-selected' : ''}`} onClick={() => setViewIndex(index)}>
                  <ShipArt src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="spaceframe-detail-text">
          <h2 className="spaceframe-detail-name">{selected ? `${selected.name} class` : 'No spaceframe selected'}</h2>
          {selected && <p className="spaceframe-clamp">{selected.overview}</p>}
          {selected && <p className="source-ref">Star Trek Adventures 2E Core Rulebook, p. {selected.page}</p>}
        </div>
      </div>

      <div className="spaceframe-panels">
        <section className="panel spaceframe-panel">
          <h3 className="panel-heading">Class Characteristics</h3>
          {selected && (
            <dl className="spaceframe-stats">
              <Stat label="Launch year" value={selected.launchYear} />
              <Stat label="Scale" value={selected.scale} />
              {SYSTEMS.map(([key, label]) => (
                <Stat key={key} label={label} value={selected.systems[key]} />
              ))}
              {DEPARTMENTS.map(([key, label]) => (
                <Stat key={key} label={`${label} modifier`} value={modifier(selected.departmentModifiers[key])} />
              ))}
            </dl>
          )}
        </section>
        <section className="panel spaceframe-panel">
          <h3 className="panel-heading">Primary Capabilities</h3>
          {selected && (
            <>
              <p className="spaceframe-clamp">{selected.capabilities}</p>
              <ul className="spaceframe-list">
                {selected.weapons.map((weapon) => (
                  <li key={weapon}>{weapon}</li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="panel spaceframe-panel">
          <h3 className="panel-heading">Considerations</h3>
          {selected && (
            <>
              <p className="spaceframe-clamp">{selected.refits}</p>
              {rules.map((rule) => (
                <p key={rule.id} className="spaceframe-rule">
                  <strong>{rule.name}.</strong> {rule.text}
                </p>
              ))}
            </>
          )}
        </section>
        <section className="panel spaceframe-panel">
          <h3 className="panel-heading">Notes</h3>
          {selected && (
            <>
              <p className="spaceframe-clamp">Suggested mission profiles: {selected.suggestedMissionProfiles.join(', ')}.</p>
              <p className="spaceframe-clamp">{selected.naming}</p>
              <p className="spaceframe-clamp">{selected.notableExamples}</p>
            </>
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
        onNext={onNext}
      />
    </section>
  )
}
