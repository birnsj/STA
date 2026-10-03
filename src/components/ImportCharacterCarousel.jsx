import { useState } from 'react'
import { getSavedCharacterData } from '../character/savedCharacters.js'
import { getCharacterFocuses, getCharacterValues, getFinalScores, getKindInfo, getPortraitById } from '../rules/finishingTouches.js'
import { getSpeciesDisplayName } from '../rules/species.js'
import Portrait from './Portrait.jsx'

const EMPTY = '—'

// A saved entry that can't be read (e.g. from an older build) still gets a card, just without stats.
function readCharacter(entry) {
  try {
    return getSavedCharacterData(entry)
  } catch {
    return null
  }
}

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

function ScoreList({ title, kind, character }) {
  const scores = getFinalScores(character, kind)
  return (
    <section className="import-card-section">
      <h3 className="import-card-heading">{title}</h3>
      <ul className="import-card-scores">
        {getKindInfo(kind).entries.map((entry) => (
          <li key={entry.id}>
            <span>{entry.name}</span>
            <strong>{scores?.[entry.id] ?? EMPTY}</strong>
          </li>
        ))}
      </ul>
    </section>
  )
}

function NameList({ title, items }) {
  return (
    <section className="import-card-section">
      <h3 className="import-card-heading">
        {title} <span className="import-card-count">{items.length}</span>
      </h3>
      <ul className="import-card-names">
        {items.length ? items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>) : <li>{EMPTY}</li>}
      </ul>
    </section>
  )
}

function SavedCharacterCard({ entry }) {
  const character = readCharacter(entry)
  const name = entry.name || 'Unnamed'
  const portrait = getPortraitById(character?.identity.portrait?.id)
  const portraitBlock = <Portrait label={portrait?.name ?? name} image={portrait?.image} className="portrait-import-card" />

  if (!character) {
    return (
      <div className="import-card">
        {portraitBlock}
        <div className="import-card-info">
          <h3 className="import-card-name">{name}</h3>
          <p className="import-card-service">This save could not be read.</p>
        </div>
      </div>
    )
  }

  const { identity, species, environment, education, career } = character
  const service = [career.rank?.name, career.department?.name].filter(Boolean).join(' ◆ ')
  return (
    <div className="import-card">
      {portraitBlock}
      <div className="import-card-info">
        <h3 className="import-card-name">{name}</h3>
        <p className="import-card-service">{service || EMPTY}</p>
        <div className="import-card-grid">
          <ProfileList
            rows={[
              { label: 'Species', value: getSpeciesDisplayName(species) },
              { label: 'Gender', value: identity.gender?.name },
              { label: 'Pronouns', value: identity.pronouns.trim() },
              { label: 'Traits', value: species?.traits.map((trait) => trait.name).join(', ') },
              { label: 'Upbringing', value: environment.condition?.name ?? environment.setting?.name },
              { label: 'Education', value: education.option?.name },
              { label: 'Career', value: career.length?.name },
              { label: 'Assignment', value: career.assignment?.name },
            ]}
          />
          <ScoreList title="Attributes" kind="attributes" character={character} />
          <ScoreList title="Disciplines" kind="disciplines" character={character} />
        </div>
        <div className="import-card-lists">
          <NameList title="Values" items={getCharacterValues(character).map((value) => value.text.trim())} />
          <NameList title="Focuses" items={getCharacterFocuses(character).map((focus) => focus.name.trim())} />
        </div>
      </div>
    </div>
  )
}

export default function ImportCharacterCarousel({ characters, onLoad, onDelete, onDuplicate, onDeleteAll, onCancel }) {
  const [index, setIndex] = useState(0)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false)
  const count = characters.length
  const current = count ? Math.min(index, count - 1) : -1
  const selected = characters[current] ?? null

  const step = (direction) => setIndex((current + direction + count) % count)

  const handleKeyDown = (event) => {
    if (count < 2) return
    if (event.key === 'ArrowLeft') step(-1)
    if (event.key === 'ArrowRight') step(1)
  }

  const deleteSelected = () => {
    onDelete(selected)
    setConfirmingDelete(false)
  }

  const deleteAll = () => {
    onDeleteAll()
    setConfirmingDeleteAll(false)
    setIndex(0)
  }

  return (
    <div className="menu-notice-backdrop">
      <div
        className="ship-builder-panel menu-notice import-carousel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-character-title"
        inert={confirmingDelete || confirmingDeleteAll}
        onKeyDown={handleKeyDown}
      >
        <h2 id="import-character-title" className="menu-notice-title">Import Character</h2>

        {selected ? (
          <>
            <div className="import-carousel-stage">
              <button type="button" className="import-carousel-arrow" aria-label="Previous character" disabled={count < 2} onClick={() => step(-1)}>
                ‹
              </button>
              <SavedCharacterCard key={selected.id} entry={selected} />
              <button type="button" className="import-carousel-arrow" aria-label="Next character" disabled={count < 2} onClick={() => step(1)}>
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
          <p className="menu-notice-text">No saved characters.</p>
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

        <div className="import-dev-actions">
          <button type="button" className="dev-button import-duplicate" disabled={!selected} onClick={() => onDuplicate(selected)}>
            Duplicate (dev)
          </button>
          <button type="button" className="dev-button import-duplicate" disabled={!selected} onClick={() => setConfirmingDeleteAll(true)}>
            Delete All (dev)
          </button>
        </div>
      </div>

      {confirmingDeleteAll && selected && (
        <div className="menu-notice-backdrop">
          <div className="ship-builder-panel menu-notice delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-all-confirm-title">
            <h2 id="delete-all-confirm-title" className="menu-notice-title">Are You Sure?</h2>
            <p className="menu-notice-text">
              Delete all <strong>{count}</strong> saved characters? This cannot be undone.
            </p>
            <div className="menu-notice-actions">
              <button type="button" className="nav-button nav-back" onClick={() => setConfirmingDeleteAll(false)} autoFocus>
                Keep
              </button>
              <button type="button" className="nav-button import-delete" onClick={deleteAll}>
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingDelete && selected && (
        <div className="menu-notice-backdrop">
          <div className="ship-builder-panel menu-notice delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title">
            <h2 id="delete-confirm-title" className="menu-notice-title">Are You Sure?</h2>
            <p className="menu-notice-text">
              Delete <strong>{selected.name || 'Unnamed'}</strong>? This cannot be undone.
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
