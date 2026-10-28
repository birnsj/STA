import '../../styles/ships/missionProfile.css'
import HelpTip from '../../components/HelpTip.jsx'
import { useInfoTip } from '../../components/useInfoTip.js'
import { useWholeCardCarousel } from '../../components/wholeCardCarousel.js'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import { profileArt } from '../../ships/shipArtPaths.js'
import { departmentTip, missionProfileTip, missionTalentTip, systemTip } from '../../ships/shipInfoTips.js'
import { getMissionProfileById, getMissionProfiles, getSpaceframeById, missionSystemLabel } from '../../ships/shipModel.js'

const INTRO = 'Select a mission profile. Departments are applied automatically from the profile and class. You choose one talent from its list, and the system that gains +1 when the profile leaves that choice open.'

const DEPARTMENTS = [
  ['command', 'Command'],
  ['conn', 'Conn'],
  ['engineering', 'Engineering'],
  ['security', 'Security'],
  ['science', 'Science'],
  ['medicine', 'Medicine'],
]

const SYSTEMS = [
  ['comms', 'Comms'],
  ['engines', 'Engines'],
  ['structure', 'Structure'],
  ['computers', 'Computers'],
  ['sensors', 'Sensors'],
  ['weapons', 'Weapons'],
]

function cardLine(profile) {
  if (profile.system === 'choice') return 'Any one system +1'
  return `${missionSystemLabel(profile.system)} +1`
}

