// Transporter sparkles: [x, y, delay as a fraction of the beam], fixed so every beam looks the same.
const BEAM_SPARKS = [
  [-9, -62, 0], [6, -54, 0.08], [-4, -44, 0.16], [10, -36, 0.05], [-11, -28, 0.22], [3, -20, 0.12],
  [-6, -12, 0.3], [8, -8, 0.18], [0, -68, 0.26], [-2, -32, 0.34], [11, -58, 0.4], [-10, -46, 0.45],
]

// A transporter column with sparkles over a figure. position: the figure's tile centre on screen.
// direction 'out': a fleeing enemy's red-amber beam-out (the figure fades with .iso-unit.is-beaming);
// 'in': the away team's blue-white beam-in as a mission starts (the figure appears with .is-beaming-in).
export default function TransporterBeam({ position, direction }) {
  return (
    <g className={`fx-transporter is-${direction}`} transform={`translate(${position.x} ${position.y})`} pointerEvents="none">
      <rect className="fx-transporter-column" x="-17" y="-76" width="34" height="82" rx="17" />
      {BEAM_SPARKS.map(([x, y, delay]) => (
        <circle key={`${x},${y}`} className="fx-transporter-spark" cx={x} cy={y} r="1.8" style={{ '--spark-delay': delay }} />
      ))}
    </g>
  )
}
