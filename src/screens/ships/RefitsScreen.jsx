import { useState } from 'react'
import '../../styles/ships/refits.css'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import {
  getRefitSystems,
  getSpaceframeById,
  getTimeframeById,
  isServiceRecordFinished,
  refitBudget,
  refitCount,
  refitRoom,
} from '../../ships/shipModel.js'

const INTRO = 'One refit for every 10 full years of service. Each refit increases one system by 1. No system may be refit more than twice, and a refit may not raise a system above 12.'

export default function RefitsScreen({
  step,
  ship,
  onIncrease,
  onDecrease,
  onBack,
  onQuit,
  onClear,
  onAuto,
  onAutofill,
  onShowSummary,
  onNext,
}) {
  const systems = getRefitSystems()
  const [selectedId, setSelectedId] = useState(systems[0].id)
  const selected = systems.find((entry) => entry.id === selectedId) ?? systems[0]
  const frame = getSpaceframeById(ship.spaceframeId)
  const era = getTimeframeById(ship.timeframeId)
  const budget = refitBudget(ship)
  const assigned = ship.refits?.length ?? 0
  const classValue = frame?.systems?.[selected.id]
  const profileBonus = ship.missionProfileSystemId === selected.id ? 1 : 0
  const count = refitCount(ship, selected.id)
  const total = Number.isFinite(classValue) ? classValue + profileBonus + count : null
  const canIncrease = assigned < budget && refitRoom(ship, selected.id) > 0

  return (
    <section className="screen refit-screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className="screen-heading">{step.title}</h1>
          <p className="screen-intro">
            {INTRO}
            <span className="source-ref">Star Trek Adventures 2E Core Rulebook, p. 217</span>
          </p>
        </div>
      </div>

      <div className="refit-body">
        <div className="refit-list" role="listbox" aria-label="Systems">
          {systems.map((entry) => {
            const used = refitCount(ship, entry.id)
            const isSelected = entry.id === selected.id
            return (
              <button
                key={entry.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={isSelected ? 'refit-row is-selected' : 'refit-row'}
                onClick={() => setSelectedId(entry.id)}
              >
                <ShipArt src={`/art/ships/refits/${entry.id}.png`} alt="" className="refit-mark" />
                <span className="refit-row-name">{entry.name}</span>
                <span className="refit-row-count">{used || '—'}</span>
              </button>
            )
          })}
        </div>

        <div className="refit-detail panel">
          <ShipArt src={frame ? `/art/ships/classes/${frame.id}.png` : ''} alt="" className="refit-detail-art" />
          <div className="refit-detail-copy">
            <h2>{selected.name}</h2>
            <p>
              Year of play {era?.throughYear ?? '—'}. Class launched {frame?.launchYear ?? '—'}.
            </p>
            <p>
              Refits earned: {budget}. Assigned: {assigned}.
            </p>
            <p className="refit-score">
              {classValue ?? '—'} class + {profileBonus} profile + {count} {count === 1 ? 'refit' : 'refits'} = {total ?? '—'}
            </p>
            <div className="refit-actions">
              <button type="button" onClick={() => onDecrease(selected.id)} disabled={count < 1}>
                Decrease
              </button>
              <button type="button" onClick={() => onIncrease(selected.id)} disabled={!canIncrease}>
                Increase
              </button>
            </div>
          </div>
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
        canShowSummary={Boolean(frame)}
        autoDisabled={!isServiceRecordFinished(ship)}
        autoTitle="Assign the remaining refits from the d20 table."
        nextLabel="Next: Finishing Touches →"
        onNext={onNext}
      />
    </section>
  )
}
