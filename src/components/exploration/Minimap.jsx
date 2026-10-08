import { getNpcs } from '../../exploration/awareness.js'
import { getMembers, isSelected } from '../../exploration/partyControl.js'
import { getEntityKnowledge, KNOWLEDGE } from '../../exploration/partyKnowledge.js'
import { isDefeated, isDying, minorDefeatText } from '../../rules/personalCondition.js'
import MinimapTiles from '../maps/MinimapTiles.jsx'

// A defeated person's state in the rules' own words: Dead / Unconscious (a Minor NPC's outright Defeat), Dying (Defeated
// with a Deadly Injury), Defeated; null while they're up.
const downState = (condition) => (isDefeated(condition) ? (minorDefeatText(condition) ?? (isDying(condition) ? 'Dying' : 'Defeated')) : null)
// How a downed enemy is marked (designer request, Oct 2026): taken down by a Deadly attack (Dead / Dying) = red X;
// by a Stun attack (Unconscious / Defeated with no Deadly Injury) = yellow dot.
const enemyDownMark = (state) => (state === 'Dead' || state === 'Dying' ? 'dead' : 'stunned')
const stateClass = (state) => (state ? ` is-${state.toLowerCase()}` : '')

const CROSS = 'M-0.7 -0.7L0.7 0.7M0.7 -0.7L-0.7 0.7'

function Marker({ position, className, title, shape }) {
  return (
    <g className={`minimap-marker ${className}`} transform={`translate(${position.x} ${position.y})`}>
      <title>{title}</title>
      {shape === 'cross' ? <path className="minimap-down" d={CROSS} /> : <circle r="0.75" />}
    </g>
  )
}

// Exploration minimap, top down: the level in its tile art with the map's area names (as the map editor labels them),
// the away team (selected members ringed) and the NPCs the away team knows about: seen ones where they are, lost ones
// as a '?' where last seen, defeated ones where they fell. debug: every NPC, known or not. Display only.
export default function Minimap({ map, party, world, knowledge, debug = false }) {
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

  return (
    <div className="explore-minimap-column">
      <section className="explore-minimap" aria-label="Minimap">
        <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          <MinimapTiles tiles={map.tiles} />
          {(map.areas ?? []).map((area) => (
            <text key={`${area.position.x},${area.position.y}`} className="minimap-area-label" x={area.position.x - 0.4} y={area.position.y + 0.3}>
              {area.name.toUpperCase()}
            </text>
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
                className={`is-enemy${kind === 'unseen' ? ' is-unseen' : ''}${mark ? ` is-down-${mark}` : ''}`}
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
        </svg>
      </section>
    </div>
  )
}
