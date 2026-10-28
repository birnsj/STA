import { useState } from 'react'
import '../../styles/ships/refits.css'
import HelpTip from '../../components/HelpTip.jsx'
import { useInfoTip } from '../../components/useInfoTip.js'
import { useWholeCardCarousel } from '../../components/wholeCardCarousel.js'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import {
  refitSystemArt,
  talentArt,
  technicalArt,
} from '../../ships/shipArtPaths.js'
import {
  getRefitSystems,
  getSpaceframeById,
  getStarshipTalentById,
  getTimeframeById,
  grantedTalentIds,
  isServiceRecordFinished,
  refitBudget,
  refitCount,
  refitRoom,
  shipCrewSupport,
  shipResistance,
  shipShields,
  systemScore,
  talentCapacity,
  talentIneligibility,
  talentSlotsRemaining,
  talentSlotsUsed,
  talentsForTab,
} from '../../ships/shipModel.js'
import { starshipTalentTip, systemTip } from '../../ships/shipInfoTips.js'

const INTRO = 'Assign earned system refits (Core p. 217) and fill starship talents up to Scale (pp. 218–225). Appearance is set on Finishing Touches.'

const TABS = [
  ['major', 'Major Refits', 'Assign earned refit slots to raise systems.'],
  ['systems', 'Systems Overview', 'Read-only view of current system totals.'],
  ['weapons', 'Weapons & Defenses', 'Choose optional weapon and defense talents.'],
  ['special', 'Special Systems', 'Choose optional special-system talents.'],
]

const SYSTEM_BLURB = {
  comms: 'Communications arrays, subspace links, and signal processing.',
  computers: 'Core processing, libraries, and shipboard automation.',
  engines: 'Warp, impulse, and power distribution.',
  sensors: 'Long- and short-range sensing suites.',
  structure: 'Hull integrity, plating, and internal framing.',
  weapons: 'Offensive systems and fire control.',
}

function OptionCard({ name, line, artSrc, selected, focused, capped, onClick, tipBind = {} }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={capped || undefined}
      className={`refit-card help-tip${selected ? ' is-selected' : ''}${focused && !selected ? ' is-focused' : ''}${capped ? ' is-capped' : ''}`}
      onClick={onClick}
      {...tipBind}
    >
      <ShipArt src={artSrc} alt="" className="refit-card-art" />
      <span className="refit-card-name">{name}</span>
      {line ? <span className="refit-card-line">{line}</span> : null}
    </button>
  )
}

function RefitCarousel({ count, label, children }) {
  const { carouselRef, trackRef, fits, scroll } = useWholeCardCarousel(count, 196, 8)
  return (
    <div className="carousel refit-carousel" ref={carouselRef}>
      {!fits && (
        <button type="button" className="carousel-arrow" onClick={() => scroll(-1)} aria-label={`Scroll ${label} left`}>‹</button>
      )}
      <div className="carousel-track refit-list" ref={trackRef} role="listbox" aria-label={label}>
        {children}
      </div>
      {!fits && (
        <button type="button" className="carousel-arrow" onClick={() => scroll(1)} aria-label={`Scroll ${label} right`}>›</button>
      )}
    </div>
  )
}

function DetailBlock({ title, children }) {
  return (
    <div className="refit-block">
      <h3 className="refit-block-title">{title}</h3>
      {children}
    </div>
  )
}

