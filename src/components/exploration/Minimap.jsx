import { useMemo } from 'react'
import { getNpcs, isHostile } from '../../exploration/awareness.js'
import { areaLabelCentres } from '../../maps/areaCentres.js'
import { getMembers, isSelected } from '../../exploration/partyControl.js'
import { getEntityKnowledge, KNOWLEDGE } from '../../exploration/partyKnowledge.js'
import { isDefeated, isDying, minorDefeatText } from '../../rules/personalCondition.js'
import MinimapTiles from '../maps/MinimapTiles.jsx'
import ReadoutNoise from './ReadoutNoise.jsx'
import { scanSweepSeconds } from './scanSweep.js'

// A defeated person's state in the rules' own words: Dead / Unconscious (a Minor NPC's outright Defeat), Dying (Defeated
// with a Deadly Injury), Defeated; null while they're up.
const downState = (condition) => (isDefeated(condition) ? (minorDefeatText(condition) ?? (isDying(condition) ? 'Dying' : 'Defeated')) : null)
// How a downed enemy is marked (designer request, Oct 2026): taken down by a Deadly attack (Dead / Dying) = red X;
// by a Stun attack (Unconscious / Defeated with no Deadly Injury) = yellow dot.
const enemyDownMark = (state) => (state === 'Dead' || state === 'Dying' ? 'dead' : 'stunned')
const stateClass = (state) => (state ? ` is-${state.toLowerCase()}` : '')

const CROSS = 'M-0.7 -0.7L0.7 0.7M0.7 -0.7L-0.7 0.7'

// A door object's tiles as one path of unit squares.
const cellsPath = (cells) => cells.map(({ x, y }) => `M${x - 0.5} ${y - 0.5}h1v1h-1z`).join('')

function Marker({ position, className, title, shape }) {
  return (
    <g className={`minimap-marker ${className}`} transform={`translate(${position.x} ${position.y})`}>
      <title>{title}</title>
      {shape === 'cross' ? <path className="minimap-down" d={CROSS} /> : <circle r="0.75" />}
    </g>
  )
}

// A folded map, for the button that hides and shows the minimap.
const MINIMAP_ICON = 'M3 6l6-2l6 2l6-2v14l-6 2l-6-2l-6 2zM9 4v14M15 6v14'

