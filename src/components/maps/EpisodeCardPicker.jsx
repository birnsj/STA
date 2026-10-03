import { cardFor, EPISODE_CARDS, isDrawnCard } from '../../maps/episodeCards.js'

// The map editor's Episode Card section: a preview of the episode's Load Episode picture, a list of the catalogue cards
// (plus the episode's own generated picture), and Generate Card (onGenerate draws a new picture for the map).
export default function EpisodeCardPicker({ cardId, canGenerate, busy, onCard, onGenerate }) {
  const card = cardFor(cardId)
  return (
    <>
      <div className="me-card-preview">
        {card ? <img src={card.image} alt={card.label} /> : <span>{cardId ? `Missing card: ${cardId}` : 'No card'}</span>}
      </div>
      <select className="me-select me-card-select" value={card ? card.id : ''} aria-label="Episode card" onChange={(event) => onCard(event.target.value || null)}>
        <option value="">No card</option>
        {isDrawnCard(cardId) && <option value={cardId}>Generated picture</option>}
        {EPISODE_CARDS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="me-button me-generate"
        disabled={!canGenerate || busy}
        title={canGenerate ? 'Draws a new random picture for this location and biome' : 'Generating pictures only works from the dev server'}
        onClick={onGenerate}
      >
        {busy ? 'Drawing...' : 'Generate Card'}
      </button>
    </>
  )
}