export default function RefitsScreen({
  step,
  ship,
  onIncrease,
  onDecrease,
  onToggleTalent,
  onTalentChoice,
  onBack,
  onQuit,
  onClear,
  onAuto,
  onAutofill,
  onShowSummary,
  nextDisabled = false,
  onNext,
}) {
  const systems = getRefitSystems()
  const [tab, setTab] = useState('major')
  const [selectedSystemId, setSelectedSystemId] = useState(systems[0].id)
  const [focusTalentId, setFocusTalentId] = useState(null)

  const frame = getSpaceframeById(ship.spaceframeId)
  const era = getTimeframeById(ship.timeframeId)
  const budget = refitBudget(ship)
  const assigned = ship.refits?.length ?? 0
  const selectedSystem = systems.find((entry) => entry.id === selectedSystemId) ?? systems[0]
  const classValue = frame?.systems?.[selectedSystem.id]
  const profileBonus = ship.missionProfileSystemId === selectedSystem.id ? 1 : 0
  const count = refitCount(ship, selectedSystem.id)
  const total = Number.isFinite(classValue) ? classValue + profileBonus + count : null
  const canIncrease = assigned < budget && refitRoom(ship, selectedSystem.id) > 0
  const room = refitRoom(ship, selectedSystem.id)
  const technicalSrc = frame ? technicalArt(frame.id) : null
  const granted = new Set(grantedTalentIds(ship))
  const extras = ship.extraTalentIds ?? []
  const weaponTalents = talentsForTab('weapons')
  const specialTalents = talentsForTab('special')
  const focusTalent = getStarshipTalentById(focusTalentId)
  const capacity = talentCapacity(ship)
  const used = talentSlotsUsed(ship)
  const remaining = talentSlotsRemaining(ship)
  const activeTab = TABS.find((entry) => entry[0] === tab) ?? TABS[0]
  const tip = useInfoTip()

  const handleTalentClick = (talent) => {
    const locked = granted.has(talent.id)
    const chosen = extras.includes(talent.id)
    const blocked = talentIneligibility(ship, talent.id)
    const capped = Boolean(blocked && !chosen && !locked)
    setFocusTalentId(talent.id)
    if (locked) return
    if (chosen) {
      onToggleTalent(talent.id)
      return
    }
    if (!capped) onToggleTalent(talent.id)
  }

  let list = null
  if (tab === 'major') {
    list = (
      <RefitCarousel count={systems.length} label="System refits">
        {systems.map((entry) => {
          const usedCount = refitCount(ship, entry.id)
          return (
            <OptionCard
              key={entry.id}
              name={entry.name}
              line={usedCount ? `${usedCount} assigned` : 'Available'}
              artSrc={refitSystemArt(entry.id)}
              selected={entry.id === selectedSystem.id}
              onClick={() => setSelectedSystemId(entry.id)}
              tipBind={tip.bind(systemTip(entry.id, entry.name))}
            />
          )
        })}
        {tip.element}
      </RefitCarousel>
    )
  } else if (tab === 'systems') {
    list = (
      <RefitCarousel count={systems.length} label="Current systems">
        {systems.map((entry) => {
          const score = systemScore(ship, entry.id)
          return (
            <OptionCard
              key={entry.id}
              name={entry.name}
              line={score == null ? 'Pending' : `Total ${score}`}
              artSrc={refitSystemArt(entry.id)}
              selected={entry.id === selectedSystem.id}
              onClick={() => setSelectedSystemId(entry.id)}
              tipBind={tip.bind(systemTip(entry.id, entry.name))}
            />
          )
        })}
        {tip.element}
      </RefitCarousel>
    )
  } else if (tab === 'weapons' || tab === 'special') {
    const talents = tab === 'weapons' ? weaponTalents : specialTalents
    list = (
      <RefitCarousel count={talents.length} label={tab === 'weapons' ? 'Weapons and defenses' : 'Special systems'}>
        {talents.map((talent) => {
          const locked = granted.has(talent.id)
          const chosen = extras.includes(talent.id)
          const blocked = talentIneligibility(ship, talent.id)
          const capped = Boolean(blocked && !chosen && !locked)
          const selected = chosen || locked
          return (
            <OptionCard
              key={talent.id}
              name={talent.name}
              line={locked ? 'Granted' : chosen ? 'Selected' : blocked ? blocked : `p. ${talent.page}`}
              artSrc={talentArt(talent.id)}
              selected={selected}
              focused={focusTalentId === talent.id}
              capped={capped}
              onClick={() => handleTalentClick(talent)}
              tipBind={tip.bind(starshipTalentTip(talent, locked ? 'Granted by class or mission profile.' : blocked))}
            />
          )
        })}
        {tip.element}
      </RefitCarousel>
    )
  }

  let detail = null
  if (tab === 'major') {
    detail = (
      <div className="refit-detail panel">
        <ShipArt src={technicalSrc} alt="" className="refit-technical-art" />
        <div className="refit-detail-body">
          <div className="refit-detail-head">
            <h2 className="refit-detail-name">{selectedSystem.name}</h2>
            <p>{SYSTEM_BLURB[selectedSystem.id]}</p>
          </div>
          <div className="refit-detail-grid">
            <DetailBlock title="Effects">
              <p>
                Each assignment raises this system by 1 (at most twice; not above 12). Currently
                {' '}
                {count}
                {room < 1 ? '; no further room on this system.' : '.'}
              </p>
              <div className="refit-actions">
                <button type="button" onClick={() => onDecrease(selectedSystem.id)} disabled={count < 1}>Decrease</button>
                <button type="button" onClick={() => onIncrease(selectedSystem.id)} disabled={!canIncrease}>Increase</button>
              </div>
            </DetailBlock>
            <DetailBlock title="Requirements">
              <p>
                Year of play
                {' '}
                {era?.throughYear ?? '—'}
                . Class launched
                {' '}
                {frame?.launchYear ?? '—'}
                .
              </p>
              <p>
                Refits earned:
                {' '}
                {budget}
                {ship.serviceRecordId === 'prototype' ? ' (includes Prototype +2)' : ''}
                . Assigned:
                {' '}
                {assigned}
                .
              </p>
              <p>
                Talents:
                {' '}
                {used}
                /
                {capacity || '—'}
                {' '}
                (Scale). Remaining slots:
                {' '}
                {remaining}
                .
              </p>
            </DetailBlock>
            <DetailBlock title="Resulting Changes">
              <p className="refit-score">
                {classValue ?? '—'}
                {' '}
                class +
                {' '}
                {profileBonus}
                {' '}
                profile +
                {' '}
                {count}
                {' '}
                =
                {' '}
                {total ?? '—'}
              </p>
              <p>
                Resistance
                {' '}
                {shipResistance(ship) ?? '—'}
                . Shields
                {' '}
                {shipShields(ship) ?? '—'}
                . Crew Support
                {' '}
                {shipCrewSupport(ship) ?? '—'}
                .
              </p>
            </DetailBlock>
          </div>
        </div>
      </div>
    )
  } else if (tab === 'systems') {
    detail = (
      <div className="refit-detail panel">
        <ShipArt src={technicalSrc} alt="" className="refit-technical-art" />
        <div className="refit-detail-body">
          <div className="refit-detail-head">
            <h2 className="refit-detail-name">{selectedSystem.name}</h2>
            <p>{SYSTEM_BLURB[selectedSystem.id]}</p>
          </div>
          <div className="refit-detail-grid">
            <DetailBlock title="Effects">
              <p>
                Current rating for this system. Spaceframe base, mission profile +1 (if this system was chosen), and Major Refits assignments all add together. This tab is read-only.
              </p>
              <p>
                Refits on this system:
                {' '}
                {count}
                {room < 1 ? ' (at the per-system limit).' : '.'}
              </p>
            </DetailBlock>
            <DetailBlock title="Requirements">
              <p>
                Spend earned refit slots on Major Refits (Core Rulebook, p. 217). Each assignment raises one system by 1, at most twice per system, and not above 12.
              </p>
              <p>
                Year of play
                {' '}
                {era?.throughYear ?? '—'}
                . Class launched
                {' '}
                {frame?.launchYear ?? '—'}
                .
              </p>
              <p>
                Refits earned:
                {' '}
                {budget}
                {ship.serviceRecordId === 'prototype' ? ' (includes Prototype +2)' : ''}
                . Assigned:
                {' '}
                {assigned}
                .
              </p>
            </DetailBlock>
            <DetailBlock title="Resulting Changes">
              <p className="refit-score">
                {classValue ?? '—'}
                {' '}
                class +
                {' '}
                {profileBonus}
                {' '}
                profile +
                {' '}
                {count}
                {' '}
                refits =
                {' '}
                {total ?? '—'}
              </p>
              <p>
                Resistance
                {' '}
                {shipResistance(ship) ?? '—'}
                . Shields
                {' '}
                {shipShields(ship) ?? '—'}
                . Crew Support
                {' '}
                {shipCrewSupport(ship) ?? '—'}
                .
              </p>
            </DetailBlock>
          </div>
        </div>
      </div>
    )
  } else if (tab === 'weapons' || tab === 'special') {
    const locked = focusTalent && granted.has(focusTalent.id)
    const chosen = focusTalent && extras.includes(focusTalent.id)
    const blocked = focusTalent ? talentIneligibility(ship, focusTalent.id) : null
    detail = (
      <div className="refit-detail panel">
        <ShipArt src={technicalSrc} alt="" className="refit-technical-art" />
        <div className="refit-detail-body">
          <div className="refit-detail-head">
            <h2 className="refit-detail-name">{focusTalent ? focusTalent.name : 'No talent focused'}</h2>
            {focusTalent ? <p>{focusTalent.effect}</p> : <p className="refit-empty">Select a talent card. Fill talents until they equal Scale.</p>}
          </div>
          {focusTalent ? (
            <div className="refit-detail-grid">
              <DetailBlock title="Effects">
                <p>{focusTalent.effect}</p>
                {focusTalent.choice && (chosen || locked) ? (
                  <label className="refit-choice">
                    {focusTalent.choice === 'system' ? 'System' : 'Department'}
                    <select
                      value={ship.talentChoices?.[focusTalent.id] ?? ''}
                      onChange={(event) => onTalentChoice(focusTalent.id, event.target.value)}
                    >
                      {(focusTalent.choice === 'system'
                        ? ['comms', 'engines', 'structure', 'computers', 'sensors', 'weapons']
                        : ['command', 'conn', 'engineering', 'security', 'science', 'medicine']
                      ).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {chosen && !locked ? (
                  <div className="refit-actions">
                    <button type="button" onClick={() => onToggleTalent(focusTalent.id)}>
                      Remove
                    </button>
                  </div>
                ) : null}
              </DetailBlock>
              <DetailBlock title="Requirements">
                <p>
                  Core p.
                  {' '}
                  {focusTalent.page}
                  .
                  {' '}
                  {locked ? 'Granted by class or mission profile.' : blocked || 'Eligible.'}
                </p>
                <p>
                  Slots
                  {' '}
                  {used}
                  /
                  {capacity}
                  .
                </p>
                {tab === 'weapons' && frame?.weapons?.length ? (
                  <p>
                    Class weapons:
                    {' '}
                    {frame.weapons.join(', ')}
                    .
                  </p>
                ) : null}
              </DetailBlock>
              <DetailBlock title="Resulting Changes">
                <p className="refit-score">
                  Resistance
                  {' '}
                  {shipResistance(ship) ?? '—'}
                  . Shields
                  {' '}
                  {shipShields(ship) ?? '—'}
                  . Crew Support
                  {' '}
                  {shipCrewSupport(ship) ?? '—'}
                  .
                </p>
              </DetailBlock>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <section className="screen refit-screen">
      <div className="screen-title">
        <div className="screen-title-heading">
          <span className="screen-number">{step.number}</span>
          <h1 className="screen-heading"><HelpTip helpId="refitsScreen">{step.title}</HelpTip></h1>
        </div>
        <p className="screen-intro">
          {INTRO}
          <span className="source-ref">Star Trek Adventures 2E Core Rulebook, pp. 217–225</span>
        </p>
      </div>

      <div className="refit-resource-strip" aria-label="Refit and talent budget">
        <span>
          Refits
          {' '}
          {assigned}
          /
          {budget}
        </span>
        <span>
          Talents
          {' '}
          {used}
          /
          {capacity || '—'}
          {' '}
          (Scale)
        </span>
      </div>

      <div className="refit-tabs" role="tablist" aria-label="Refit categories">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`refit-tab${tab === id ? ' is-selected' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="refit-tab-purpose">{activeTab[2]}</p>

      <div className="refit-body">
        {list}
        <div className="refit-main">{detail}</div>
      </div>

      <ShipScreenFooter
        ship={ship}
        onBack={onBack}
        onQuit={onQuit}
        onClear={onClear}
        onAuto={onAuto}
        onAutofill={onAutofill}
        onShowSummary={onShowSummary}
        canShowSummary={Boolean(frame)}
        autoDisabled={!isServiceRecordFinished(ship)}
        autoTitle="Assign remaining refits and fill talents to Scale."
        nextLabel="Next: Finishing Touches →"
        nextDisabled={nextDisabled}
        onNext={onNext}
      />
    </section>
  )
}
