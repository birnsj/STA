// Load Episode: for now a development comparison tool that picks which combat prototype to test.
const OPTIONS = [
  { id: 'combat', label: 'Combat Type 1', text: 'The existing combat prototype: party of up to 4, initiative, Major and Minor actions, on the Engineering Deck.' },
  { id: 'combat2', label: 'Combat Type 2', text: 'Experimental tactical positioning: 1 character, 2 AP per turn, enemy intents, Push and an EPS hazard, on a new maintenance-section map.' },
]

export default function EpisodeSelectScreen({ onOpen, onBack }) {
  return (
    <div className="episode-select">
      <div className="episode-select-panel">
        <h2 className="episode-select-title">Load Episode</h2>
        <p className="episode-select-text">Choose which combat prototype to test.</p>
        <div className="episode-select-options">
          {OPTIONS.map((option) => (
            <button key={option.id} type="button" className="episode-select-option" onClick={() => onOpen(option.id)}>
              <span className="episode-select-label">{option.label}</span>
              <span className="episode-select-desc">{option.text}</span>
            </button>
          ))}
        </div>
        <button type="button" className="episode-select-back" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}
