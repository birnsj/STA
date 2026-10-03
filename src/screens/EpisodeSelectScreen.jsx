import { useEffect, useState } from 'react'
import { cardFor } from '../maps/episodeCards.js'
import { listMaps } from '../maps/mapFiles.js'
import { episodeTitle } from '../maps/mapFormat.js'

// Load Episode: every map file in maps/ is an episode (its name is the mission location). For now the combat prototype
// that plays it is chosen here too, as a development comparison tool.
const MODES = [
  { id: 'combat', label: 'Combat Type 1', text: 'Party of up to 4, initiative, Major and Minor actions.' },
  { id: 'combat2', label: 'Combat Type 2', text: 'Tactical positioning: 1 character, 2 AP per turn, enemy intents, Push and an EPS hazard.' },
]

export default function EpisodeSelectScreen({ mode, onModeChange, onOpen, onBack }) {
  const [episodes, setEpisodes] = useState(null)
  const [problem, setProblem] = useState(null)
  useEffect(() => {
    let cancelled = false
    listMaps()
      .then((list) => !cancelled && setEpisodes(list))
      .catch((error) => !cancelled && setProblem(`Could not list episodes: ${error.message}`))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="episode-select">
      <div className="episode-select-panel">
        <h2 className="episode-select-title">Load Episode</h2>
        <p className="episode-select-text">Choose a combat prototype, then an episode.</p>
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
              <li key={entry.id}>
                <button type="button" className="episode-select-option episode-select-card" onClick={() => onOpen(entry.id)}>
                  <span className="episode-select-art">{card && <img src={card.image} alt="" />}</span>
                  <span className="episode-select-label">{episodeTitle(entry)}</span>
                  <span className="episode-select-desc">Location: {entry.name}</span>
                </button>
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
    </div>
  )
}
