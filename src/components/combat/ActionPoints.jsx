function actionsLeft(turn) {
  return (turn.minorUsed ? 0 : 1) + (turn.majorUsed ? 0 : 1)
}

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

// This round's action points counting down as they are spent: "1 / 2" plus a lit chip per unused action.
export default function ActionPoints({ turn, className = '' }) {
  const left = actionsLeft(turn)
  return (
    <span
      className={`action-points${left === 0 ? ' is-empty' : ''} ${className}`}
      aria-label={`${left} of 2 actions left: Minor ${turn.minorUsed ? 'used' : 'available'}, Major ${turn.majorUsed ? 'used' : 'available'}`}
    >
      <span className="action-points-count">{left} / 2</span>
      <span className={`action-point${turn.minorUsed ? ' is-used' : ''}`}>Minor</span>
      <span className={`action-point${turn.majorUsed ? ' is-used' : ''}`}>Major</span>
    </span>
  )
}
