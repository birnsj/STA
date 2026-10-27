import { useState } from 'react'
import '../../styles/ships/refits.css'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import {
  APPEARANCE_FIELDS,
  getFinishingOptions,
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

const INTRO = 'Assign earned system refits (Core p. 217) and fill starship talents up to Scale (pp. 218–225). Appearance choices are cosmetic only.'

const TABS = [
  ['major', 'Major Refits'],
  ['systems', 'System Upgrades'],
  ['weapons', 'Weapons & Defenses'],
  ['special', 'Special Systems'],
  ['appearance', 'Appearance Packages'],
]

const SYSTEM_BLURB = {
  comms: 'Communications arrays, subspace links, and signal processing.',
  computers: 'Core processing, libraries, and shipboard automation.',
  engines: 'Warp, impulse, and power distribution.',
  sensors: 'Long- and short-range sensing suites.',
  structure: 'Hull integrity, plating, and internal framing.',
  weapons: 'Offensive systems and fire control.',
}

function OptionCard({ name, line, artSrc, selected, capped, onClick }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={capped || undefined}
      className={`refit-card${selected ? ' is-selected' : ''}${capped ? ' is-capped' : ''}`}
      onClick={onClick}
    >
      <ShipArt src={artSrc} alt="" className="refit-card-art" />
      <span className="refit-card-text">
        <span className="refit-card-name">{name}</span>
        {line && <span className="refit-card-line">{line}</span>}
      </span>
    </button>
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
  onAppearance,
  onBack,
  onQuit,
  onClear,
  onAuto,
  onAutofill,
  onShowSummary,
  onNext,
}) {
  const systems = getRefitSystems()
  const [tab, setTab] = useState('major')
  const [selectedSystemId, setSelectedSystemId] = useState(systems[0].id)
  const [focusTalentId, setFocusTalentId] = useState(null)
  const [focusAppearance, setFocusAppearance] = useState(APPEARANCE_FIELDS[0][0])

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
  const technicalSrc = frame ? `/art/ships/technical/${frame.id}.png` : null
  const granted = new Set(grantedTalentIds(ship))
  const extras = ship.extraTalentIds ?? []
  const weaponTalents = talentsForTab('weapons')
  const specialTalents = talentsForTab('special')
  const focusTalent = getStarshipTalentById(focusTalentId)
  const capacity = talentCapacity(ship)
  const used = talentSlotsUsed(ship)
  const remaining = talentSlotsRemaining(ship)

  let list = null
  if (tab === 'major') {
    list = (
      <div className="refit-list" role="listbox" aria-label="System refits">
        {systems.map((entry) => {
          const usedCount = refitCount(ship, entry.id)
          return (
            <OptionCard
              key={entry.id}
              name={entry.name}
              line={usedCount ? `${usedCount} assigned` : 'Available'}
              artSrc={`/art/ships/refits/${entry.id}.png`}
              selected={entry.id === selectedSystem.id}
              onClick={() => setSelectedSystemId(entry.id)}
            />
          )
        })}
      </div>
    )
  } else if (tab === 'systems') {
    list = (
      <div className="refit-list" role="listbox" aria-label="Current systems">
        {systems.map((entry) => {
          const score = systemScore(ship, entry.id)
          return (
            <OptionCard
              key={entry.id}
              name={entry.name}
              line={score == null ? 'Pending' : `Total ${score}`}
              artSrc={`/art/ships/refits/${entry.id}.png`}
              selected={entry.id === selectedSystem.id}
              onClick={() => setSelectedSystemId(entry.id)}
            />
          )
        })}
      </div>
    )
  } else if (tab === 'weapons' || tab === 'special') {
    const talents = (tab === 'weapons' ? weaponTalents : specialTalents).filter((talent) => {
      if (granted.has(talent.id) || extras.includes(talent.id)) return true
      return !talentIneligibility(ship, talent.id)
    })
    list = (
      <div className="refit-list" role="listbox" aria-label={tab === 'weapons' ? 'Weapons and defenses' : 'Special systems'}>
        {talents.map((talent) => {
          const selected = extras.includes(talent.id) || focusTalentId === talent.id
          const locked = granted.has(talent.id)
          const chosen = extras.includes(talent.id)
          const blocked = talentIneligibility(ship, talent.id)
          const capped = Boolean(blocked && !chosen && !locked)
          return (
            <OptionCard
              key={talent.id}
              name={talent.name}
              line={locked ? 'Granted' : chosen ? 'Selected' : blocked ? blocked : `p. ${talent.page}`}
              artSrc={frame ? `/art/ships/classes/${frame.id}.png` : '/art/ships/summary.png'}
              selected={selected}
              capped={capped}
              onClick={() => {
                setFocusTalentId(talent.id)
                if (!locked && !capped) onToggleTalent(talent.id)
              }}
            />
          )
        })}
      </div>
    )
  } else {
    list = (
      <div className="refit-list" role="listbox" aria-label="Appearance packages">
        {APPEARANCE_FIELDS.map(([field, label]) => {
          const options = getFinishingOptions(field)
          const current = options.find((entry) => entry.id === ship[field])
          return (
            <OptionCard
              key={field}
              name={label}
              line={current?.name ?? 'Unset'}
              artSrc={technicalSrc ?? '/art/ships/summary.png'}
              selected={focusAppearance === field}
              onClick={() => setFocusAppearance(field)}
            />
          )
        })}
      </div>
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
            <p>Read-only totals. Assign refits on Major Refits (Core p. 217).</p>
          </div>
          <div className="refit-detail-grid">
            <DetailBlock title="Effects">
              <p>No separate system-upgrade spend. This tab shows the current rating only.</p>
            </DetailBlock>
            <DetailBlock title="Requirements">
              <p>Use Major Refits to spend earned refit slots.</p>
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
                {!locked ? (
                  <div className="refit-actions">
                    <button
                      type="button"
                      onClick={() => onToggleTalent(focusTalent.id)}
                      disabled={Boolean(blocked && !chosen)}
                    >
                      {chosen ? 'Remove' : 'Select'}
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
  } else {
    const options = getFinishingOptions(focusAppearance)
    const label = APPEARANCE_FIELDS.find(([field]) => field === focusAppearance)?.[1] ?? 'Appearance'
    detail = (
      <div className="refit-detail panel">
        <ShipArt src={technicalSrc} alt="" className="refit-technical-art" />
        <div className="refit-detail-body">
          <div className="refit-detail-head">
            <h2 className="refit-detail-name">{label}</h2>
            <p>Cosmetic only. No systems, talents, or combat bonuses (Core finishing touches).</p>
          </div>
          <div className="refit-appearance-options">
            {options.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`refit-appearance-chip${ship[focusAppearance] === entry.id ? ' is-selected' : ''}`}
                onClick={() => onAppearance(focusAppearance, entry.id)}
              >
                {entry.name}
              </button>
            ))}
          </div>
          <div className="refit-detail-grid">
            <DetailBlock title="Effects">
              <p>Stored on the ship record for presentation. Shared with Finishing Touches.</p>
            </DetailBlock>
            <DetailBlock title="Requirements">
              <p>None. Optional visual customization.</p>
            </DetailBlock>
            <DetailBlock title="Resulting Changes">
              <p className="refit-score">No statistical change.</p>
            </DetailBlock>
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="screen refit-screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className="screen-heading">{step.title}</h1>
          <p className="screen-intro">
            {INTRO}
            <span className="source-ref">Star Trek Adventures 2E Core Rulebook, pp. 217–225</span>
          </p>
        </div>
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
        onNext={onNext}
      />
    </section>
  )
}
