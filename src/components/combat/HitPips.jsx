import { MAX_HITS } from '../../combat/combatState.js'

// Three Hit indicators (no HP bars): filled = Hit taken.
export default function HitPips({ hits, svg = false }) {
  const pips = Array.from({ length: MAX_HITS }, (_, index) => index < hits)
  if (svg) {
    return (
      <g className="hit-pips-svg">
        {pips.map((filled, index) => (
          <circle key={index} className={filled ? 'is-filled' : ''} cx={(index - 1) * 9} cy="0" r="3.5" />
        ))}
      </g>
    )
  }
  return (
    <span className="hit-pips" role="img" aria-label={`${hits} of ${MAX_HITS} Hits`}>
      {pips.map((filled, index) => (
        <span key={index} className={`hit-pip${filled ? ' is-filled' : ''}`} />
      ))}
    </span>
  )
}
