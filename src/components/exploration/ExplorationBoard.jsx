import { useEffect, useMemo, useRef, useState } from 'react'
import { dispositionName, getNpcs, isDown, stateName } from '../../exploration/awareness.js'
import { getFormation, slotPoint } from '../../exploration/formations.js'
import { getFollowTargets, getMembers, isSelected } from '../../exploration/partyControl.js'
import { getEntityKnowledge, isVisibleToParty, KNOWLEDGE, VISION_RANGE } from '../../exploration/partyKnowledge.js'
import { isDefeated } from '../../rules/personalCondition.js'
import LastKnownMarker from '../combat/LastKnownMarker.jsx'
import { isBlock, project, TILE_H, TILE_W, unproject } from '../../maps/iso.js'
import { fadedBlockKeys, TALL_WALL_EXTRA } from '../../maps/wallFade.js'
import { fadeWholePanels, getWallPanels } from '../../maps/wallPanels.js'
import { fadeWholeBigObjects, getBigObjects } from '../../maps/bigObjects.js'
import useCamera from '../combat/useCamera.js'
import { AmbientDarkness, FloorTiles, WallBlock } from '../maps/IsoTiles.jsx'
import useDarkBlocks from '../maps/useDarkBlocks.js'

// The exploration view: the same isometric tiles and camera as combat (WASD / arrows or right-drag pan, wheel zooms),
// with characters at continuous positions. Left click orders a move; holding the left button keeps steering the
// lead character toward the pointer. Presentation and input only; positions come from partyControl.js.
const VIEW = { width: 1024, height: 576 }
const HUD_MARGIN = { x: 200, top: 150, bottom: 130 }
// While the left button is held the destination follows the pointer, re-sent at most this often...
const HOLD_INTERVAL_MS = 90
// ...and only when the point under the pointer moved this far (in tiles).
const HOLD_MIN_CHANGE = 0.2
// A press released this quickly, without steering, is a click: it gets the ground ring. Holds don't.
const CLICK_MAX_MS = 250
// How long the ring stays (its CSS animation, explore-click-pulse, runs 380ms).
const CLICK_PULSE_MS = 400

const worldBounds = (map) => ({
  minX: -(map.height * TILE_W) / 2 - HUD_MARGIN.x,
  maxX: (map.width * TILE_W) / 2 + HUD_MARGIN.x,
  minY: -TILE_H / 2 - TALL_WALL_EXTRA - HUD_MARGIN.top,
  maxY: ((map.width + map.height - 1) * TILE_H) / 2 + HUD_MARGIN.bottom,
})

const isAdditive = (event) => event.shiftKey || event.ctrlKey || event.metaKey

// Arrow on the ground ring pointing along a direction on the tile grid, in the tiles' isometric projection.
function FacingArrow({ facing }) {
  const length = Math.hypot(facing.x - facing.y, facing.x + facing.y) || 1
  const dir = { x: (facing.x - facing.y) / length, y: (facing.x + facing.y) / length }
  const side = { x: -dir.y, y: dir.x }
  const toScreen = (x, y) => `${x.toFixed(1)},${(y / 2).toFixed(1)}`
  const tip = toScreen(dir.x * 38, dir.y * 38)
  const left = toScreen(dir.x * 21 + side.x * 11, dir.y * 21 + side.y * 11)
  const right = toScreen(dir.x * 21 - side.x * 11, dir.y * 21 - side.y * 11)
  return <polygon className="iso-unit-facing" points={`${tip} ${left} ${right}`} />
}

// Down after a fight (incapacitated or defeated): drawn as Combat Type 1 draws a downed combatant.
const isDownAfterFight = (entity) => isDefeated(entity.condition)
const DownBody = () => <rect className="iso-unit-body" x="-16" y="-12" width="32" height="14" rx="3" />

