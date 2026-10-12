import { useId } from 'react'
import { project } from '../../maps/iso.js'
import { useUniformImage } from '../useUniformImage.js'
import { ACTION_ICONS } from './actionIcons.js'

// Button arcs around a unit on the map; radius and spread are world pixels at the unit's scale. Angles are in degrees,
// 0 = right, 90 = straight down.
// around: down its left side, under it and up its right side, leaving its Stress and AP markers above clear.
// top (exploration and combat): over its head from side to side.
// labelY: the label's baseline under the button's centre.
// frame (prominent rings): the band behind them, reaching inside / outside the button centres and past the end
// buttons, wide enough for the labels (inward on the top buttons, along the band at the ends).
const LAYOUTS = {
  around: { centreY: -28, radius: 50, arcStart: 200, arcEnd: -20, buttonR: 13, labelY: 22, spacing: 40, frame: { inside: 30, outside: 24, end: 30 } },
  top: { centreY: -34, radius: 46, arcStart: 175, arcEnd: 365, buttonR: 9, labelY: 16, spacing: 36, frame: { inside: 21, outside: 14, end: 20 } },
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

const DEGREES = 180 / Math.PI

// The arc a ring of count buttons uses: buttons always sit layout.spacing apart, centred on the middle of the layout's
// arc, so a short ring spans only what its buttons need and grows with each one; once the whole arc is used, the radius
// widens instead. Returns { radius, start, end } (degrees).
function ringArc(layout, count, spacing = layout.spacing) {
  const fullArc = layout.arcEnd - layout.arcStart
  const length = (count - 1) * spacing
  const radius = Math.max(layout.radius, length / (Math.abs(fullArc) / DEGREES))
  const span = Math.sign(fullArc) * Math.min(Math.abs(fullArc), (length / radius) * DEGREES)
  const middle = (layout.arcStart + layout.arcEnd) / 2
  return { radius, start: middle - span / 2, end: middle + span / 2 }
}

function buttonPosition(layout, arc, index, count) {
  const angle = count === 1 ? arc.start : arc.start + ((arc.end - arc.start) * index) / (count - 1)
  const radians = angle / DEGREES
  return { x: Math.cos(radians) * arc.radius, y: layout.centreY + Math.sin(radians) * arc.radius }
}

// Clicks on the ring must not reach the tiles or units underneath.
const stop = (event) => event.stopPropagation()

// The party band outside the buttons: one slice per member, SLICE_LENGTH world pixels along its middle.
const PARTY_GAP = 4
const PARTY_DEPTH = 28
const SLICE_LENGTH = 32
const PORTRAIT_R = 10

const polar = (cy, radius, angle) => ({ x: Math.cos(angle / DEGREES) * radius, y: cy + Math.sin(angle / DEGREES) * radius })

// One member's slice: their portrait, their TN for the considered button (a star on the best) and whether they're
// picked to do it.
function PartySlice({ slice, cy, inner, outer, from, to, onPick }) {
  const clipId = `ring-party-${useId().replace(/[^\w-]/g, '')}`
  const { character } = slice
  const image = character.portrait.image
  const shown = useUniformImage(image, character.portrait.imageUniform, character.portrait.backdrop)
  const middle = (from + to) / 2
  const centre = polar(cy, (inner + outer) / 2, middle)
  const labelAt = polar(cy, outer + 6, middle)
  const classes = ['unit-ring-party-slice', slice.best && 'is-best', slice.picked && 'is-picked', !slice.available && 'is-unavailable'].filter(Boolean).join(' ')
  return (
    <g className={classes} role="button" aria-label={character.name} aria-pressed={slice.picked} data-ui-sound="" onClick={() => onPick(slice.id)}>
      <title>{slice.title}</title>
      <path className="unit-ring-party-band" d={bandPath(cy, inner, outer, from, to)} />
      <clipPath id={clipId}>
        <circle cx={centre.x} cy={centre.y} r={PORTRAIT_R} />
      </clipPath>
      <circle className="unit-ring-party-portrait-back" cx={centre.x} cy={centre.y} r={PORTRAIT_R} />
      {image ? (
        shown && <image href={shown} x={centre.x - PORTRAIT_R} y={centre.y - PORTRAIT_R} width={PORTRAIT_R * 2} height={PORTRAIT_R * 2} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMin slice" />
      ) : (
        <text className="unit-ring-party-initial" x={centre.x} y={centre.y + 3} textAnchor="middle">
          {character.name.charAt(0)}
        </text>
      )}
      <circle className="unit-ring-party-portrait-rim" cx={centre.x} cy={centre.y} r={PORTRAIT_R} />
      {slice.label && (
        <text className="unit-ring-party-label" x={labelAt.x} y={labelAt.y + 2} textAnchor="middle">
          {slice.label}
        </text>
      )}
    </g>
  )
}

// party: { caption, slices: [{ id, character, label, best, picked, available, title }], onPick(id) }, around the middle
// of the layout's arc from inner outwards; the caption sits captionRadius out.
function PartyBand({ layout, inner, captionRadius, party }) {
  const outer = inner + PARTY_DEPTH
  const sliceAngle = (SLICE_LENGTH / ((inner + outer) / 2)) * DEGREES
  const middle = (layout.arcStart + layout.arcEnd) / 2
  const start = middle - (sliceAngle * party.slices.length) / 2
  const captionAt = polar(layout.centreY, captionRadius, middle)
  return (
    <g className="unit-ring-party">
      {party.slices.map((slice, index) => (
        <PartySlice
          key={slice.id}
          slice={slice}
          cy={layout.centreY}
          inner={inner}
          outer={outer}
          from={start + sliceAngle * index + 0.6}
          to={start + sliceAngle * (index + 1) - 0.6}
          onPick={party.onPick}
        />
      ))}
      {party.caption && (
        <text className="unit-ring-party-caption" x={captionAt.x} y={captionAt.y} textAnchor="middle">
          {party.caption}
        </text>
      )}
    </g>
  )
}

// The slot above the ring (world pixels); its content sits at the bottom, against the ring.
const SLOT_WIDTH = 220
const SLOT_HEIGHT = 90

// Labels longer than this wrap onto two lines, split at the space nearest the middle (an object's approaches, e.g.
// "Replace the EPS Coupling").
const WRAP_AFTER = 12
// Rough width of one label character, per world pixel of font size (bold uppercase).
const CHAR_WIDTH = 0.68

function labelLines(label) {
  if (label.length <= WRAP_AFTER || !label.includes(' ')) return [label]
  const spaces = [...label.matchAll(/ /g)].map((match) => match.index)
  const split = spaces.reduce((best, index) => (Math.abs(index - label.length / 2) < Math.abs(best - label.length / 2) ? index : best))
  return [label.slice(0, split), label.slice(split + 1)]
}

// A ring with a wrapped label spaces its buttons far enough apart for the widest label line to clear the next one's;
// any other ring keeps the layout's spacing.
function labelSpacing(layout, buttons, fontSize) {
  const lines = buttons.map((button) => labelLines(button.label))
  if (!lines.some((buttonLines) => buttonLines.length > 1)) return layout.spacing
  const widest = Math.max(...lines.flat().map((line) => line.length))
  return Math.max(layout.spacing, widest * fontSize * CHAR_WIDTH + 6)
}

// One button on a ring.
function RingButton({ button, layout, x, y, iconScale, lineHeight, onButtonHover }) {
  return (
    <g
      className={`unit-ring-button is-${button.tone ?? button.id}${button.enabled ? '' : ' is-disabled'}${button.active ? ' is-active' : ''}`}
      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
      role="button"
      aria-label={button.label}
      aria-disabled={!button.enabled}
      data-ui-sound={button.enabled ? '' : undefined}
      onClick={button.enabled ? button.onClick : undefined}
      onPointerEnter={onButtonHover && (() => onButtonHover(button.id))}
    >
      <title>{[button.title, ...(button.details ?? [])].filter(Boolean).join('\n')}</title>
      {button.pressed && <circle key={`ripple-${button.pressed}`} className="unit-ring-ripple" r={layout.buttonR} />}
      <g key={button.pressed ?? 'face'} className={`unit-ring-face${button.pressed ? ' is-pressed' : ''}`}>
        <circle r={layout.buttonR} />
        <path d={ACTION_ICONS[button.icon]} transform={`scale(${iconScale}) translate(-12 -12)`} />
      </g>
      <text y={layout.labelY} textAnchor="middle">
        {labelLines(button.label).map((line, index) => (
          <tspan key={line} x="0" dy={index ? lineHeight : 0}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}

// buttons: [{ id, label, details, icon, tone, enabled, active, pressed, title, onClick }], pressed: a key; while set the
// button plays its press once per key (Auto Combat showing the AI's choice); details: extra lines in the button's tooltip
// (e.g. an attack's TN, Severity and Threat), kept off the ring so every ring has the same size and spacing; info: { title, rows: [[label, value]], tips?: [text] } or null. placement: 'around' or 'top'
// (see LAYOUTS); prominent: framed by a panel band along the arc. party (prominent rings only): the away team in a
// band outside the buttons (PartyBand); onButtonHover(buttonId): the pointer moved onto a button. slotRef: a callback ref
// given the element of a slot above the ring (world-scaled with it), which other UI fills through a portal (the
// interaction panel's Roll button and dice).
export default function UnitActionRing({ position, buttons, info, onPointerEnter, onPointerLeave, placement = 'around', prominent = false, party = null, onButtonHover, slotRef }) {
  const layout = LAYOUTS[placement]
  const centre = project(position)
  // Label font sizes as in combat.css (.unit-ring-button text; smaller on prominent rings).
  const fontSize = prominent ? 6.5 : 8.5
  const arc = ringArc(layout, buttons.length, labelSpacing(layout, buttons, fontSize))
  const { radius } = arc
  // The band reaches past the end buttons far enough to hold their labels.
  const { inside, outside, end } = layout.frame
  const endPad = (end / radius) * DEGREES * Math.sign(layout.arcEnd - layout.arcStart)
  const frame = prominent && buttons.length > 0 && (
    <path className="unit-ring-frame" d={bandPath(layout.centreY, radius - inside, radius + outside, arc.start - endPad, arc.end + endPad)} />
  )
  const partyInner = radius + outside + PARTY_GAP
  // The slot's bottom edge: clear of the party band's caption, else of the button band.
  const slotBottom = layout.centreY - (prominent && party ? partyInner + PARTY_DEPTH + 24 : radius + outside + 6)
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
      {prominent && party && <PartyBand layout={layout} inner={partyInner} captionRadius={partyInner + PARTY_DEPTH + 17} party={party} />}
      {buttons.map((button, index) => {
        const { x, y } = buttonPosition(layout, arc, index, buttons.length)
        return <RingButton key={button.id} button={button} layout={layout} x={x} y={y} iconScale={iconScale} lineHeight={fontSize + 1} onButtonHover={onButtonHover} />
      })}
      {slotRef && (
        <foreignObject x={-SLOT_WIDTH / 2} y={slotBottom - SLOT_HEIGHT} width={SLOT_WIDTH} height={SLOT_HEIGHT}>
          <div ref={slotRef} className="unit-ring-slot" />
        </foreignObject>
      )}
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
