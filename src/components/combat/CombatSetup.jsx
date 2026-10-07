import { useState } from 'react'
import { normalizeCharacterRecord } from '../../character/runtimeCharacter.js'
import { getMovementTiles } from '../../combat/movementSystem.js'
import { getCharacterWeapons } from '../../combat/weaponSystem.js'
import { ENEMY_SPAWNS_NEEDED } from '../../combat/encounters.js'
import { episodeTitle, validateMap } from '../../maps/mapFormat.js'
import { MAX_SEED } from '../../rules/seededRandom.js'
import useEpisodeMap from '../maps/useEpisodeMap.js'
import CombatPortrait from './CombatPortrait.jsx'

// Shows the numbers combat will actually use, straight from the character's exported values.
function CharacterPreview({ character }) {
  const { attributes, disciplines } = character
  return (
    <dl className="combat-setup-preview">
      <dt>Ranged attack</dt>
      <dd>
        Control {attributes.control} + Security {disciplines.security} = TN {attributes.control + disciplines.security}
      </dd>
      <dt>Movement</dt>
      <dd>
        floor(Fitness {attributes.fitness} / 2) + 1 = {getMovementTiles(character)} tiles
      </dd>
      <dt>Initiative</dt>
      <dd>
        Daring {attributes.daring} (ties: Control {attributes.control})
      </dd>
      <dt>Weapons</dt>
      <dd>{getCharacterWeapons(character).map((weapon) => weapon.name).join(', ')}</dd>
    </dl>
  )
}

// Saved characters plus any loaded from files this visit; a save that cannot be read is listed with its error.
function buildRoster(savedCharacters, loaded) {
  const saved = savedCharacters.map((entry) => {
    const { character, error } = normalizeCharacterRecord(entry.record, { id: entry.id })
    return { id: entry.id, label: entry.name || entry.id, character, error }
  })
  return [...saved, ...loaded.map((character) => ({ id: character.id, label: `${character.name} (file)`, character, error: null }))]
}

// Blank = random seed (null). Otherwise a whole number 0..MAX_SEED, or undefined if it is not one.
function parseSeed(text) {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (!/^\d+$/.test(trimmed) || Number(trimmed) > MAX_SEED) return undefined
  return Number(trimmed)
}

export default function CombatSetup({ savedCharacters, initialParty, initialSeed, mapId, onStart, onExit }) {
  const { map, problem: mapProblem } = useEpisodeMap(mapId)
  const mapWarnings = map ? validateMap(map, { enemySpawns: ENEMY_SPAWNS_NEEDED, label: 'Combat Type 1' }) : []
  // One party member per player start on the chosen map.
  const maxPartySize = map?.markers.playerStarts.length ?? 0
  // UI state: the chosen party (RuntimeCharacters, in pick order), characters loaded from files, the one being previewed, and the seed text.
  const [party, setParty] = useState(initialParty)
  const [seedText, setSeedText] = useState(initialSeed == null ? '' : String(initialSeed))
  const seed = parseSeed(seedText)
  const [loaded, setLoaded] = useState(() => initialParty.filter((member) => member.id.startsWith('file:')))
  const [previewId, setPreviewId] = useState(initialParty[0]?.id ?? null)
  const [error, setError] = useState(null)

  const roster = buildRoster(savedCharacters, loaded)
  const preview = roster.find((entry) => entry.id === previewId)?.character ?? null
  const inParty = (id) => party.some((member) => member.id === id)
  const full = party.length >= maxPartySize

  const toggle = (entry) => {
    setPreviewId(entry.id)
    setError(entry.error)
    if (!entry.character) return
    if (inParty(entry.id)) setParty(party.filter((member) => member.id !== entry.id))
    else if (!full) setParty([...party, entry.character])
  }

  const loadFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const { character, error: problem } = normalizeCharacterRecord(JSON.parse(await file.text()), { id: `file:${file.name}` })
      setError(problem ?? null)
      if (!character) return
      setLoaded([...loaded.filter((other) => other.id !== character.id), character])
      setPreviewId(character.id)
      if (!inParty(character.id) && !full) setParty([...party, character])
    } catch {
      setError(`${file.name} is not valid JSON.`)
    }
  }

  return (
    <div className="combat-setup">
      <div className="combat-panel combat-setup-panel">
        <h2 className="combat-setup-title">Load Episode: {map ? episodeTitle(map) : 'Combat Test'}</h2>
        <p className="combat-setup-text">
          Choose up to {maxPartySize} characters for your party (one per player start on the map). Combat uses the values saved in each character's JSON.
        </p>
        <div className="combat-setup-map">
          {map && <span className="combat-setup-location">Location: {map.name}</span>}
          {mapProblem && <span className="task-warning">{mapProblem}</span>}
          {!mapProblem && !map && <span className="combat-setup-text">Loading...</span>}
          {mapWarnings.map((warning) => (
            <span key={warning} className="task-warning">
              {warning}
            </span>
          ))}
          {party.length > maxPartySize && map && <span className="task-warning">This map has room for {maxPartySize} party members.</span>}
        </div>
        <div className="combat-setup-body">
          <ul className="combat-setup-list">
            {roster.map((entry) => {
              const position = party.findIndex((member) => member.id === entry.id)
              const disabled = !entry.character || (position < 0 && full)
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`combat-setup-entry${position >= 0 ? ' is-selected' : ''}${disabled ? ' is-unavailable' : ''}`}
                    aria-pressed={position >= 0}
                    onClick={() => toggle(entry)}
                  >
                    <span>{entry.label}</span>
                    {position >= 0 && <span className="combat-setup-slot">{position + 1}</span>}
                  </button>
                </li>
              )
            })}
            <li>
              <label className="combat-setup-entry is-file">
                Load character JSON...
                <input type="file" accept=".json,application/json" onChange={loadFile} hidden />
              </label>
            </li>
          </ul>
          <div className="combat-setup-detail">
            {preview ? (
              <>
                <div className="combat-setup-heading">
                  <CombatPortrait character={preview} className="combat-setup-portrait" />
                  <div>
                    <p className="combat-setup-name">{preview.name}</p>
                    <p className="combat-setup-species">{preview.species?.name}</p>
                  </div>
                </div>
                <CharacterPreview character={preview} />
              </>
            ) : (
              <p className="combat-panel-empty">Click a character to add them to the party.</p>
            )}
            {error && <p className="task-warning">{error}</p>}
          </div>
        </div>
        <div className="combat-setup-party">
          <span className="combat-setup-party-label">
            Party {party.length} / {maxPartySize}
          </span>
          {party.map((member) => (
            <button key={member.id} type="button" className="combat-setup-member" title={`Remove ${member.name}`} onClick={() => setParty(party.filter((other) => other.id !== member.id))}>
              <CombatPortrait character={member} className="combat-setup-member-portrait" />
              <span>{member.name}</span>
            </button>
          ))}
        </div>
        <div className="combat-setup-actions">
          <button type="button" className="combat-button" onClick={onExit}>
            Back
          </button>
          <label className="combat-setup-seed">
            Seed
            <input type="text" inputMode="numeric" value={seedText} placeholder="Random" onChange={(event) => setSeedText(event.target.value)} />
            {seed === undefined && <span className="task-warning">Use a whole number</span>}
          </label>
          <button type="button" className="combat-button is-primary" disabled={!party.length || seed === undefined || !map || party.length > maxPartySize} onClick={() => onStart(party, seed, map)}>
            Start Combat
          </button>
        </div>
      </div>
    </div>
  )
}