function Explorer({ member, selected, lead, onPress }) {
  const centre = project(member.position)
  const image = member.character.portrait.image
  const clipId = `explorer-clip-${member.id.replace(/[^a-z0-9]/gi, '')}`
  const down = isDownAfterFight(member)
  return (
    <g
      className={`iso-unit is-player explore-unit${selected ? ' is-selected' : ''}${lead ? ' is-lead' : ''}${down ? ' is-down' : ''}`}
      style={{ transform: `translate(${centre.x}px, ${centre.y}px)` }}
      onPointerDown={onPress}
      onClick={(event) => event.stopPropagation()}
    >
      <title>{member.character.name}</title>
      <ellipse className="iso-unit-ring" cx="0" cy="0" rx="22" ry="11" />
      {down ? <DownBody /> : <ExplorerFigure image={image} clipId={clipId} name={member.character.name} facing={member.facing} />}
      {lead && (
        <text className="explore-unit-lead" x="0" y="-58" textAnchor="middle">
          LEAD
        </text>
      )}
    </g>
  )
}

function ExplorerFigure({ image, clipId, name, facing }) {
  return (
    <>
      <clipPath id={clipId}>
        <rect x="-15" y="-50" width="30" height="40" rx="4" />
      </clipPath>
      <rect className="iso-unit-body" x="-17" y="-52" width="34" height="44" rx="5" />
      {image ? (
        <image href={image} x="-15" y="-50" width="30" height="40" preserveAspectRatio="xMidYMin slice" clipPath={`url(#${clipId})`} />
      ) : (
        <text className="iso-unit-initial" x="0" y="-25" textAnchor="middle">
          {name.charAt(0)}
        </text>
      )}
      <line className="iso-unit-stand" x1="0" y1="-8" x2="0" y2="0" />
      <FacingArrow facing={facing} />
    </>
  )
}

// An NPC on the map. Not clickable: a click on it is a move order to that spot.
// unperceived: shown only because the debug view is on (the party can't see it now).
function NpcToken({ npc, unperceived = false }) {
  const centre = project(npc.position)
  const image = npc.character?.portrait.image
  const clipId = `npc-clip-${npc.id.replace(/[^a-z0-9]/gi, '')}`
  const down = isDownAfterFight(npc)
  return (
    <g className={`iso-unit is-enemy explore-unit${down ? ' is-down' : ''}${unperceived ? ' is-unperceived' : ''}`} style={{ transform: `translate(${centre.x}px, ${centre.y}px)` }} pointerEvents="none">
      <title>{npc.name}</title>
      <ellipse className="iso-unit-ring" cx="0" cy="0" rx="22" ry="11" />
      {down ? <DownBody /> : <ExplorerFigure image={image} clipId={clipId} name={npc.name} facing={{ x: Math.cos(npc.heading), y: Math.sin(npc.heading) }} />}
    </g>
  )
}

const svgPoints = (list) => list.map((point) => project(point)).map(({ x, y }) => `${x},${y}`).join(' ')

