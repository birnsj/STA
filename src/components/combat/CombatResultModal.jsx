// onContinue: set for combat started in the exploration world; the fight's result then only leads back to exploration.
// Otherwise onExit is Exit Mission (the away team beams up, then the main menu).
// failedNames: the NPCs the map marks Must survive that were in this fight (missionObjectives.js); any shows Mission
// Failed whatever the outcome, with only Exit Mission (onExitMission) when given. A fight in the world the party lost
// ends the mission too (designer decision, 2026-10-25): it reads Defeat, with only Exit Mission.
export default function CombatResultModal({ outcome, onRestart, onChangeCharacter, onExit, onContinue = null, failedNames = [], onExitMission = null }) {
  const failed = failedNames.length > 0
  const missionLost = Boolean(onContinue) && outcome === 'defeat'
  const text = failed
    ? `We failed to protect ${failedNames.join(', ')}.`
    : onContinue
      ? outcome === 'victory'
        ? 'The hostiles have been stopped.'
        : 'Your party has been taken out of the fight. The mission has failed.'
      : outcome === 'victory'
        ? 'The Klingon boarding party has been stopped.'
        : 'Your party has been taken out of the fight.'
  return (
    <div className="combat-modal-backdrop">
      <div className={`combat-modal is-${failed ? 'defeat' : outcome}`} role="dialog" aria-modal="true" aria-labelledby="combat-result-title">
        <h2 id="combat-result-title" className="combat-modal-title">
          {failed ? 'Mission Failed' : outcome === 'victory' ? 'Victory' : 'Defeat'}
        </h2>
        <p className="combat-modal-text">{text}</p>
        <div className="combat-modal-actions">
          {(failed || missionLost) && onExitMission ? (
            <button type="button" className="combat-button is-primary" onClick={onExitMission} autoFocus>
              Exit Mission
            </button>
          ) : onContinue ? (
            <button type="button" className="combat-button is-primary is-advance" onClick={onContinue}>
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
                Exit Mission
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
