import { BAR_Y, LABEL_Y, POINTS_Y } from '../components/combat/battlefieldShared.js'

// Pixi combat badges sit under the Three canvas while spike3d is on.
// Mirror UnitView's chrome in the board SVG (above Spike3d) so stress, AP, cover and brackets still read.

const COVER_PATH = 'M0 -7 L6 -4.5 V0.5 C6 4 3.5 6.2 0 7.5 C-3.5 6.2 -6 4 -6 0.5 V-4.5 Z'
const FONT = 'Bahnschrift SemiCondensed, Bahnschrift, Arial Narrow, Roboto Condensed, sans-serif'

function CoverBadge({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <path d={COVER_PATH} fill="#2f8fd8" stroke="#d8f0ff" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M-2.6 0.2 L-0.6 2.2 L2.8 -1.8" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
    </g>
  )
}

function GuardBadge({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <rect x="-6.5" y="-6.5" width="13" height="13" rx="2" fill="#d8a32f" stroke="#fff4d8" strokeWidth="1.2" />
      <text x="0" y="3.5" textAnchor="middle" fill="#1a1204" style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800 }}>
        G
      </text>
    </g>
  )
}

function StressTrack({ track, x, y }) {
  const width = 30
  const max = track.maxStress ?? 0
  const filled = max > 0 ? Math.min(1, Math.max(0, track.stress / max)) * width : 0
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      {max > 0 && (
        <>
          <rect x={-width / 2} y="-2.5" width={width} height="5" rx="2" fill="#0b1428" stroke="#e8ecf5" strokeWidth="1" />
          {filled > 0 && (
            <rect
              x={-width / 2}
              y="-2.5"
              width={filled}
              height="5"
              rx={Math.min(2, filled / 2)}
              fill={track.fatigued ? '#c4342c' : '#e2463d'}
            />
          )}
        </>
      )}
      {(track.injuries ?? []).map((injury, index) => (
        <rect
          key={index}
          x={width / 2 + 3 + index * 7}
          y="-3.5"
          width="6"
          height="7"
          rx="1"
          fill={injury.type === 'stun' ? '#f6b928' : injury.type === 'deadly' ? '#e2463d' : '#000000'}
          stroke={injury.treated ? '#e8ecf5' : 'none'}
          strokeWidth={injury.treated ? 1.2 : 0}
        />
      ))}
    </g>
  )
}

function TurnBadge({ status, x, y }) {
  if (status.state === 'done') {
    return (
      <g transform={`translate(${x} ${y})`} pointerEvents="none">
        <circle r="6.5" fill="#4a5468" stroke="#c9d1e0" strokeWidth="1" />
        <path d="M-3 0.2 L-0.8 2.5 L3.2 -2.2" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    )
  }
  const { turn, movement } = status
  const wide = movement.sprintLeft > 0
  const point = (px, left) =>
    left > 0 ? (
      <rect x={px} y="-3.5" width="6" height="5" rx="1.5" fill="#3ccf7a" />
    ) : (
      <rect x={px} y="-3.5" width="6" height="5" rx="1.5" fill="#2b3242" stroke="#6b7486" strokeWidth="0.6" />
    )
  const label = (text, px, fill = '#3ccf7a') => (
    <text x={px} y="2.5" textAnchor="middle" fill={fill} style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700 }}>
      {text}
    </text>
  )
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <rect x="-34" y="-7" width={wide ? 82 : 68} height="12" rx="3" fill="#060c1c" fillOpacity="0.9" stroke="#3ccf7a" strokeWidth="0.8" />
      {label('M', -28)}
      {point(-23, turn.major)}
      {label('m', -11)}
      {point(-6, turn.minor)}
      <path d="M3.5 -5 L3.5 3" stroke="#3ccf7a" strokeWidth="0.6" opacity="0.5" />
      {label(`»${movement.left}/${movement.total}`, 18.5, movement.left ? '#7fd3ff' : '#6b7486')}
      {wide ? label(`+${movement.sprintLeft}`, 40, '#7fd3ff') : null}
    </g>
  )
}

function TargetBrackets({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none" fill="none" stroke="#e2463d" strokeWidth="2">
      <path d="M-22 -40 L-22 -54 L-14 -54" />
      <path d="M22 -40 L22 -54 L14 -54" />
      <path d="M-22 -2 L-22 6 L-14 6" />
      <path d="M22 -2 L22 6 L14 6" />
    </g>
  )
}

/**
 * figures: combat board figures with centre + optional statusLabel, guard, cover,
 * stressTrack, conditionY, turnStatus, target (same fields UnitView badges use).
 */
export default function Spike3dCombatBadges({ figures }) {
  return (
    <g className="spike3d-combat-badges" pointerEvents="none">
      {figures.map((figure) => {
        if (!figure?.centre || figure.beam === 'waiting') return null
        const { x, y } = figure.centre
        const conditionY = figure.conditionY ?? BAR_Y
        const hasChrome =
          figure.statusLabel ||
          figure.guard ||
          figure.cover ||
          figure.stressTrack ||
          figure.turnStatus ||
          figure.target
        if (!hasChrome) return null
        return (
          <g key={figure.id}>
            {figure.cover && <CoverBadge x={x + 16} y={y - 48} />}
            {figure.guard && <GuardBadge x={x - 16} y={y - 48} />}
            {figure.stressTrack && <StressTrack track={figure.stressTrack} x={x} y={y + conditionY} />}
            {figure.turnStatus && <TurnBadge status={figure.turnStatus} x={x} y={y + POINTS_Y} />}
            {figure.statusLabel && (
              <text
                x={x}
                y={y + LABEL_Y}
                textAnchor="middle"
                fill="#f2e6c4"
                stroke="#000000"
                strokeWidth="3"
                paintOrder="stroke"
                style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700 }}
              >
                {figure.statusLabel}
              </text>
            )}
            {figure.target && <TargetBrackets x={x} y={y} />}
          </g>
        )
      })}
    </g>
  )
}
