import { useEffect, useState } from 'react'
import '../../styles/ships/serviceRecord.css'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import { getServiceRecordById, getServiceRecords, getSpaceframeById, isMissionProfileComplete, serviceRecordTitle } from '../../ships/shipModel.js'

const INTRO = 'A service record is optional. It adds one trait, named for the record, and one special rule.'

export default function ServiceRecordScreen({
  step,
  ship,
  onSelect,
  onDetail,
  onBack,
  onQuit,
  onClear,
  onAuto,
  onAutofill,
  onShowSummary,
  onNext,
}) {
  const records = getServiceRecords()
  const selected = getServiceRecordById(ship.serviceRecordId)
  const frame = getSpaceframeById(ship.spaceframeId)
  const title = serviceRecordTitle(ship)
  const [draft, setDraft] = useState(ship.serviceRecordDetail ?? '')

  useEffect(() => {
    setDraft(ship.serviceRecordDetail ?? '')
  }, [ship.serviceRecordId])

  return (
    <section className="screen service-screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className="screen-heading">{step.title}</h1>
          <p className="screen-intro">
            {INTRO}
            <span className="source-ref">Star Trek Adventures 2E Core Rulebook, p. 216</span>
          </p>
        </div>
      </div>

      <div className="service-body">
        <div className="service-list" role="listbox" aria-label="Service record">
          {records.map((record) => {
            const isSelected = record.id === ship.serviceRecordId
            return (
              <button
                key={record.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`service-card${isSelected ? ' is-selected' : ''}`}
                onClick={() => onSelect(record.id)}
              >
                <ShipArt src={`/art/ships/service/${record.id}.png`} alt="" className="service-card-art" />
                <span className="service-card-text">
                  <span className="service-card-name">{record.name}</span>
                  <span className="service-card-line">{record.ruleName}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="service-detail panel">
          <ShipArt src={frame ? `/art/ships/classes/${frame.id}.png` : null} alt="" className="service-preview-art" />
          <div className="service-detail-text">
            <h2 className="service-detail-name">{selected ? selected.name : 'No service record selected'}</h2>
            {selected && <p className="service-clamp">{selected.overview}</p>}
            {selected && <p className="source-ref">Star Trek Adventures 2E Core Rulebook, p. {selected.page}</p>}
            {selected && (
              <p className="service-effect">
                <strong>Trait.</strong> {title ?? (selected.namesake ? 'Name the battle or war.' : selected.name)}
              </p>
            )}
            {selected && (
              <p className="service-effect">
                <strong>{selected.ruleName}.</strong> {selected.rule}
              </p>
            )}
            {selected?.namesake && (
              <label className="service-name">
                Battle or war
                <input
                  type="text"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value)
                    onDetail(event.target.value)
                  }}
                  onBlur={() => setDraft(ship.serviceRecordDetail ?? '')}
                />
              </label>
            )}
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
        canShowSummary={Boolean(selected)}
        autoDisabled={!isMissionProfileComplete(ship)}
        autoTitle="Choose a service record at random."
        nextLabel="Next: Refits →"
        onNext={onNext}
      />
    </section>
  )
}
