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

// Rough width of one label character, per world pixel of font size (bold uppercase): generous for the length of the
// path text runs along, and as measured (0.46 to 0.57) for spacing the buttons apart.
const CHAR_WIDTH = 0.68
const LABEL_CHAR_WIDTH = 0.58
const pathId = (id) => `ring-text-${id.replace(/[^\w-]/g, '')}`

// Text along a circle around (cx, cy), centred on angle (degrees), its baseline at radius. Every label on a ring
// follows its arc (designer decision, 2026-10-14). It always reads left to right: over the top of the circle the path
// runs clockwise, under it anticlockwise, so the letters stand upright either way.
function ArcText({ cx, cy, radius, angle, fontSize, className, children }) {
  const id = pathId(useId())
  const text = String(children)
  const span = Math.min(80, (((text.length * fontSize * CHAR_WIDTH) / 2 + fontSize) / radius) * DEGREES)
  const over = isOver(angle)
  const [from, to] = over ? [angle - span, angle + span] : [angle + span, angle - span]
  const point = (degrees) => `${(cx + Math.cos(degrees / DEGREES) * radius).toFixed(2)} ${(cy + Math.sin(degrees / DEGREES) * radius).toFixed(2)}`
  return (
    <>
      <defs>
        <path id={id} d={`M${point(from)} A${radius} ${radius} 0 0 ${over ? 1 : 0} ${point(to)}`} />
      </defs>
      <text className={className} textAnchor="middle">
        <textPath href={`#${id}`} startOffset="50%">
          {text}
        </textPath>
      </text>
    </>
  )
}
// Whether an angle is over the top of its circle; up to about 6 degrees below the sides counts as over, so the end
// buttons of a top ring (its arc runs 5 degrees below them) label the same way as the rest.
const isOver = (angle) => Math.sin(angle / DEGREES) < 0.1
// Which way "below" a label is from the ring's centre at this angle: inwards over the top, outwards under it.
const belowSign = (angle) => (isOver(angle) ? -1 : 1)

// The arc a ring of buttons uses: buttons sit layout.spacing apart, or further where their curved labels need it (each
// label's widest line, along the circle its lines reach: inside the buttons over the top, outside them underneath),
// centred on the middle of the layout's arc, so a short ring spans only what its buttons need and grows with each one;
// once the whole arc is used, the radius widens instead. Returns { radius, start, end, labelReach } (degrees;
// labelReach: how far half the widest label runs along the circle).
function ringArc(layout, buttons, fontSize, labelDepth) {
  const count = buttons.length
  const fullArc = layout.arcEnd - layout.arcStart
  const middle = (layout.arcStart + layout.arcEnd) / 2
  const widths = buttons.map((button) => Math.max(...labelLines(button.label).map((line) => line.length)) * fontSize * LABEL_CHAR_WIDTH)
  // Neighbouring labels need half of each one's width between their buttons, plus a gap.
  const pairWidth = Math.max(0, ...widths.slice(1).map((width, index) => (width + widths[index]) / 2 + 6))
  const labelOffset = belowSign(middle) * labelDepth
  const step = (radius) => Math.max(layout.spacing / radius, pairWidth / (radius + labelOffset))
  let radius = layout.radius
  while (count > 1 && (count - 1) * step(radius) * DEGREES > Math.abs(fullArc)) radius += 1
  const span = Math.sign(fullArc) * (count - 1) * step(radius) * DEGREES
  const endWidth = Math.max(widths[0] ?? 0, widths[count - 1] ?? 0)
  return { radius, start: middle - span / 2, end: middle + span / 2, labelReach: (endWidth / 2 / (radius + labelOffset)) * DEGREES }
}

const buttonAngle = (arc, index, count) => (count === 1 ? arc.start : arc.start + ((arc.end - arc.start) * index) / (count - 1))

// Clicks on the ring must not reach the tiles or units underneath.
const stop = (event) => event.stopPropagation()

// The party band outside the buttons: one slice per member, SLICE_LENGTH world pixels along its middle.
const PARTY_GAP = 4
const PARTY_DEPTH = 28
const SLICE_LENGTH = 32
const PORTRAIT_R = 10
// A slice's TN label sits LABEL_GAP outside it; the Roll arc starts ROLL_GAP out, clear of that label.
const LABEL_GAP = 4
const ROLL_GAP = 11
const ROLL_DEPTH = 28
// The Roll arc's icon, on the icons' 24-unit grid (designer request: a big die).
const ROLL_ICON_SCALE = 0.85

