// Momentum and Threat are binary (designer spec): each is simply on or off.
export default function ResourceIndicators({ momentum, threat, canCancelThreat, onCancelThreat }) {
  return (
    <div className="resource-indicators">
      <span className={`resource-indicator is-momentum${momentum ? ' is-on' : ''}`} title="Momentum: +1 Hit after a hit, reroll one die, or cancel Threat">
        <span className="resource-light" aria-hidden="true" />
        Momentum <strong>{momentum ? 'On' : 'Off'}</strong>
      </span>
      <span className={`resource-indicator is-threat${threat ? ' is-on' : ''}`} title="Threat: +1 Difficulty on your next task">
        <span className="resource-light" aria-hidden="true" />
        Threat <strong>{threat ? 'On' : 'Off'}</strong>
      </span>
      {canCancelThreat && (
        <button type="button" className="resource-cancel" onClick={onCancelThreat}>
          Cancel Threat
        </button>
      )}
    </div>
  )
}