// Exploration minimap, top down: the level in its tile art with the map's area names, each centred in its room,
// the away team (selected members ringed) and the NPCs the away team knows about: seen ones where they are, lost ones
// as a '?' where last seen, defeated ones where they fell. debug: every NPC, known or not. objectives: the active
// objectives with a map position ({ id, title, position }), drawn as gold diamonds under the people. scanPulse: a party
// Scan's sweeps while they play ({ key, rings: [{ origin, radius }] }), drawn as rings on the readout.
// doors: the map's door objects ({ id, name, stateLabel, closed, cells }), such as the Deck 10 Brig's sealed bulkheads:
// yellow over their doorway, solid while closed and outlined once open. Display only.
// open / onToggle(): the button in its top-right corner hides and shows it; while hidden the button stays in that spot.
// cornerButtons: more buttons to the left of that one, which stay in the corner too.
export default function Minimap({ map, party, world, knowledge, objectives = [], doors = [], scanPulse = null, debug = false, open = true, onToggle = () => {}, cornerButtons = null, children }) {
  const labelCentres = useMemo(() => areaLabelCentres(map.tiles, map.areas ?? []), [map.tiles, map.areas])
  const size = Math.max(map.width, map.height)
  const viewBox = `${-0.5 - (size - map.width) / 2} ${-0.5 - (size - map.height) / 2} ${size} ${size}`

  const members = getMembers(party).map((member) => ({ member, state: downState(member.condition) }))
  const npcs = getNpcs(world)
    .map((npc) => ({ npc, entry: getEntityKnowledge(knowledge, npc.id), state: downState(npc.condition) }))
    .map(({ npc, entry, state }) => {
      const name = entry.identified || debug ? npc.name : 'Unidentified'
      if (entry.state === KNOWLEDGE.VISIBLE || (state && entry.state !== KNOWLEDGE.UNKNOWN)) return { npc, name, state, position: npc.position, kind: 'seen' }
      if (entry.state === KNOWLEDGE.KNOWN) return debug ? { npc, name, state, position: npc.position, kind: 'unseen' } : { npc, name, state: null, position: entry.lastKnownPosition, kind: 'lastSeen' }
      return debug ? { npc, name, state, position: npc.position, kind: 'unseen' } : null
    })
    .filter(Boolean)

  const corner = (
    <div className="explore-minimap-corner">
      {cornerButtons}
      <button type="button" className="explore-minimap-toggle" aria-pressed={open} aria-label="Minimap" title={open ? 'Hide the minimap.' : 'Show the minimap.'} onClick={onToggle}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={MINIMAP_ICON} />
        </svg>
      </button>
    </div>
  )
  if (!open) {
    return (
      <div className="explore-minimap-column">
        <div className="explore-minimap-closed">{corner}</div>
        {children}
      </div>
    )
  }

  return (
    <div className="explore-minimap-column">
      <section className={`explore-minimap${scanPulse ? ' is-scanning' : ''}`} aria-label="Minimap">
        {corner}
        <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          <g className="minimap-readout-tiles">
            <MinimapTiles tiles={map.tiles} />
          </g>
          {doors.map((door) => (
            <path key={door.id} className={`minimap-door${door.closed ? ' is-closed' : ''}`} d={cellsPath(door.cells)}>
              <title>{`${door.name}: ${door.stateLabel}`}</title>
            </path>
          ))}
          {(map.areas ?? []).map((area, index) => (
            <text key={`${area.position.x},${area.position.y}`} className="minimap-area-label" x={labelCentres[index].x} y={labelCentres[index].y} textAnchor="middle" dominantBaseline="central">
              {area.name.toUpperCase()}
            </text>
          ))}
          {objectives.map((objective) => (
            <g key={objective.id} className="minimap-marker is-objective" transform={`translate(${objective.position.x} ${objective.position.y})`}>
              <title>{`Objective: ${objective.title || objective.id}`}</title>
              <path d="M0 -0.95L0.95 0L0 0.95L-0.95 0Z" />
            </g>
          ))}
          {npcs.map(({ npc, name, state, position, kind }) => {
            if (kind === 'lastSeen') {
              return (
                <g key={npc.id} className="minimap-marker is-enemy is-last-seen" transform={`translate(${position.x} ${position.y})`}>
                  <title>{`${name}: last seen here`}</title>
                  <circle r="0.75" />
                  <text y="0.4" textAnchor="middle">?</text>
                </g>
              )
            }
            const mark = state ? enemyDownMark(state) : null
            return (
              <Marker
                key={npc.id}
                position={position}
                className={`${isHostile(npc) ? 'is-enemy' : 'is-neutral'}${kind === 'unseen' ? ' is-unseen' : ''}${mark ? ` is-down-${mark}` : ''}`}
                title={`${name}${state ? `: ${state}` : ''}`}
                shape={mark === 'dead' ? 'cross' : 'dot'}
              />
            )
          })}
          {members.map(({ member, state }) => (
            <Marker
              key={member.id}
              position={member.position}
              className={`is-party${isSelected(party, member.id) ? ' is-selected' : ''}${member.id === party.leaderId ? ' is-lead' : ''}${stateClass(state)}`}
              title={`${member.character.name}${state ? `: ${state}` : ''}`}
              shape={state ? 'cross' : 'dot'}
            />
          ))}
          {scanPulse?.rings.map((ring, index) => (
            <g
              key={`${scanPulse.key}-${index}`}
              className="minimap-scan-pulse"
              transform={`translate(${ring.origin.x} ${ring.origin.y})`}
              style={{ '--scan-seconds': `${scanSweepSeconds(ring.radius)}s`, '--scan-radius': `${ring.radius}px` }}
            >
              <circle className="minimap-scan-pulse-fill" />
              <circle className="minimap-scan-pulse-ring" />
            </g>
          ))}
        </svg>
        <ReadoutNoise
          sweep={
            scanPulse && {
              key: scanPulse.key,
              seconds: Math.max(...scanPulse.rings.map((ring) => scanSweepSeconds(ring.radius))),
            }
          }
        />
      </section>
      {children}
    </div>
  )
}
