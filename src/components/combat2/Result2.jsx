export default function Result2({ outcome, round, onRestart, onExit }) {
  const victory = outcome === 'victory'
  return (
    <div className="c2-modal-backdrop">
      <div className={`c2-panel c2-result${victory ? ' is-victory' : ' is-defeat'}`} role="dialog" aria-modal="true">
        <p className="c2-result-title">{victory ? 'Victory' : 'Defeat'}</p>
        <p>{victory ? `All Klingon intruders are down after ${round} rounds.` : 'Your character has taken 3 Hits and is injured.'}</p>
        <div className="c2-result-actions">
          <button type="button" className="c2-button is-primary" onClick={onRestart}>
            Restart Combat Type 2
          </button>
          <button type="button" className="c2-button" onClick={onExit}>
            Return to Menu
          </button>
        </div>
      </div>
    </div>
  )
}
