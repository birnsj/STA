import { useEffect, useState } from 'react'
import { MAX_MOMENTUM } from '../../rules/missionResources.js'
import { playMomentumLossSound, playMomentumSound } from '../../audio/uiSounds.js'

// The mission's group Momentum (0-6) and Threat pools (rules/missionResources.js), shown in exploration and combat alike.
// When Momentum goes up, the newly lit pips pop, the bar flashes and a chime plays; when it goes down, a short falling
// tone plays. The amount the pool opened with doesn't sound.
export default function ResourceIndicators({ momentum, threat, canCancelThreat = false, onCancelThreat }) {
  const [change, setChange] = useState({ seen: momentum, from: momentum, key: 0 })
  // Adjusted while rendering so the pop starts on the same frame the pip lights.
  let next = change
  if (momentum !== next.seen) {
    next = { seen: momentum, from: next.seen, key: next.key + 1 }
    setChange(next)
  }
  useEffect(() => {
    if (next.key === 0) return
    if (next.seen > next.from) playMomentumSound(next.seen)
    else if (next.seen < next.from) playMomentumLossSound(next.seen)
  }, [next.key, next.seen, next.from])
  const gaining = next.seen > next.from
  return (
    <div className="resource-indicators">
      <span
        key={gaining ? `gain-${next.key}` : 'momentum'}
        className={`resource-indicator is-momentum${momentum ? ' is-on' : ''}${gaining ? ' is-gaining' : ''}`}
        title={`Group Momentum (max ${MAX_MOMENTUM}): buy bonus d20s, or Direct an ally in combat`}
      >
        Momentum
        <span className="resource-pips" aria-hidden="true">
          {Array.from({ length: MAX_MOMENTUM }, (_, index) => (
            <span
              key={index}
              className={`resource-light${index < momentum ? ' is-filled' : ''}${gaining && index >= next.from && index < momentum ? ' is-new' : ''}`}
              style={gaining && index >= next.from ? { animationDelay: `${(index - next.from) * 90}ms` } : undefined}
            />
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
