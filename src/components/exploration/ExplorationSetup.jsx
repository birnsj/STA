import { useState } from 'react'
import { partyPickerRoster } from '../../character/partyRoster.js'
import { episodeTitle } from '../../maps/mapFormat.js'
import CombatPortrait from '../combat/CombatPortrait.jsx'
import CharacterSheetPanel from './CharacterSheetPanel.jsx'
import useEpisodeMap from '../maps/useEpisodeMap.js'

// Picks the away team from saved characters plus authored playtest redshirts (one per player start on the map, as in
// combat). Each member is a RuntimeCharacter; exploration adds no stats of its own.
export default function ExplorationSetup({ savedCharacters, initialParty, mapId, onStart, onBack }) {
  const { map, problem } = useEpisodeMap(mapId)
  const maxPartySize = map?.markers.playerStarts.length ?? 0
  const [party, setParty] = useState(initialParty)
  const roster = partyPickerRoster(savedCharacters)
  // UI state: whose sheet is shown beside the roster (the last one hovered or clicked).
  const [viewedId, setViewedId] = useState(initialParty[0]?.id ?? null)
  const viewed = roster.find((entry) => entry.id === viewedId && entry.character) ?? null
  const inParty = (id) => party.some((member) => member.id === id)
  const full = party.length >= maxPartySize
  const toggle = (entry) => {
    if (!entry.character) return
    setViewedId(entry.id)
    if (inParty(entry.id)) setParty(party.filter((member) => member.id !== entry.id))
    else if (!full) setParty([...party, entry.character])
  }

  return (
    <div className="combat-setup">
      <div className="combat-panel lcars-frame combat-setup-panel explore-setup-panel">
        <h2 className="combat-setup-title">Exploration: {map ? episodeTitle(map) : 'Loading...'}</h2>
        <p className="combat-setup-text">
          Choose the away team: up to {maxPartySize} characters (one per player start on the map). Your saved characters and the playtest redshirt ensigns are listed.
        </p>
        <div className="combat-setup-map">
          {map && <span className="combat-setup-location">Location: {map.name}</span>}
          {problem && <span className="task-warning">{problem}</span>}
          {map && !maxPartySize && <span className="task-warning">This map has no player start.</span>}
        </div>
        <div className="combat-setup-body">
          <ul className="combat-setup-list explore-setup-list">
            {roster.map((entry) => {
              const position = party.findIndex((member) => member.id === entry.id)
              const disabled = !entry.character || (position < 0 && full)
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`combat-setup-entry ui-row${position >= 0 ? ' is-selected' : ''}${disabled ? ' is-unavailable' : ''}`}
                    aria-pressed={position >= 0}
                    title={entry.error ?? undefined}
                    onClick={() => toggle(entry)}
                    onMouseEnter={() => entry.character && setViewedId(entry.id)}
                    onFocus={() => entry.character && setViewedId(entry.id)}
                  >
                    <span>{entry.label}</span>
                    {position >= 0 && <span className="combat-setup-slot">{position + 1}</span>}
                  </button>
                </li>
              )
            })}
            {!roster.length && <li className="combat-setup-text">No characters available. Create one or check the playtest party.</li>}
          </ul>
          {viewed ? (
            <CharacterSheetPanel character={viewed.character} className="is-in-setup" compact />
          ) : (
            <p className="combat-setup-text explore-setup-hint">Click a character to see their details.</p>
          )}
        </div>
        <div className="explore-setup-footer">
          <div className="combat-setup-party">
            <span className="combat-setup-party-label">
              Away Team {party.length} / {maxPartySize}
            </span>
            {party.map((member) => (
              <button key={member.id} type="button" className="combat-setup-member ui-row" title={`Remove ${member.name}`} onClick={() => setParty(party.filter((other) => other.id !== member.id))}>
                <CombatPortrait character={member} className="combat-setup-member-portrait" />
                <span>{member.name}</span>
              </button>
            ))}
          </div>
          <div className="combat-setup-actions">
            <button type="button" className="combat-button" onClick={onBack}>
              Back
            </button>
            <button type="button" className="combat-button is-primary is-advance" disabled={!map || !party.length || party.length > maxPartySize} onClick={() => onStart(party, map)}>
              Start Exploration
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
