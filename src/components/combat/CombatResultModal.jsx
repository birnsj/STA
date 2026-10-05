// onContinue: set for combat started in the exploration world; the fight's result then only leads back to exploration.
export default function CombatResultModal({ outcome, onRestart, onChangeCharacter, onExit, onContinue = null }) {
  const text = onContinue
    ? outcome === 'victory'
      ? 'The hostiles have been stopped.'
      : 'Your party has been taken out of the fight.'
    : outcome === 'victory'
      ? 'The Klingon boarding party has been stopped.'
      : 'Your party has been taken out of the fight.'
  return (
    <div className="combat-modal-backdrop">
      <div className={`combat-modal is-${outcome}`} role="dialog" aria-modal="true" aria-labelledby="combat-result-title">
        <h2 id="combat-result-title" className="combat-modal-title">
          {outcome === 'victory' ? 'Victory' : 'Defeat'}
        </h2>
        <p className="combat-modal-text">{text}</p>
        <div className="combat-modal-actions">
          {onContinue ? (
            <button type="button" className="combat-button is-primary" onClick={onContinue}>
              Return to Exploration
            </button>
          ) : (
            <>
              <button type="button" className="combat-button is-primary" onClick={onRestart}>
                Restart
              </button>
              <button type="button" className="combat-button" onClick={onChangeCharacter}>
                Change Party
              </button>
              <button type="button" className="combat-button" onClick={onExit}>
                Main Menu
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
