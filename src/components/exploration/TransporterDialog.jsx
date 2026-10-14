import { useEffect, useState } from 'react'
import CombatPortrait from '../combat/CombatPortrait.jsx'

// The transporter's picker: who to beam down beside the lead character. candidates: [{ character, departed }], those
// who beamed out first. onBeamIn(characters) with the ones picked. Escape or a click outside cancels.
export default function TransporterDialog({ candidates, onBeamIn, onCancel }) {
  const [pickedIds, setPickedIds] = useState([])
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  const toggle = (id) => setPickedIds(pickedIds.includes(id) ? pickedIds.filter((other) => other !== id) : [...pickedIds, id])

  return (
    <div className="me-dialog-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="me-dialog explore-transporter-dialog" role="dialog" aria-modal="true" aria-labelledby="explore-transporter-title">
        <p id="explore-transporter-title" className="me-heading">
          Transporter
        </p>
        <p className="me-text">Choose who beams down. They appear beside the lead character.</p>
        {candidates.length ? (
          <ul className="explore-transporter-list">
            {candidates.map(({ character, departed }) => (
              <li key={character.id}>
                <button type="button" className={`explore-transporter-entry${pickedIds.includes(character.id) ? ' is-selected' : ''}`} aria-pressed={pickedIds.includes(character.id)} onClick={() => toggle(character.id)}>
                  <CombatPortrait character={character} className="combat-setup-member-portrait" />
                  <span>{character.name}</span>
                  {departed && <span className="explore-transporter-note">Beamed out</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="me-text">Everyone available is already on the mission.</p>
        )}
        <div className="me-dialog-actions">
          <button type="button" className="me-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="me-button is-primary"
            disabled={!pickedIds.length}
            onClick={() => onBeamIn(candidates.filter(({ character }) => pickedIds.includes(character.id)).map(({ character }) => character))}
          >
            Beam In
          </button>
        </div>
      </div>
    </div>
  )
}
