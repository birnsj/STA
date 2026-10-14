import { dispositionName, getNpcs, isDown, stateName } from '../../exploration/awareness.js'
import { getFormation, slotPoint } from '../../exploration/formations.js'
import { getFollowTargets, getMembers } from '../../exploration/partyControl.js'
import { getEntityKnowledge, VISION_RANGE } from '../../exploration/partyKnowledge.js'
import { project } from '../../maps/iso.js'

// The exploration boards' developer views (SVG, over the map). Presentation only.

const svgPoints = (list) => list.map((point) => project(point)).map(({ x, y }) => `${x},${y}`).join(' ')

// Developer view: each character's route and destination, and each follower's formation slot (dashed ring where the
// formation would put them, solid dot where walls let them stand).
export function DebugOverlay({ state }) {
  const formation = getFormation(state.formationId)
  const followTargets = getFollowTargets(state)
  return (
    <g className="explore-debug" pointerEvents="none">
      {getMembers(state).map((member) => {
        const here = project(member.position)
        const items = []
        if (member.path.length) {
          items.push(<polyline key="route" className="explore-debug-route" points={svgPoints([member.position, ...member.path])} />)
        }
        if (member.order?.type === 'point') {
          const end = project(member.order.target)
          items.push(<ellipse key="target" className="explore-debug-target" cx={end.x} cy={end.y} rx="10" ry="5" />)
        }
        if (member.order?.type === 'follow') {
          const leader = state.members[member.order.leaderId]
          const ideal = project(slotPoint(formation, member.order.slot, leader.position, leader.heading, state.spacing))
          const actual = project(followTargets[member.id])
          items.push(
            <ellipse key="ideal" className="explore-debug-slot-ideal" cx={ideal.x} cy={ideal.y} rx="9" ry="4.5" />,
            <circle key="slot" className="explore-debug-slot" cx={actual.x} cy={actual.y} r="3.5" />,
            <text key="slotLabel" className="explore-debug-label" x={actual.x} y={actual.y - 6} textAnchor="middle">
              {member.order.slot + 1}
            </text>,
          )
        }
        items.push(
          <text key="name" className="explore-debug-label" x={here.x} y={here.y + 22} textAnchor="middle">
            {member.character.name} ({member.position.x.toFixed(2)}, {member.position.y.toFixed(2)})
          </text>,
        )
        return <g key={member.id}>{items}</g>
      })}
    </g>
  )
}

const arc = (centre, radius, from, to, steps = 18) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const angle = from + ((to - from) * i) / steps
    return { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius }
  })
const stateClass = (state) => `is-${state.toLowerCase().replace('_', '-')}`

// Developer view of NPC awareness: vision cone (outer edge = vision range; inner arcs = normal and close range),
// hearing range, a line to each party member the NPC sees right now, the place it is investigating, the last place it
// saw each character it has lost, recent noises, and a label with its disposition, awareness, target and alert group.
export function NpcDebugOverlay({ world, party }) {
  return (
    <g className="explore-debug npc-debug" pointerEvents="none">
      {world.noises.map((noise, i) => (
        <polygon key={`noise${i}`} className="npc-debug-noise" points={svgPoints(arc(noise.position, noise.radius, 0, Math.PI * 2, 36))} />
      ))}
      {getNpcs(world).filter((npc) => !isDown(npc)).map((npc) => {
        const p = npc.perception
        const half = (p.fieldOfView * Math.PI) / 360
        const from = npc.heading - half
        const to = npc.heading + half
        const here = project(npc.position)
        const name = (id) => party.members[id]?.character.name ?? id
        const focus = npc.focusId ? npc.awareness[npc.focusId] : null
        return (
          <g key={npc.id} className={stateClass(npc.state)}>
            <polygon className="npc-debug-cone" points={svgPoints([npc.position, ...arc(npc.position, p.visionRange, from, to)])} />
            <polyline className="npc-debug-range" points={svgPoints(arc(npc.position, p.normalRange, from, to))} />
            <polyline className="npc-debug-range" points={svgPoints(arc(npc.position, p.closeRange, from, to))} />
            <polygon className="npc-debug-hearing" points={svgPoints(arc(npc.position, p.hearingRange, 0, Math.PI * 2, 36))} />
            {npc.visibleIds.map((id) => (
              <polyline key={`sees${id}`} className={`npc-debug-sight ${stateClass(npc.awareness[id].state)}`} points={svgPoints([npc.position, party.members[id].position])} />
            ))}
            {Object.entries(npc.awareness).map(([id, record]) => {
              if (record.state === 'UNAWARE' || npc.visibleIds.includes(id) || !record.lastKnownPosition) return null
              const spot = project(record.lastKnownPosition)
              return (
                <g key={`last${id}`}>
                  <ellipse className="npc-debug-last-known" cx={spot.x} cy={spot.y} rx="12" ry="6" />
                  <text className="explore-debug-label" x={spot.x} y={spot.y + 16} textAnchor="middle">
                    {npc.name}: last saw {name(id)}
                  </text>
                </g>
              )
            })}
            {npc.investigation && (
              <g>
                <polyline className="npc-debug-investigate-line" points={svgPoints([npc.position, npc.investigation.position])} />
                <text className="npc-debug-investigate" x={project(npc.investigation.position).x} y={project(npc.investigation.position).y + 4} textAnchor="middle">
                  ?
                </text>
              </g>
            )}
            <text className="explore-debug-label npc-debug-label" x={here.x} y={here.y - 96} textAnchor="middle">
              <tspan x={here.x}>{npc.name}</tspan>
              <tspan x={here.x} dy="11">Disposition: {dispositionName(npc.disposition)}</tspan>
              <tspan x={here.x} dy="11">Awareness: {stateName(npc.state)}</tspan>
              <tspan x={here.x} dy="11">Target: {npc.focusId ? `${name(npc.focusId)} (${Math.round(focus.confidence * 100)}%)` : '-'}</tspan>
              <tspan x={here.x} dy="11">Alert Group: {npc.alertGroupId ?? '-'}</tspan>
            </text>
          </g>
        )
      })}
    </g>
  )
}

// Developer view of the away team's perception: each member's vision radius, a ray to every NPC they see themselves,
// and under each NPC what the party knows of it (Visible with its observers, Known, or Unknown).
export function PerceptionDebugOverlay({ party, world, knowledge }) {
  const name = (id) => party.members[id]?.character.name ?? id
  return (
    <g className="explore-debug perception-debug" pointerEvents="none">
      {getMembers(party)
        .filter((member) => knowledge.sightings[member.id])
        .map((member) => (
          <g key={member.id}>
            <polygon className="perception-debug-radius" points={svgPoints(arc(member.position, VISION_RANGE, 0, Math.PI * 2, 48))} />
            {knowledge.sightings[member.id].map((npcId) => (
              <polyline key={npcId} className="perception-debug-ray" points={svgPoints([member.position, world.npcs[npcId].position])} />
            ))}
          </g>
        ))}
      {getNpcs(world).map((npc) => {
        const entry = getEntityKnowledge(knowledge, npc.id)
        const here = project(npc.position)
        return (
          <text key={npc.id} className={`explore-debug-label perception-debug-label is-${entry.state.toLowerCase()}`} x={here.x} y={here.y + 18} textAnchor="middle">
            Party: {entry.state}
            {entry.observerIds.length ? ` (${entry.observerIds.map(name).join(', ')})` : ''}
          </text>
        )
      })}
    </g>
  )
}
