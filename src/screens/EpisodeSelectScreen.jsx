import { useEffect, useState } from 'react'
import WeatherFx from '../effects/WeatherFx.jsx'
import { CARD_WEATHER_WIDTH, cardFor, isDrawnCard } from '../maps/episodeCards.js'
import { weatherFor } from '../maps/mapWeather.js'
import { canSaveMaps, deleteMap, listMaps } from '../maps/mapFiles.js'
import { episodeTitle } from '../maps/mapFormat.js'

// Load Episode: every map file in maps/ is an episode (its name is the mission location). For now the prototype
// that plays it is chosen here too, as a development comparison tool.
const MODES = [
  { id: 'combat', label: 'Combat Type 1', text: 'Party of up to 4, initiative, Major and Minor actions.' },
  { id: 'exploration', label: 'Exploration', text: 'Away team movement: party selection, splitting up and formations. No enemies yet.' },
]

export default function EpisodeSelectScreen({ mode, onModeChange, onOpen, onBack }) {
  const [episodes, setEpisodes] = useState(null)
  const [problem, setProblem] = useState(null)
  // UI state: the episode the dev Delete button is asking about.
  const [deleting, setDeleting] = useState(null)
  useEffect(() => {
    let cancelled = false
    listMaps()
      .then((list) => !cancelled && setEpisodes(list))
      .catch((error) => !cancelled && setProblem(`Could not list episodes: ${error.message}`))
    return () => {
      cancelled = true
    }
  }, [])

  // Dev only: removes the map file and its generated thumbnail.
  const confirmDelete = async () => {
    const entry = deleting
    setDeleting(null)
    try {
      setEpisodes(await deleteMap(entry.id))
      setProblem(null)
    } catch (error) {
      setProblem(`Could not delete ${entry.name}: ${error.message}`)
    }
  }

  return (
    <div className="episode-select">
      <div className="episode-select-panel" inert={Boolean(deleting)}>
        <h2 className="episode-select-title">Load Episode</h2>
        <p className="episode-select-text">Choose a prototype, then an episode.</p>
        <div className="episode-select-modes">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`episode-select-option${option.id === mode ? ' is-selected' : ''}`}
              aria-pressed={option.id === mode}
              onClick={() => onModeChange(option.id)}
            >
              <span className="episode-select-label">{option.label}</span>
              <span className="episode-select-desc">{option.text}</span>
            </button>
          ))}
        </div>
        <ul className="episode-select-list">
          {episodes?.map((entry) => {
            const card = cardFor(entry.card)
            return (
              <li key={entry.id} className="episode-select-item">
                <button type="button" className="episode-select-option episode-select-card" onClick={() => onOpen(entry.id)}>
                  <span className="episode-select-art">
                    {card && <img src={card.image} alt="" onError={(event) => (event.currentTarget.hidden = true)} />}
                    {card && !isDrawnCard(entry.card) && <WeatherFx fx={weatherFor(entry.weather).fx} virtualWidth={CARD_WEATHER_WIDTH} />}
                  </span>
                  <span className="episode-select-label">{episodeTitle(entry)}</span>
                  <span className="episode-select-desc">Location: {entry.name}</span>
                </button>
                {canSaveMaps && (
                  <button
                    type="button"
                    className="dev-button episode-select-delete"
                    title={`Delete maps/${entry.id}.json`}
                    onClick={() => setDeleting(entry)}
                  >
                    Dev Delete
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        {problem && <p className="episode-select-text">{problem}</p>}
        {episodes && !episodes.length && <p className="episode-select-text">No episodes yet. Make a map in Dev Edit.</p>}
        <button type="button" className="episode-select-back" onClick={onBack}>
          Back
        </button>
      </div>
      {deleting && (
        <div className="menu-notice-backdrop">
          <div className="ship-builder-panel menu-notice delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="episode-delete-title">
            <h2 id="episode-delete-title" className="menu-notice-title">Are You Sure?</h2>
            <p className="menu-notice-text">
              Delete <strong>{episodeTitle(deleting)}</strong> (maps/{deleting.id}.json)? This cannot be undone.
            </p>
            <div className="menu-notice-actions">
              <button type="button" className="nav-button nav-back" onClick={() => setDeleting(null)} autoFocus>
                Keep
              </button>
              <button type="button" className="nav-button import-delete" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
