import { project } from '../../maps/iso.js'
import { ACTION_ICONS } from './actionIcons.js'

// Buttons in an arc around a unit on the map: down its left side, under it and up its right side, leaving its Hits
// and AP markers above clear. Radius and spread are world pixels at the unit's scale.
const CENTRE_Y = -28
const RADIUS = 50
const ARC_START = 200
const ARC_END = -20
const BUTTON_R = 13

function buttonPosition(index, count) {
  const angle = count === 1 ? 90 : ARC_START + ((ARC_END - ARC_START) * index) / (count - 1)
  const radians = (angle * Math.PI) / 180
  return { x: Math.cos(radians) * RADIUS, y: CENTRE_Y + Math.sin(radians) * RADIUS }
}

// Clicks on the ring must not reach the tiles or units underneath.
const stop = (event) => event.stopPropagation()

// buttons: [{ id, label, icon, tone, enabled, active, title, onClick }]; info: { title, rows: [[label, value]] } or null.
export default function UnitActionRing({ position, buttons, info }) {
  const centre = project(position)
  return (
    <g className="unit-ring" transform={`translate(${centre.x} ${centre.y})`} onClick={stop} onPointerDown={stop}>
      {buttons.map((button, index) => {
        const { x, y } = buttonPosition(index, buttons.length)
        return (
          <g
            key={button.id}
            className={`unit-ring-button is-${button.tone ?? button.id}${button.enabled ? '' : ' is-disabled'}${button.active ? ' is-active' : ''}`}
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
            role="button"
            aria-label={button.label}
            aria-disabled={!button.enabled}
            data-ui-sound={button.enabled ? '' : undefined}
            onClick={button.enabled ? button.onClick : undefined}
          >
            <title>{button.title}</title>
            <circle r={BUTTON_R} />
            <path d={ACTION_ICONS[button.icon]} transform="translate(-7.5 -7.5) scale(0.625)" />
            <text y={BUTTON_R + 9} textAnchor="middle">
              {button.label}
            </text>
          </g>
        )
      })}
      {info && (
        <foreignObject x={RADIUS + 22} y={CENTRE_Y - 52} width="168" height="124">
          <div className="unit-ring-info">
            <p className="unit-ring-info-title">{info.title}</p>
            {info.rows.map(([label, value]) => (
              <p key={label} className="unit-ring-info-row">
                <span>{label}</span>
                <span>{value}</span>
              </p>
            ))}
          </div>
        </foreignObject>
      )}
    </g>
  )
}
