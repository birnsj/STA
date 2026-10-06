import { MAX_MOMENTUM } from '../../rules/missionResources.js'

// The mission's group Momentum (0-6) and Threat pools (rules/missionResources.js), shown in exploration and combat alike.
export default function ResourceIndicators({ momentum, threat, canCancelThreat = false, onCancelThreat }) {
  return (
    <div className="resource-indicators">
      <span className={`resource-indicator is-momentum${momentum ? ' is-on' : ''}`} title={`Group Momentum (max ${MAX_MOMENTUM}): buy bonus d20s, or Direct an ally in combat`}>
        Momentum
        <span className="resource-pips" aria-hidden="true">
          {Array.from({ length: MAX_MOMENTUM }, (_, index) => (
            <span key={index} className={`resource-light${index < momentum ? ' is-filled' : ''}`} />
          ))}
        </span>
        <strong>
          {momentum}/{MAX_MOMENTUM}
        </strong>
      </span>
      <span className={`resource-indicator is-threat${threat ? ' is-on' : ''}`} title="Threat: the mission's pool for the opposition (grows from Deadly attacks, NPC Momentum and dice bought with Threat)">
        <span className="resource-light" aria-hidden="true" />
        Threat <strong>{threat}</strong>
      </span>
      {canCancelThreat && (
        <button type="button" className="resource-cancel" onClick={onCancelThreat} title="Spend 1 Momentum to remove 1 Threat">
          Cancel 1 Threat
        </button>
      )}
    </div>
  )
}