const polar = (cy, radius, angle) => ({ x: Math.cos(angle / DEGREES) * radius, y: cy + Math.sin(angle / DEGREES) * radius })

// One member's slice: their portrait, their TN for the considered button (a star on the best) and whether they're
// picked to do it.
function PartySlice({ slice, cy, inner, outer, from, to, onPick, pulse }) {
  const clipId = `ring-party-${useId().replace(/[^\w-]/g, '')}`
  const { character } = slice
  const image = character.portrait.image
  const shown = useUniformImage(image, character.portrait.imageUniform, character.portrait.backdrop)
  const middle = (from + to) / 2
  const centre = polar(cy, (inner + outer) / 2, middle)
  const classes = ['unit-ring-party-slice', slice.best && 'is-best', slice.picked && 'is-picked', !slice.available && 'is-unavailable', pulse && 'is-pulsing']
    .filter(Boolean)
    .join(' ')
  return (
    <g className={classes} role="button" aria-label={character.name} aria-pressed={slice.picked} data-ui-sound="" data-tip={slice.title} onClick={() => onPick(slice.id)}>
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
        <ArcText cx={0} cy={cy} radius={outer + LABEL_GAP} angle={middle} fontSize={6} className="unit-ring-party-label">
          {slice.label}
        </ArcText>
      )}
    </g>
  )
}

// The outermost arc, over the picked member: the button that carries out the action (a d20 for a roll, a tick for a
// routine action, which also shows the action's name along the arc above it).
// roll: { icon: 'roll' | 'check', label, title, enabled, pulse, onClick }.
function RollArc({ roll, cy, inner, from, to }) {
  const outer = inner + ROLL_DEPTH
  const middle = (from + to) / 2
  const centre = polar(cy, (inner + outer) / 2, middle)
  const classes = ['unit-ring-roll', !roll.enabled && 'is-disabled', roll.pulse && 'is-pulsing'].filter(Boolean).join(' ')
  return (
    <g
      className={classes}
      role="button"
      aria-label={roll.title}
      aria-disabled={!roll.enabled}
      data-ui-sound={roll.enabled ? '' : undefined}
      data-tip={roll.title}
      onClick={roll.enabled ? roll.onClick : undefined}
    >
      <path className="unit-ring-roll-band" d={bandPath(cy, inner, outer, from, to)} />
      <path d={ACTION_ICONS[roll.icon]} transform={`translate(${centre.x.toFixed(1)} ${centre.y.toFixed(1)}) scale(${ROLL_ICON_SCALE}) translate(-12 -12)`} />
      {roll.label && (
        <ArcText cx={0} cy={cy} radius={outer + LABEL_GAP} angle={middle} fontSize={6} className="unit-ring-party-label">
          {roll.label}
        </ArcText>
      )}
    </g>
  )
}

