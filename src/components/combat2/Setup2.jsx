import { useState } from 'react'
import { normalizeCharacterRecord } from '../../character/runtimeCharacter.js'
import { ACTION_IDS, ACTION_SPECS, buildActionTask, getPhaser, TUNING } from '../../combat2/actions2.js'
import { ENEMY_SPAWNS_NEEDED } from '../../combat2/combat2State.js'
import { episodeTitle, validateMap } from '../../maps/mapFormat.js'
import CombatPortrait from '../combat/CombatPortrait.jsx'
import useEpisodeMap from '../maps/useEpisodeMap.js'

// Combat Type 2 picks one existing character (saved, or a JSON export file). The first one carrying a phaser is preselected.
function buildRoster(savedCharacters, loaded) {
  const saved = savedCharacters.map((entry) => {
    const { character, error } = normalizeCharacterRecord(entry.record, { id: entry.id })
    return { id: entry.id, label: entry.name || entry.id, character, error }
  })
  return [...saved, ...loaded.map((character) => ({ id: character.id, label: `${character.name} (file)`, character, error: null }))]
}

export default function Setup2({ savedCharacters, initialCharacter, mapId, onStart, onBack }) {
  const { map, problem: mapProblem } = useEpisodeMap(mapId)
  const mapWarnings = map ? validateMap(map, { enemySpawns: ENEMY_SPAWNS_NEEDED, label: 'Combat Type 2' }) : []
  const mapPlayable = Boolean(map?.markers.playerStarts.length)
  const [loaded, setLoaded] = useState(() => (initialCharacter?.id.startsWith('file:') ? [initialCharacter] : []))
  const roster = buildRoster(savedCharacters, loaded)
  const [chosenId, setChosenId] = useState(
    () => initialCharacter?.id ?? roster.find((entry) => entry.character && getPhaser(entry.character))?.id ?? roster.find((entry) => entry.character)?.id ?? null,
  )
  const [error, setError] = useState(null)
  const chosen = roster.find((entry) => entry.id === chosenId)?.character ?? null

  const loadFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const { character, error: problem } = normalizeCharacterRecord(JSON.parse(await file.text()), { id: `file:${file.name}` })
      setError(problem ?? null)
      if (!character) return
      setLoaded([...loaded.filter((other) => other.id !== character.id), character])
      setChosenId(character.id)
    } catch {
      setError(`${file.name} is not valid JSON.`)
    }
  }

  return (
    <div className="c2-setup">
      <div className="c2-panel c2-setup-panel">
        <p className="c2-setup-title">Combat Type 2: Tactical Positioning Test</p>
        <p className="c2-muted">
          One character against two Klingons. {TUNING.actionPoints} AP per turn; every action costs 1. Uses the values saved in the character's JSON.
        </p>
        <div className="c2-setup-map">
          {map && (
            <span>
              Episode: {episodeTitle(map)} &middot; Location: {map.name}
            </span>
          )}
          {mapProblem && <span className="c2-warning">{mapProblem}</span>}
          {!mapProblem && !map && <span className="c2-muted">Loading...</span>}
          {mapWarnings.map((warning) => (
            <span key={warning} className="c2-warning">
              {warning}
            </span>
          ))}
        </div>
        <div className="c2-setup-body">
          <ul className="c2-setup-list">
            {roster.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`c2-setup-entry${entry.id === chosenId ? ' is-selected' : ''}`}
                  aria-pressed={entry.id === chosenId}
                  disabled={!entry.character}
                  title={entry.error ?? undefined}
                  onClick={() => setChosenId(entry.id)}
                >
                  <span>{entry.label}</span>
                  {entry.character && getPhaser(entry.character) && <span className="c2-setup-tag">Phaser</span>}
                </button>
              </li>
            ))}
            <li>
              <label className="c2-setup-entry is-file">
                Load character JSON...
                <input type="file" accept=".json,application/json" onChange={loadFile} hidden />
              </label>
            </li>
          </ul>
          <div className="c2-setup-detail">
            {chosen ? (
              <>
                <div className="c2-setup-heading">
                  <CombatPortrait character={chosen} className="c2-setup-portrait" />
                  <div>
                    <p className="c2-character-name">{chosen.name}</p>
                    <p className="c2-muted">{chosen.species?.name}</p>
                  </div>
                </div>
                <dl className="c2-detail-rows">
                  {ACTION_IDS.filter((id) => id !== 'move').map((id) => {
                    const task = buildActionTask(chosen, id)
                    return (
                      <div key={id} className="c2-setup-row">
                        <dt>{ACTION_SPECS[id].name}</dt>
                        <dd>
                          {task.attribute.name} {task.attribute.value} + {task.discipline.name} {task.discipline.value} = TN {task.targetNumber}
                          {id === 'phaser' && !getPhaser(chosen) ? ' (no phaser carried)' : ''}
                        </dd>
                      </div>
                    )
                  })}
                  <div className="c2-setup-row">
                    <dt>Move</dt>
                    <dd>{TUNING.moveTiles} tiles per action</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="c2-muted">Choose a character.</p>
            )}
            {error && <p className="c2-warning">{error}</p>}
          </div>
        </div>
        <div className="c2-setup-actions">
          <button type="button" className="c2-button" onClick={onBack}>
            Back
          </button>
          <button type="button" className="c2-button is-primary" disabled={!chosen || !mapPlayable} onClick={() => onStart(chosen, map)}>
            Start Combat
          </button>
        </div>
      </div>
    </div>
  )
}
