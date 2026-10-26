import { useEffect, useState } from 'react'
import WeatherFx from '../effects/WeatherFx.jsx'
import { CARD_WEATHER_WIDTH, cardFor, isDrawnCard } from '../maps/episodeCards.js'
import { weatherFor } from '../maps/mapWeather.js'
import { canSaveMaps, deleteMap, listMaps } from '../maps/mapFiles.js'
import { episodeTitle } from '../maps/mapFormat.js'

// Load Episode: every map file in maps/ is an episode (its name is the mission location). Exploration and Combat
// choose which prototype Begin opens. The grid shape keeps every card inside the frame, with no scrollbar.
const MODES = [
  { id: 'exploration', label: 'Exploration' },
  { id: 'combat', label: 'Combat' },
]

function gridShape(count) {
  if (count <= 4) return { columns: Math.max(count, 1), rows: 1 }
  if (count <= 8) return { columns: 4, rows: 2 }
  const columns = Math.min(6, Math.ceil(count / 3))
  return { columns, rows: Math.ceil(count / columns) }
}

export default function EpisodeSelectScreen({ mode, mapId, onModeChange, onBegin, onBack }) {
  const [episodes, setEpisodes] = useState(null)
  const [problem, setProblem] = useState(null)
  // UI state: the episode card the player has chosen, and the one the dev Delete button is asking about.
  const [selectedId, setSelectedId] = useState(mapId)
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
      setSelectedId((current) => (current === entry.id ? null : current))
      setProblem(null)
    } catch (error) {
      setProblem(`Could not delete ${entry.name}: ${error.message}`)
    }
  }

  const selected = episodes?.find((entry) => entry.id === selectedId) ?? null
  const shape = gridShape(episodes?.length ?? 0)

  return (
    <div className="episode-select">
      <div className="episode-select-panel lcars-frame" inert={Boolean(deleting)}>
        <h2 className="episode-select-title">Load Episode</h2>
        <div className="episode-select-modes" role="group" aria-label="How to play">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`episode-select-mode${option.id === mode ? ' is-selected' : ''}`}
              aria-pressed={option.id === mode}
              onClick={() => onModeChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="episode-select-gallery">
          {problem && <p className="episode-select-text">{problem}</p>}
          {episodes && !episodes.length && <p className="episode-select-text">No episodes yet. Make a map in Dev Edit.</p>}
          {!episodes && !problem && <p className="episode-select-text">Loading episodes…</p>}
          {episodes?.length > 0 && (
            <ul
              className="episode-select-list"
              style={{ gridTemplateColumns: `repeat(${shape.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${shape.rows}, minmax(0, 1fr))` }}
            >
              {episodes.map((entry) => {
                const card = cardFor(entry.card)
                const isSelected = entry.id === selected?.id
                return (
                  <li key={entry.id} className="episode-select-item">
                    <button
                      type="button"
                      className={`episode-select-card${isSelected ? ' is-selected' : ''}`}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedId(entry.id)}
                    >
                      <span className="episode-select-art">
                        {card && <img src={card.image} alt="" onError={(event) => (event.currentTarget.hidden = true)} />}
                        {card && !isDrawnCard(entry.card) && <WeatherFx fx={weatherFor(entry.weather).fx} virtualWidth={CARD_WEATHER_WIDTH} />}
                      </span>
                      <span className="episode-select-label">{episodeTitle(entry)}</span>
                      <span className="episode-select-desc">{entry.name}</span>
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
          )}
        </div>
        <div className="episode-select-actions">
          <button type="button" className="nav-button episode-select-back" onClick={onBack}>
            Back
          </button>
          <button type="button" className="nav-button nav-next" disabled={!selected} onClick={() => onBegin(selected.id)}>
            Begin
          </button>
        </div>
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
