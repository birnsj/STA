import { TURN_AP } from '../../combat/combatState.js'

// Check-in-circle marker for a character whose turn is used up. Pass svg when drawing inside the battlefield SVG.
export function DoneIcon({ size = 14, svg = false, className = '' }) {
  const icon = (
    <g className={`done-icon${svg ? ` ${className}` : ''}`}>
      <circle cx="0" cy="0" r="6.5" />
      <path d="M-3 0.2 L-0.8 2.5 L3.2 -2.2" />
    </g>
  )
  if (svg) return icon
  return (
    <svg className={`done-icon-svg ${className}`} width={size} height={size} viewBox="-7.5 -7.5 15 15" aria-hidden="true">
      {icon}
    </svg>
  )
}

// This turn's action points counting down as they are spent: "AP 1 / 2" plus a lit pip per unspent point.
export default function ActionPoints({ turn, className = '' }) {
  const left = turn.ap
  return (
    <span className={`action-points${left === 0 ? ' is-empty' : ''} ${className}`} aria-label={`${left} of ${TURN_AP} AP left`}>
      <span className="action-points-count">AP {left} / {TURN_AP}</span>
      {Array.from({ length: TURN_AP }, (_, index) => (
        <span key={index} className={`action-point is-pip${index < left ? '' : ' is-used'}`} />
      ))}
    </span>
  )
}