// party: { caption, slices: [{ id, character, label, best, picked, available, title }], onPick(id), pulse, roll },
// around the middle of the layout's arc from inner outwards; the caption sits captionRadius out. pulse: the slices
// pulse (the next thing to choose); roll: the RollArc over the picked slice, or null (left out on rings without one).
function PartyBand({ layout, inner, captionRadius, party }) {
  const outer = inner + PARTY_DEPTH
  const sliceAngle = (SLICE_LENGTH / ((inner + outer) / 2)) * DEGREES
  const middle = (layout.arcStart + layout.arcEnd) / 2
  const start = middle - (sliceAngle * party.slices.length) / 2
  const pickedIndex = party.slices.findIndex((slice) => slice.picked)
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
          pulse={party.pulse}
        />
      ))}
      {party.roll && pickedIndex >= 0 && (
        <RollArc roll={party.roll} cy={layout.centreY} inner={outer + ROLL_GAP} from={start + sliceAngle * pickedIndex + 0.6} to={start + sliceAngle * (pickedIndex + 1) - 0.6} />
      )}
      {party.caption && (
        <ArcText cx={0} cy={layout.centreY} radius={captionRadius} angle={middle} fontSize={6} className="unit-ring-party-caption">
          {party.caption}
        </ArcText>
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

function labelLines(label) {
  if (label.length <= WRAP_AFTER || !label.includes(' ')) return [label]
  const spaces = [...label.matchAll(/ /g)].map((match) => match.index)
  const split = spaces.reduce((best, index) => (Math.abs(index - label.length / 2) < Math.abs(best - label.length / 2) ? index : best))
  return [label.slice(0, split), label.slice(split + 1)]
}

// A ring button's mouseover (TitleTips): its label as the title, then what it does (without a repeated "Label: ")
// and its details (an attack's TN, Severity and Threat), one per line.
function buttonTip(button) {
  const prefix = `${button.label}: `
  const title = button.title?.startsWith(prefix) ? button.title.slice(prefix.length) : button.title
  return [button.label, title, ...(button.details ?? [])].filter(Boolean).join('\n')
}

// One button on a ring, at angle (degrees) on the ring's arc of radius around (0, layout.centreY); its label curves
// along the arc below it.
function RingButton({ button, layout, angle, radius, iconScale, fontSize, onButtonHover }) {
  const x = Math.cos(angle / DEGREES) * radius
  const y = layout.centreY + Math.sin(angle / DEGREES) * radius
  const below = belowSign(angle)
  const classes = ['unit-ring-button', `is-${button.tone ?? button.id}`, !button.enabled && 'is-disabled', button.active && 'is-active', button.pulse && 'is-pulsing']
  return (
    <g
      className={classes.filter(Boolean).join(' ')}
      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
      role="button"
      aria-label={button.label}
      aria-disabled={!button.enabled}
      data-ui-sound={button.enabled ? '' : undefined}
      onClick={button.enabled ? button.onClick : undefined}
      onPointerEnter={onButtonHover && (() => onButtonHover(button.id))}
      data-tip={buttonTip(button)}
    >
      {button.pressed && <circle key={`ripple-${button.pressed}`} className="unit-ring-ripple" r={layout.buttonR} />}
      <g key={button.pressed ?? 'face'} className={`unit-ring-face${button.pressed ? ' is-pressed' : ''}`}>
        <circle r={layout.buttonR} />
        <path d={ACTION_ICONS[button.icon]} transform={`scale(${iconScale}) translate(-12 -12)`} />
      </g>
      {labelLines(button.label).map((line, index) => (
        <ArcText key={line} cx={-x} cy={layout.centreY - y} radius={radius + below * (layout.labelY + index * (fontSize + 1))} angle={angle} fontSize={fontSize}>
          {line}
        </ArcText>
      ))}
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
  // How far the labels' last baseline sits from the buttons' circle.
  const lineCount = Math.max(1, ...buttons.map((button) => labelLines(button.label).length))
  const labelDepth = layout.labelY + (lineCount - 1) * (fontSize + 1)
  const arc = ringArc(layout, buttons, fontSize, labelDepth)
  const { radius } = arc
  // The band reaches past the end buttons far enough to hold their labels, and inside far enough for a second line.
  const { outside, end } = layout.frame
  const inside = Math.max(layout.frame.inside, labelDepth + 4)
  const endPad = Math.max((end / radius) * DEGREES, arc.labelReach) * Math.sign(layout.arcEnd - layout.arcStart)
  const frame = prominent && buttons.length > 0 && (
    <path className="unit-ring-frame" d={bandPath(layout.centreY, radius - inside, radius + outside, arc.start - endPad, arc.end + endPad)} />
  )
  const partyInner = radius + outside + PARTY_GAP
  // On a ring with a Roll arc (party.roll given, even as null) the caption stays out past it and a routine action's
  // name along it, whether or not that's shown yet; otherwise just past the slices' labels.
  const rollRoom = party && 'roll' in party ? ROLL_GAP + ROLL_DEPTH + LABEL_GAP + 10 : 17
  const captionRadius = partyInner + PARTY_DEPTH + rollRoom
  // The slot's bottom edge: clear of the party band's caption, else of the button band.
  const slotBottom = layout.centreY - (prominent && party ? captionRadius + 8 : radius + outside + 6)
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
      {prominent && party && <PartyBand layout={layout} inner={partyInner} captionRadius={captionRadius} party={party} />}
      {buttons.map((button, index) => (
        <RingButton
          key={button.id}
          button={button}
          layout={layout}
          angle={buttonAngle(arc, index, buttons.length)}
          radius={radius}
          iconScale={iconScale}
          fontSize={fontSize}
          onButtonHover={onButtonHover}
        />
      ))}
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
