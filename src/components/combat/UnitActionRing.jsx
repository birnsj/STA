import { project } from '../../maps/iso.js'
import { ACTION_ICONS } from './actionIcons.js'

// Button arcs around a unit on the map; radius and spread are world pixels at the unit's scale. Angles are in degrees,
// 0 = right, 90 = straight down.
// around (combat): down its left side, under it and up its right side, leaving its Stress and AP markers above clear.
// top (exploration): over its head from side to side.
// labelY: the label's baseline under the button's centre. Detail lines stack under the label, or above the button on the
// top ring (detailsAbove) so they grow outward instead of over the unit's head; detailLine is their line height.
// frame (prominent rings): the band behind them, reaching inside / outside the button centres and past the end
// buttons, wide enough for the labels (inward on the top buttons, along the band at the ends).
const LAYOUTS = {
  around: { centreY: -28, radius: 50, arcStart: 200, arcEnd: -20, buttonR: 13, labelY: 22, spacing: 40, detailSpacing: 52, detailLine: 8, detailsAbove: false, frame: { inside: 30, outside: 24, end: 30 } },
  top: { centreY: -34, radius: 46, arcStart: 175, arcEnd: 365, buttonR: 9, labelY: 16, spacing: 36, detailSpacing: 72, detailLine: 7, detailsAbove: true, frame: { inside: 21, outside: 14, end: 20 } },
}

function detailY(layout, lineIndex, lineCount) {
  if (layout.detailsAbove) return -(layout.buttonR + 4) - (lineCount - 1 - lineIndex) * layout.detailLine
  return layout.buttonR + 18 + lineIndex * layout.detailLine
}

// An annular sector (degrees, 0 = right, 90 = down) from inner to outer radius around (0, cy).
function bandPath(cy, inner, outer, from, to) {
  const point = (radius, angle) => {
    const radians = (angle * Math.PI) / 180
    return `${(Math.cos(radians) * radius).toFixed(1)} ${(cy + Math.sin(radians) * radius).toFixed(1)}`
  }
  const large = Math.abs(to - from) > 180 ? 1 : 0
  const sweep = to > from ? 1 : 0
  return `M${point(outer, from)} A${outer} ${outer} 0 ${large} ${sweep} ${point(outer, to)} L${point(inner, to)} A${inner} ${inner} 0 ${large} ${1 - sweep} ${point(inner, from)} Z`
}

const arcRadians = (layout) => (Math.abs(layout.arcStart - layout.arcEnd) * Math.PI) / 180
// Long rings (the acting character's own actions) widen so neighbouring buttons and labels don't overlap.
const ringRadius = (layout, count, spacing) => Math.max(layout.radius, ((count - 1) * spacing) / arcRadians(layout))

function buttonPosition(layout, index, count, spacing) {
  const middle = (layout.arcStart + layout.arcEnd) / 2
  const angle = count === 1 ? middle : layout.arcStart + ((layout.arcEnd - layout.arcStart) * index) / (count - 1)
  const radians = (angle * Math.PI) / 180
  const radius = ringRadius(layout, count, spacing)
  return { x: Math.cos(radians) * radius, y: layout.centreY + Math.sin(radians) * radius }
}

// Clicks on the ring must not reach the tiles or units underneath.
const stop = (event) => event.stopPropagation()

// buttons: [{ id, label, details, icon, tone, enabled, active, pressed, title, onClick }], pressed: a key; while set the
// button plays its press once per key (Auto Combat showing the AI's choice); details: smaller lines under the label
// (e.g. an attack's Severity and Threat); info: { title, rows: [[label, value]], tips?: [text] } or null. placement: 'around' or 'top'
// (see LAYOUTS); prominent: framed by a panel band along the arc.
export default function UnitActionRing({ position, buttons, info, onPointerEnter, onPointerLeave, placement = 'around', prominent = false }) {
  const layout = LAYOUTS[placement]
  const centre = project(position)
  const spacing = buttons.some((button) => button.details?.length) ? layout.detailSpacing : layout.spacing
  const radius = ringRadius(layout, buttons.length, spacing)
  // The band reaches past the end buttons far enough to hold their labels.
  const { inside, end } = layout.frame
  const mostDetails = Math.max(0, ...buttons.map((button) => button.details?.length ?? 0))
  const outside = layout.frame.outside + (layout.detailsAbove ? mostDetails * layout.detailLine : 0)
  const endPad = (end / radius) * (180 / Math.PI) * Math.sign(layout.arcEnd - layout.arcStart)
  const frame = prominent && (
    <path className="unit-ring-frame" d={bandPath(layout.centreY, radius - inside, radius + outside, layout.arcStart - endPad, layout.arcEnd + endPad)} />
  )
  // A framed ring's info panel sits clear of its band.
  const infoX = prominent ? radius + outside + 8 : radius + 22
  // Icons are drawn on a 24-unit grid, sized to the button (0.625 at the 13-unit combat button).
  const iconScale = (0.625 * layout.buttonR) / 13
  return (
    <g
      className={`unit-ring${prominent ? ' is-prominent' : ''}`}
      transform={`translate(${centre.x} ${centre.y})`}
      onClick={stop}
      onPointerDown={stop}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {frame}
      {buttons.map((button, index) => {
        const { x, y } = buttonPosition(layout, index, buttons.length, spacing)
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
            {button.pressed && <circle key={`ripple-${button.pressed}`} className="unit-ring-ripple" r={layout.buttonR} />}
            <g key={button.pressed ?? 'face'} className={`unit-ring-face${button.pressed ? ' is-pressed' : ''}`}>
              <circle r={layout.buttonR} />
              <path d={ACTION_ICONS[button.icon]} transform={`scale(${iconScale}) translate(-12 -12)`} />
            </g>
            <text y={layout.labelY} textAnchor="middle">
              {button.label}
            </text>
            {button.details?.map((line, lineIndex) => (
              <text key={line} className="unit-ring-detail" y={detailY(layout, lineIndex, button.details.length)} textAnchor="middle">
                {line}
              </text>
            ))}
          </g>
        )
      })}
      {info && (
        <foreignObject x={infoX} y={layout.centreY - 52} width="200" height="360">
          <div className="unit-ring-info">
            <p className="unit-ring-info-title">{info.title}</p>
            {info.rows.map(([label, value]) => (
              <p key={label} className="unit-ring-info-row">
                <span>{label}</span>
                <span>{value}</span>
              </p>
            ))}
            {info.tips?.map((tip) => (
              <p key={tip} className="unit-ring-info-tip">
                {tip}
              </p>
            ))}
          </div>
        </foreignObject>
      )}
    </g>
  )
}