// Developer view: each character's route and destination, and each follower's formation slot (dashed ring where the
// formation would put them, solid dot where walls let them stand).
function DebugOverlay({ state }) {
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
function NpcDebugOverlay({ world, party }) {
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

// A challenge object on the map: its name and current state. In reach = a party member can act on it now; clicking it
// then opens the interaction (a click elsewhere on the map stays a move order).
function ChallengeMarker({ view, inReach, onPress }) {
  const centre = project(view.position)
  const classes = ['challenge-marker', view.changed ? 'is-changed' : 'is-unresolved', inReach ? 'is-in-reach' : ''].filter(Boolean).join(' ')
  return (
    <g className={classes} transform={`translate(${centre.x} ${centre.y})`} onPointerDown={onPress}>
      <title>{`${view.name}: ${view.stateLabel}${inReach ? ' (click to interact)' : ''}`}</title>
      <ellipse cx="0" cy="0" rx="20" ry="10" />
      <path d="M0 -40 L9 -30 L0 -20 L-9 -30 Z" />
      <text className="challenge-marker-name" x="0" y="-46" textAnchor="middle">
        {view.name}
      </text>
      <text className="challenge-marker-state" x="0" y="20" textAnchor="middle">
        {view.stateLabel}
      </text>
    </g>
  )
}

// Developer view of the away team's perception: each member's vision radius, a ray to every NPC they see themselves,
// and under each NPC what the party knows of it (Visible with its observers, Known, or Unknown).
function PerceptionDebugOverlay({ party, world, knowledge }) {
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

// Where a click-to-move landed: a ring on the ground that grows and fades (CSS).
function ClickPulse({ point }) {
  const centre = project(point)
  return (
    <g className="explore-click-pulse" transform={`translate(${centre.x} ${centre.y}) scale(1 0.5)`}>
      <circle r="26" />
    </g>
  )
}

// onMove(point, fresh): a move order to a world point in tiles; fresh is false for the repeats while the button is held.
// onSelect(id, additive): a character was clicked (Shift or Ctrl adds / removes them from the selection).
// world: the NPCs (awareness.js). knowledge: what the away team knows of them (partyKnowledge.js): an NPC is drawn only
// while the party sees it, with a marker where it was last seen otherwise. The debug view shows every NPC.
// challenges: challenge object views (challengeObjects.js); reachableIds: those a party member can act on now;
// onInteract(id): a reachable object was clicked.
export default function ExplorationBoard({ state, world, knowledge, challenges = [], reachableIds = [], onInteract, debug, followCamera, onMove, onSelect }) {
  const { map } = state
  const leader = state.members[state.leaderId]
  const { camera, dragHandlers } = useCamera(worldBounds(map), VIEW, { key: `lead:${state.leaderId}`, point: project(leader.position) }, followCamera)
  const { ref: svgRef, onPointerDown: startCameraDrag, onContextMenu: preventMenu } = dragHandlers
  const holdRef = useRef(null)
  const pointerTypeRef = useRef('mouse')
  const [pulses, setPulses] = useState([])
  const pulseIdRef = useRef(0)
  const pulseTimers = useRef(new Set())
  useEffect(() => () => pulseTimers.current.forEach(clearTimeout), [])
  const addPulse = (point) => {
    const id = ++pulseIdRef.current
    setPulses((list) => [...list, { id, point }])
    const timer = setTimeout(() => {
      pulseTimers.current.delete(timer)
      setPulses((list) => list.filter((pulse) => pulse.id !== id))
    }, CLICK_PULSE_MS)
    pulseTimers.current.add(timer)
  }
  const onMoveRef = useRef(onMove)
  useEffect(() => {
    onMoveRef.current = onMove
  }, [onMove])

  const floor = useMemo(() => <FloorTiles map={map} />, [map])
  const blockPositions = useMemo(() => {
    const list = []
    map.tiles.forEach((row, y) =>
      row.forEach((id, x) => {
        if (isBlock(id)) list.push({ x, y })
      }),
    )
    return list
  }, [map])
  const panels = useMemo(() => getWallPanels(map), [map])
  const bigGroups = useMemo(() => getBigObjects(map), [map])
  const hidden = fadedBlockKeys(map, getMembers(state).map((member) => member.position), bigGroups)
  const faded = fadeWholeBigObjects(fadeWholePanels(hidden, panels), bigGroups)
  const darkBlocks = useDarkBlocks(faded, panels, bigGroups)
  const blocks = blockPositions.map((position) => {
    const key = `${position.x},${position.y}`
    return {
      depth: position.x + position.y,
      key: `b${key}`,
      element: <WallBlock key={`b${key}`} map={map} position={position} faded={faded} panels={panels} bigGroups={bigGroups} />,
    }
  })

  const toTiles = (clientX, clientY) => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!matrix) return null
    return unproject(new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()))
  }

  // Holding the left button: the point under the pointer is re-sent as the camera follows the lead character, so
  // keeping the pointer still keeps walking that way (follow-the-mouse).
  useEffect(() => () => holdRef.current?.stop(), [])
  const startHold = (event) => {
    const point = toTiles(event.clientX, event.clientY)
    if (!point) return
    onMoveRef.current(point, true)
    const hold = { client: { x: event.clientX, y: event.clientY }, sent: point, startedAt: performance.now(), steered: false }
    const move = (moveEvent) => {
      if (moveEvent.pointerId === event.pointerId) hold.client = { x: moveEvent.clientX, y: moveEvent.clientY }
    }
    const timer = setInterval(() => {
      const next = toTiles(hold.client.x, hold.client.y)
      if (!next || Math.hypot(next.x - hold.sent.x, next.y - hold.sent.y) < HOLD_MIN_CHANGE) return
      hold.sent = next
      hold.steered = true
      onMoveRef.current(next, false)
    }, HOLD_INTERVAL_MS)
    const stop = () => {
      clearInterval(timer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      holdRef.current = null
    }
    const end = (endEvent) => {
      if (endEvent.pointerId !== event.pointerId) return
      if (endEvent.type === 'pointerup' && !hold.steered && performance.now() - hold.startedAt <= CLICK_MAX_MS) addPulse(point)
      stop()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    holdRef.current?.stop()
    holdRef.current = { stop }
  }

  const handlePointerDown = (event) => {
    pointerTypeRef.current = event.pointerType
    startCameraDrag(event)
    if (event.pointerType === 'mouse' && event.button === 0) startHold(event)
  }
  // A finger can't hold-to-steer (a one-finger drag pans), so a tap is a single move order.
  const handleClick = (event) => {
    if (pointerTypeRef.current !== 'touch') return
    const point = toTiles(event.clientX, event.clientY)
    if (!point) return
    onMove(point, true)
    addPulse(point)
  }

  const pressMember = (id) => (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.stopPropagation()
    onSelect(id, isAdditive(event))
  }

  const depthItems = [
    ...blocks,
    ...getMembers(state).map((member) => ({
      depth: member.position.x + member.position.y + 0.5,
      key: `u${member.id}`,
      element: <Explorer key={`u${member.id}`} member={member} selected={isSelected(state, member.id)} lead={member.id === state.leaderId} onPress={pressMember(member.id)} />,
    })),
    ...getNpcs(world)
      .filter((npc) => debug || isVisibleToParty(knowledge, npc.id))
      .map((npc) => ({
        depth: npc.position.x + npc.position.y + 0.5,
        key: `n${npc.id}`,
        element: <NpcToken key={`n${npc.id}`} npc={npc} unperceived={!isVisibleToParty(knowledge, npc.id)} />,
      })),
    ...challenges.map((view) => {
      const inReach = reachableIds.includes(view.id)
      const press = (event) => {
        if (event.button !== 0 || !inReach) return
        event.stopPropagation()
        onInteract(view.id)
      }
      return { depth: view.position.x + view.position.y + 0.4, key: `c${view.id}`, element: <ChallengeMarker key={`c${view.id}`} view={view} inReach={inReach} onPress={press} /> }
    }),
  ].sort((a, b) => a.depth - b.depth)
  const lastKnown = getNpcs(world)
    .map((npc) => ({ npc, entry: getEntityKnowledge(knowledge, npc.id) }))
    .filter(({ entry }) => entry.state === KNOWLEDGE.KNOWN)

  return (
    <svg
      className="battlefield exploration-board"
      viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
      ref={svgRef}
      onPointerDown={handlePointerDown}
      onContextMenu={preventMenu}
      onClick={handleClick}
    >
      {floor}
      {lastKnown.map(({ npc, entry }) => (
        <LastKnownMarker key={`lk${npc.id}`} position={entry.lastKnownPosition} label={debug ? npc.name : entry.identified ? null : 'Life sign'} />
      ))}
      {pulses.map((pulse) => (
        <ClickPulse key={pulse.id} point={pulse.point} />
      ))}
      {depthItems.map((item) => item.element)}
      <AmbientDarkness map={map} blocks={darkBlocks} />
      {debug && <PerceptionDebugOverlay party={state} world={world} knowledge={knowledge} />}
      {debug && <NpcDebugOverlay world={world} party={state} />}
      {debug && <DebugOverlay state={state} />}
    </svg>
  )
}
