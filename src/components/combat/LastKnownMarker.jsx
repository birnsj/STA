import { project } from '../../maps/iso.js'

// Where the away team last saw an NPC it can't see now. Never moves with the NPC: it marks a memory, not the NPC.
export default function LastKnownMarker({ position, label = null }) {
  const centre = project(position)
  return (
    <g className="last-known-marker" transform={`translate(${centre.x} ${centre.y})`} pointerEvents="none">
      <title>{label ? `${label}: last seen here` : 'Last seen here'}</title>
      <ellipse cx="0" cy="0" rx="18" ry="9" />
      <text x="0" y="-8" textAnchor="middle">
        ?
      </text>
      {label && (
        <text className="last-known-label" x="0" y="20" textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  )
}