export default function MissionProfileScreen({
  step,
  ship,
  onSelect,
  onSelectTalent,
  onSelectSystem,
  onBack,
  onQuit,
  onClear,
  onAuto,
  onAutofill,
  onShowSummary,
  nextDisabled = false,
  onNext,
}) {
  const profiles = getMissionProfiles()
  const selected = getMissionProfileById(ship.missionProfileId)
  const frame = getSpaceframeById(ship.spaceframeId)
  const choosingSystem = selected?.system === 'choice'
  const talentReady = Boolean(selected?.talents.some((talent) => talent.id === ship.missionProfileTalentId))
  const systemReady = Boolean(
    selected
    && (choosingSystem
      ? SYSTEMS.some(([key]) => key === ship.missionProfileSystemId)
      : ship.missionProfileSystemId === selected.system),
  )
  const { carouselRef, trackRef, fits, scroll } = useWholeCardCarousel(profiles.length, 196, 8)
  const tip = useInfoTip()
  const choiceTip = useInfoTip()

  return (
    <section className="screen mission-screen">
      <div className="screen-title">
        <div className="screen-title-heading">
          <span className="screen-number">{step.number}</span>
          <h1 className={`screen-heading${selected ? '' : ' is-missing'}`}>
            <HelpTip helpId="missionProfileScreen">{step.title}</HelpTip>
          </h1>
        </div>
        <p className="screen-intro">
          {INTRO}
          <span className="source-ref">Star Trek Adventures 2E Core Rulebook, pp. 212–215</span>
        </p>
      </div>

      <div className={`carousel mission-carousel${selected ? '' : ' is-missing'}`} ref={carouselRef}>
        {!fits && (
          <button type="button" className="carousel-arrow" onClick={() => scroll(-1)} aria-label="Scroll profiles left">‹</button>
        )}
        <div className="carousel-track mission-cards" ref={trackRef} role="listbox" aria-label="Mission profile">
        {profiles.map((profile) => {
          const isSelected = profile.id === ship.missionProfileId
          return (
            <button
              key={profile.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`mission-card help-tip${isSelected ? ' is-selected' : ''}`}
              onClick={() => onSelect(profile.id)}
              {...tip.bind(missionProfileTip(profile))}
            >
              <ShipArt src={profileArt(profile.id)} alt="" className="mission-card-art" />
              <span className="mission-card-name">{profile.name}</span>
              <span className="mission-card-line">{cardLine(profile)}</span>
            </button>
          )
        })}
        </div>
        {!fits && (
          <button type="button" className="carousel-arrow" onClick={() => scroll(1)} aria-label="Scroll profiles right">›</button>
        )}
        {tip.element}
      </div>

      <div className="mission-detail panel">
        <ShipArt src={selected ? profileArt(selected.id) : null} alt="" className="mission-preview-art" />
        <div className="mission-detail-text">
          <h2 className={`mission-detail-name${selected ? '' : ' is-missing'}`}>
            {selected ? selected.name : 'No mission profile selected'}
          </h2>
          {selected && <p className="mission-clamp">{selected.overview}</p>}
          {selected && <p className="source-ref">Star Trek Adventures 2E Core Rulebook, p. {selected.page}</p>}
        </div>
      </div>

      <div className="mission-panels">
        <section className="panel mission-panel">
          <h3 className="panel-heading"><HelpTip helpId="missionDepartments">Departments</HelpTip></h3>
          {selected && (
            <>
              <p className="mission-note">Automatic. Baseline + class modifier = score.</p>
              <dl className="mission-stats">
                {DEPARTMENTS.map(([key, label]) => {
                  const base = selected.departments[key]
                  const modifier = frame?.departmentModifiers[key] ?? 0
                  const score = frame ? base + modifier : null
                  return (
                    <div key={key} className="mission-stat help-tip" {...choiceTip.bind(departmentTip(key, label))}>
                      <dt>{label}</dt>
                      <dd>
                        <span className="mission-bar-track" aria-hidden="true">
                          <span className="mission-bar" style={{ width: `${Math.min(100, (base / 5) * 100)}%` }} />
                        </span>
                        <span>{score == null ? base : `${base} + ${modifier} = ${score}`}</span>
                      </dd>
                    </div>
                  )
                })}
              </dl>
            </>
          )}
        </section>
        <section className={`panel mission-panel${selected && !systemReady ? ' is-missing' : ''}`}>
          <h3 className="panel-heading"><HelpTip helpId="missionSystems">Systems</HelpTip></h3>
          {selected && !choosingSystem && (
            <SystemLine frame={frame} systemId={selected.system} />
          )}
          {selected && choosingSystem && (
            <>
              <p className="mission-note">Player pick. Increase any one system by 1.</p>
              <div className="mission-choices" role="listbox" aria-label="System to increase">
                {SYSTEMS.map(([key, label]) => {
                  const isSelected = ship.missionProfileSystemId === key
                  const base = frame?.systems[key]
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`mission-choice help-tip${isSelected ? ' is-selected' : ''}`}
                      onClick={() => onSelectSystem(key)}
                      {...choiceTip.bind(systemTip(key, label))}
                    >
                      <span>{label}</span>
                      <span>{base == null ? '' : isSelected ? `${base} + 1 = ${base + 1}` : base}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </section>
        <section className={`panel mission-panel${selected && !talentReady ? ' is-missing' : ''}`}>
          <h3 className="panel-heading"><HelpTip helpId="missionTalents">Talents</HelpTip></h3>
          {selected && (
            <>
              <p className="mission-note">Player pick. Select one of the following talents.</p>
              <div className="mission-choices" role="listbox" aria-label="Mission profile talent">
                {selected.talents.map((talent) => {
                  const isSelected = talent.id === ship.missionProfileTalentId
                  return (
                    <button
                      key={talent.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`mission-choice help-tip${isSelected ? ' is-selected' : ''}`}
                      onClick={() => onSelectTalent(talent.id)}
                      {...choiceTip.bind(missionTalentTip(talent))}
                    >
                      {talent.name}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </section>
        {choiceTip.element}
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
        autoDisabled={!ship.spaceframeId}
        autoTitle="Choose a mission profile at random."
        nextLabel="Next: Service Record →"
        nextDisabled={nextDisabled}
        onNext={onNext}
      />
    </section>
  )
}

function SystemLine({ frame, systemId }) {
  const label = missionSystemLabel(systemId)
  const base = frame?.systems[systemId]
  return (
    <p className="mission-note">
      Automatic. Increase {label} by 1.
      {base != null && <span className="mission-score">{label} {base} + 1 = {base + 1}</span>}
    </p>
  )
}
