import { useState } from 'react'
import { normalizeCharacterRecord } from '../../character/runtimeCharacter.js'
import { episodeTitle } from '../../maps/mapFormat.js'
import CombatPortrait from '../combat/CombatPortrait.jsx'
import useEpisodeMap from '../maps/useEpisodeMap.js'

// Picks the away team from the saved characters (one per player start on the map, as in Combat Type 1). Each member is
// the RuntimeCharacter built from that character's saved JSON; exploration adds no stats of its own.
export default function ExplorationSetup({ savedCharacters, initialParty, mapId, onStart, onBack }) {
  const { map, problem } = useEpisodeMap(mapId)
  const maxPartySize = map?.markers.playerStarts.length ?? 0
  const [party, setParty] = useState(initialParty)
  const roster = savedCharacters.map((entry) => {
    const { character, error } = normalizeCharacterRecord(entry.record, { id: entry.id })
    return { id: entry.id, label: entry.name || entry.id, character, error }
  })
  const inParty = (id) => party.some((member) => member.id === id)
  const full = party.length >= maxPartySize
  const toggle = (entry) => {
    if (!entry.character) return
    if (inParty(entry.id)) setParty(party.filter((member) => member.id !== entry.id))
    else if (!full) setParty([...party, entry.character])
  }

  return (
    <div className="combat-setup">
      <div className="combat-panel combat-setup-panel">
        <h2 className="combat-setup-title">Exploration: {map ? episodeTitle(map) : 'Loading...'}</h2>
        <p className="combat-setup-text">Choose the away team: up to {maxPartySize} characters (one per player start on the map).</p>
        <div className="combat-setup-map">
          {map && <span className="combat-setup-location">Location: {map.name}</span>}
          {problem && <span className="task-warning">{problem}</span>}
          {map && !maxPartySize && <span className="task-warning">This map has no player start.</span>}
        </div>
        <ul className="combat-setup-list explore-setup-list">
          {roster.map((entry) => {
            const position = party.findIndex((member) => member.id === entry.id)
            const disabled = !entry.character || (position < 0 && full)
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`combat-setup-entry${position >= 0 ? ' is-selected' : ''}${disabled ? ' is-unavailable' : ''}`}
                  aria-pressed={position >= 0}
                  title={entry.error ?? undefined}
                  onClick={() => toggle(entry)}
                >
                  <span>{entry.label}</span>
                  {position >= 0 && <span className="combat-setup-slot">{position + 1}</span>}
                </button>
              </li>
            )
          })}
          {!roster.length && <li className="combat-setup-text">No saved characters yet. Create one first.</li>}
        </ul>
        <div className="combat-setup-party">
          <span className="combat-setup-party-label">
            Away Team {party.length} / {maxPartySize}
          </span>
          {party.map((member) => (
            <button key={member.id} type="button" className="combat-setup-member" title={`Remove ${member.name}`} onClick={() => setParty(party.filter((other) => other.id !== member.id))}>
              <CombatPortrait character={member} className="combat-setup-member-portrait" />
              <span>{member.name}</span>
            </button>
          ))}
        </div>
        <div className="combat-setup-actions">
          <button type="button" className="combat-button" onClick={onBack}>
            Back
          </button>
          <button type="button" className="combat-button is-primary" disabled={!map || !party.length || party.length > maxPartySize} onClick={() => onStart(party, map)}>
            Start Exploration
          </button>
        </div>
      </div>
    </div>
  )
}
