import { actionsLeft } from '../../combat/combatState.js'

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

// This turn's actions (Book p.288: one Major and one Minor): a lit pip for each still unspent.
export default function ActionPoints({ turn, className = '' }) {
  const left = actionsLeft(turn)
  return (
    <span className={`action-points${left === 0 ? ' is-empty' : ''} ${className}`} aria-label={`${turn.major} Major and ${turn.minor} Minor action left`}>
      <span className="action-points-count">Major</span>
      <span className={`action-point is-pip${turn.major > 0 ? '' : ' is-used'}`} />
      <span className="action-points-count">Minor</span>
      <span className={`action-point is-pip${turn.minor > 0 ? '' : ' is-used'}`} />
    </span>
  )
}
