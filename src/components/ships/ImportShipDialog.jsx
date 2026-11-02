import { useState } from 'react'
import {
  departmentScore,
  getMissionProfileById,
  getSpaceframeById,
  getTimeframeById,
  refitSummaryItems,
  serviceRecordLabel,
  shipCrewSupport,
  shipDisplayName,
  shipDisplayRegistry,
  shipResistance,
  shipShields,
  shipTalentNames,
  shipTraitNames,
} from '../../ships/shipModel.js'
import { classArt, eraArt, shipSummaryArt } from '../../ships/shipArtPaths.js'
import ShipArt from './ShipArt.jsx'

const EMPTY = '—'

const DEPARTMENTS = [
  ['command', 'Command'],
  ['conn', 'Conn'],
  ['engineering', 'Engineering'],
  ['security', 'Security'],
  ['science', 'Science'],
  ['medicine', 'Medicine'],
]

function ProfileList({ rows }) {
  return (
    <dl className="import-card-profile">
      {rows.map(({ label, value }) => (
        <div key={label} className="import-card-row">
          <dt>{label}</dt>
          <dd title={value || undefined}>{value || EMPTY}</dd>
        </div>
      ))}
    </dl>
  )
}

function ScoreList({ title, ship }) {
  return (
    <section className="import-card-section">
      <h3 className="import-card-heading">{title}</h3>
      <ul className="import-card-scores">
        {DEPARTMENTS.map(([key, name]) => {
          const score = departmentScore(ship, key)
          return (
            <li key={key}>
              <span>{name}</span>
              <strong>{score == null ? EMPTY : String(score)}</strong>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function NameList({ title, items }) {
  const list = items?.filter(Boolean) ?? []
  return (
    <section className="import-card-section">
      <h3 className="import-card-heading">
        {title} <span className="import-card-count">{list.length}</span>
      </h3>
      <ul className="import-card-names">
        {list.length ? list.map((item) => <li key={item}>{item}</li>) : <li>{EMPTY}</li>}
      </ul>
    </section>
  )
}

function SavedShipCard({ entry }) {
  const ship = entry.record
  const name = entry.name || shipDisplayName(ship) || 'Unnamed ship'
  if (!ship) {
    return (
      <div className="import-card">
        <ShipArt src={shipSummaryArt()} alt="" className="ship-import-card-art" />
        <div className="import-card-info">
          <h3 className="import-card-name">{name}</h3>
          <p className="import-card-service">This save could not be read.</p>
        </div>
      </div>
    )
  }

  const era = getTimeframeById(ship.timeframeId)
  const frame = getSpaceframeById(ship.spaceframeId)
  const profile = getMissionProfileById(ship.missionProfileId)
  const resistance = shipResistance(ship)
  const shields = shipShields(ship)
  const crew = shipCrewSupport(ship)
  const registry = shipDisplayRegistry(ship)
  const service = [frame?.name, registry].filter(Boolean).join(' ◆ ')
  const art = frame ? classArt(frame.id) : era ? eraArt(era.id) : shipSummaryArt()

  return (
    <div className="import-card">
      <ShipArt src={art} alt="" className="ship-import-card-art" />
      <div className="import-card-info">
        <h3 className="import-card-name">{name}</h3>
        <p className="import-card-service">{service || EMPTY}</p>
        <div className="import-card-grid">
          <ProfileList
            rows={[
              { label: 'Registry', value: registry },
              { label: 'Class', value: frame?.name },
              { label: 'Timeframe', value: era ? `${era.name} (${era.years})` : null },
              { label: 'Mission Profile', value: profile?.name },
              { label: 'Service Record', value: serviceRecordLabel(ship) },
              { label: 'Refits', value: refitSummaryItems(ship).join(', ') || null },
              { label: 'Resistance', value: resistance == null ? null : String(resistance) },
              { label: 'Shields', value: shields == null ? null : String(shields) },
              { label: 'Crew Support', value: crew == null ? null : String(crew) },
            ]}
          />
          <ScoreList title="Departments" ship={ship} />
          <div className="import-card-lists import-card-lists-stack">
            <NameList title="Traits" items={shipTraitNames(ship)} />
            <NameList title="Talents" items={shipTalentNames(ship)} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Same carousel pattern as Import Character: one saved ship at a time with Import / Delete.
export default function ImportShipDialog({ ships, onLoad, onDelete, onCancel }) {
  const [index, setIndex] = useState(0)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const count = ships.length
  const current = count ? Math.min(index, count - 1) : -1
  const selected = ships[current] ?? null

  const step = (direction) => setIndex((current + direction + count) % count)

  const handleKeyDown = (event) => {
    if (count < 2) return
    if (event.key === 'ArrowLeft') step(-1)
    if (event.key === 'ArrowRight') step(1)
  }

  const deleteSelected = () => {
    onDelete(selected.id)
    setConfirmingDelete(false)
  }

  return (
    <div className="menu-notice-backdrop">
      <div
        className="ship-builder-panel menu-notice import-carousel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-ship-title"
        inert={confirmingDelete || undefined}
        onKeyDown={handleKeyDown}
      >
        <h2 id="import-ship-title" className="menu-notice-title">
          Import Ship
        </h2>

        {selected ? (
          <>
            <div className="import-carousel-stage">
              <button type="button" className="import-carousel-arrow" aria-label="Previous ship" disabled={count < 2} onClick={() => step(-1)}>
                ‹
              </button>
              <SavedShipCard key={selected.id} entry={selected} />
              <button type="button" className="import-carousel-arrow" aria-label="Next ship" disabled={count < 2} onClick={() => step(1)}>
                ›
              </button>
            </div>
            <p className="import-carousel-status">
              <span className="import-carousel-counter">
                {current + 1} / {count}
              </span>
              <span>Saved {new Date(selected.savedAt).toLocaleString()}</span>
            </p>
          </>
        ) : (
          <p className="menu-notice-text">No saved ships.</p>
        )}

        <div className="menu-notice-actions">
          <button type="button" className="nav-button nav-back" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="nav-button import-delete" disabled={!selected} onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
          <button type="button" className="nav-button nav-next" disabled={!selected} onClick={() => onLoad(selected)}>
            Import →
          </button>
        </div>
      </div>

      {confirmingDelete && selected && (
        <div className="menu-notice-backdrop">
          <div className="ship-builder-panel menu-notice delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-ship-confirm-title">
            <h2 id="delete-ship-confirm-title" className="menu-notice-title">
              Are You Sure?
            </h2>
            <p className="menu-notice-text">
              Delete <strong>{selected.name || 'Unnamed ship'}</strong>? This cannot be undone.
            </p>
            <div className="menu-notice-actions">
              <button type="button" className="nav-button nav-back" onClick={() => setConfirmingDelete(false)} autoFocus>
                Keep
              </button>
              <button type="button" className="nav-button import-delete" onClick={deleteSelected}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
