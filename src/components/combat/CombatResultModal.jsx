export default function CombatResultModal({ outcome, onRestart, onChangeCharacter, onExit }) {
  return (
    <div className="combat-modal-backdrop">
      <div className={`combat-modal is-${outcome}`} role="dialog" aria-modal="true" aria-labelledby="combat-result-title">
        <h2 id="combat-result-title" className="combat-modal-title">
          {outcome === 'victory' ? 'Victory' : 'Defeat'}
        </h2>
        <p className="combat-modal-text">{outcome === 'victory' ? 'The Klingon boarding party has been stopped.' : 'Your party has been taken out of the fight.'}</p>
        <div className="combat-modal-actions">
          <button type="button" className="combat-button is-primary" onClick={onRestart}>
            Restart
          </button>
          <button type="button" className="combat-button" onClick={onChangeCharacter}>
            Change Party
          </button>
          <button type="button" className="combat-button" onClick={onExit}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  )
}
