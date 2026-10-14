import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { controllerFor } from '../../actors/controllers.js'
import { getNpcs, isHostile } from '../../exploration/awareness.js'
import { getMembers, isSelected } from '../../exploration/partyControl.js'
import { getEntityKnowledge, isVisibleToParty, KNOWLEDGE } from '../../exploration/partyKnowledge.js'
import LastKnownMarker from '../combat/LastKnownMarker.jsx'
import TransporterBeam from '../combat/TransporterBeam.jsx'
import ScanPulse from './ScanPulse.jsx'
import UnitActionRing from '../combat/UnitActionRing.jsx'
import { isBlock, project, unproject } from '../../maps/iso.js'
import { LoneTile, WallBlock } from '../maps/IsoTiles.jsx'
import useWallFade from '../maps/useWallFade.js'
import { fadeWholePanels } from '../../maps/wallPanels.js'
import { fadeWholeBigObjects } from '../../maps/bigObjects.js'
import useCamera from '../combat/useCamera.js'
import { boardLayout } from '../maps/canvasTiles.js'
import { around, labelHalfWidth } from '../maps/occlusion.js'
import MapCanvas from '../maps/MapCanvas.jsx'
import useFigureWindows from '../maps/useFigureWindows.jsx'
import useStableSet from '../maps/useStableSet.js'
import { useUniformImage } from '../useUniformImage.js'
import CharacterSprite from '../maps/CharacterSprite.jsx'
import FacingArrow from '../maps/FacingArrow.jsx'
import { defeatAnimation, hasCharacterSprite } from '../../rules/appearance.js'
import {
  artTopY,
  BOX_MIN_DRAG,
  CLICK_MAX_MS,
  CLICK_PULSE_MS,
  FIGURE_SCALE,
  figureInBox,
  highlightBox,
  highlightTiles,
  HOLD_INTERVAL_MS,
  HOLD_MIN_CHANGE,
  MARKER_DIAMOND,
  MARKER_HEIGHT,
  MARKER_NAME,
  MARKER_STATE,
  NPC_TAG_DOWN_Y,
  NPC_TAG_Y,
  OUTLINE_COLOURS,
  STRIDE_SPREAD,
  VIEW,
  worldBounds,
} from './boardGeometry.js'
import { DebugOverlay, NpcDebugOverlay, PerceptionDebugOverlay } from './BoardDebugOverlays.jsx'

// The exploration view: the same isometric tiles and camera as combat (WASD / arrows or right-drag pan, wheel zooms),
// with characters at continuous positions. Left click orders a move; holding the left button keeps steering the
// lead character toward the pointer. The map is drawn into canvases (MapCanvas); the figures are SVG over it, each
// group with the blocks in front of it drawn over it again (occlusion.js). Presentation and input only; positions come
// from partyControl.js.

// Read only from pointer handlers, never while rendering.
const clockNow = () => performance.now()
const isAdditive = (event) => event.shiftKey || event.ctrlKey || event.metaKey
// Down after a fight (incapacitated or defeated): drawn as combat draws a downed combatant, lying as it fell
// (already down, so the fall doesn't play again), or a flat body without a sprite set.
function DownBody({ condition, spriteSet = null, uniform = null, facing, seed }) {
  if (!hasCharacterSprite(spriteSet)) return <rect className="iso-unit-body" x="-16" y="-12" width="32" height="14" rx="3" />
  return <CharacterSprite setId={spriteSet} colour={uniform} facing={facing} seed={seed} animation={defeatAnimation(condition, seed)} settled />
}

// beamIn: 'waiting' (not shown yet) or 'beaming' while the away team beams in as the mission starts, else null.
// beamingOut: beaming out of the mission (the figure fades away).
// stridePhase: where in its looping animations the figure starts (0..1), so the party never steps in time.
function Explorer({ member, selected, lead, beamIn = null, beamingOut = false, stridePhase = null, onPress }) {
  const centre = project(member.position)
  const image = member.character.portrait.image
  const uniform = member.character.portrait.uniform
  const clipId = `explorer-clip-${member.id.replace(/[^a-z0-9]/gi, '')}`
  const controller = controllerFor(member)
  const { walking, running, sneaking, down } = controller.animationState(member)
  const facing = controller.facing(member)
  return (
    <g
      className={`iso-unit is-player explore-unit${selected ? ' is-selected' : ''}${lead ? ' is-lead' : ''}${down ? ' is-down' : ''}${sneaking && !down ? ' is-sneaking' : ''}${beamIn === 'waiting' ? ' is-beam-waiting' : ''}${beamIn === 'beaming' ? ' is-beaming-in' : ''}${beamingOut ? ' is-beaming-away' : ''}`}
      style={{ transform: `translate(${centre.x}px, ${centre.y}px)` }}
      onPointerDown={onPress}
      onClick={(event) => event.stopPropagation()}
    >
      <title>{member.character.name}</title>
      <ellipse className="iso-unit-ring" cx="0" cy="0" rx="22" ry="11" />
      {down ? (
        <DownBody condition={member.condition} spriteSet={member.character.portrait.spriteSet} uniform={uniform} facing={facing} seed={member.id} />
      ) : (
        <ExplorerFigure image={image} uniform={uniform} spriteSet={member.character.portrait.spriteSet} walking={walking} running={running} sneaking={sneaking} seed={member.id} phase={stridePhase} clipId={clipId} name={member.character.name} facing={facing} />
      )}
      {lead && (
        <text className="explore-unit-lead" x="0" y="-58" textAnchor="middle">
          LEAD
        </text>
      )}
    </g>
  )
}

// The character's full-body sprite where they have one (characterSprites.json), else their portrait on a stand.
function ExplorerFigure({ image, uniform = null, spriteSet = null, walking = false, running = false, sneaking = false, seed, phase = null, clipId, name, facing }) {
  const hasSprite = hasCharacterSprite(spriteSet)
  const shownImage = useUniformImage(hasSprite ? null : image, uniform)
  if (hasSprite) {
    return (
      <>
        <CharacterSprite setId={spriteSet} colour={uniform} facing={facing} walking={walking} running={running} sneaking={sneaking} seed={seed} phase={phase} fidgets />
        <FacingArrow facing={facing} />
      </>
    )
  }
  return (
    <>
      <clipPath id={clipId}>
        <rect x="-15" y="-50" width="30" height="40" rx="4" />
      </clipPath>
      <rect className="iso-unit-body" x="-17" y="-52" width="34" height="44" rx="5" />
      {image ? (
        shownImage && <image href={shownImage} x="-15" y="-50" width="30" height="40" preserveAspectRatio="xMidYMin slice" clipPath={`url(#${clipId})`} />
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
function NpcToken({ npc, unperceived = false, onPress = null }) {
  const centre = project(npc.position)
  const image = npc.character?.portrait.image
  const uniform = npc.character?.portrait.uniform
  const clipId = `npc-clip-${npc.id.replace(/[^a-z0-9]/gi, '')}`
  const controller = controllerFor(npc)
  const { walking, down } = controller.animationState(npc)
  const facing = controller.facing(npc)
  return (
    <g
      className={`iso-unit ${isHostile(npc) ? 'is-enemy' : 'is-neutral'} explore-unit${down ? ' is-down' : ''}${unperceived ? ' is-unperceived' : ''}${onPress ? ' is-clickable' : ''}`}
      style={{ transform: `translate(${centre.x}px, ${centre.y}px)` }}
      pointerEvents={onPress ? undefined : 'none'}
      onPointerDown={onPress ?? undefined}
      onClick={onPress ? (event) => event.stopPropagation() : undefined}
    >
      <title>{npc.name}</title>
      <ellipse className="iso-unit-ring" cx="0" cy="0" rx="22" ry="11" />
      {down ? (
        <DownBody condition={npc.condition} spriteSet={npc.character?.portrait.spriteSet} uniform={uniform} facing={facing} seed={npc.id} />
      ) : (
        <ExplorerFigure image={image} uniform={uniform} spriteSet={npc.character?.portrait.spriteSet} walking={walking} seed={npc.id} clipId={clipId} name={npc.name} facing={facing} />
      )}
      <text className="explore-npc-tag" x="0" y={down ? NPC_TAG_DOWN_Y : NPC_TAG_Y} textAnchor="middle">
        {npc.name}
      </text>
    </g>
  )
}

const challengeClasses = (base, view, inReach) => [base, view.changed ? 'is-changed' : 'is-unresolved', inReach ? 'is-in-reach' : ''].filter(Boolean).join(' ')
const challengeTitle = (view, inReach) => `${view.name}: ${view.stateLabel}${inReach ? ' (click to interact)' : ''}`

// The outline filters: the art's silhouette grown by a pixel or two, less the art itself, so only a ring round it is
// drawn and the map's own art (faded or not) shows through. The glow variant adds a soft halo outside the ring. One
// pair per state colour (exploration.css .challenge-marker uses the same colours): a filter's flood colour can't come
// from the element it is applied to.
function ObjectOutlineFilters({ prefix }) {
  return (
    <defs>
      {Object.entries(OUTLINE_COLOURS).flatMap(([name, colour]) =>
        [false, true].map((glow) => (
          <filter key={`${name}${glow}`} id={`${prefix}-${name}${glow ? '-glow' : ''}`} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius={glow ? 1.6 : 1} result="grown" />
            <feComposite in="grown" in2="SourceAlpha" operator="out" result="ring" />
            <feFlood floodColor={colour} />
            <feComposite in2="ring" operator="in" result="edge" />
            {glow ? (
              <>
                <feGaussianBlur in="edge" stdDeviation="3" />
                <feComposite in2="SourceAlpha" operator="out" result="halo" />
                <feMerge>
                  <feMergeNode in="halo" />
                  <feMergeNode in="halo" />
                  <feMergeNode in="edge" />
                </feMerge>
              </>
            ) : null}
          </filter>
        )),
      )}
    </defs>
  )
}

// A challenge object outlined in its state's colour (ObjectOutlineFilters): its art is drawn again only for the filter
// to trace, so just the outline shows. A thin edge while nobody can reach it; glowing once a party member can act on
// it, when clicking the art opens the interaction.
const NO_FADE = new Set()
function ObjectHighlight({ view, tiles, layout, filterPrefix, inReach, onPress }) {
  const { map, panels, bigGroups } = layout
  const filter = `url(#${filterPrefix}-${view.changed ? 'changed' : 'unresolved'}${inReach ? '-glow' : ''})`
  return (
    <g className={challengeClasses('object-highlight', view, inReach)} onPointerDown={onPress} onClick={inReach ? (event) => event.stopPropagation() : undefined}>
      <title>{challengeTitle(view, inReach)}</title>
      <g filter={filter}>
        {tiles.map((position) =>
          isBlock(map.tiles[position.y][position.x]) ? (
            <WallBlock key={`${position.x},${position.y}`} map={map} position={position} faded={NO_FADE} panels={panels} bigGroups={bigGroups} />
          ) : (
            <LoneTile key={`${position.x},${position.y}`} map={map} position={position} />
          ),
        )}
      </g>
    </g>
  )
}

// A challenge object on the map: its name, current state and a diamond stacked above its art (ObjectHighlight).
// artTop: the art's top, in world units above the object's tile centre. In reach = a party member can act on it now;
// clicking it then opens the interaction (a click elsewhere on the map stays a move order).
function ChallengeMarker({ view, artTop, inReach, onPress }) {
  const centre = project(view.position)
  const diamond = -artTop - MARKER_DIAMOND
  return (
    <g className={challengeClasses('challenge-marker', view, inReach)} transform={`translate(${centre.x} ${centre.y})`} onPointerDown={onPress} onClick={inReach ? (event) => event.stopPropagation() : undefined}>
      <title>{challengeTitle(view, inReach)}</title>
      <path d={`M0 ${diamond - 20} L9 ${diamond - 10} L0 ${diamond} L-9 ${diamond - 10} Z`} />
      <text className="challenge-marker-name" x="0" y={-artTop - MARKER_NAME} textAnchor="middle">
        {view.name}
      </text>
      <text className="challenge-marker-state" x="0" y={-artTop - MARKER_STATE} textAnchor="middle">
        {view.stateLabel}
      </text>
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
// onSelectBox(ids, additive): a right-drag box closed around these characters (Ctrl adds them to the selection).
// The right button draws the box, so the middle button drags the camera here.
// onOpenMenu(id): a right-click (no drag) on a party member (id), or elsewhere (null). onOpenNpcMenu(id): a left click on
// an NPC the party can see. menu: { memberId, buttons } or { npcId, buttons } drawn over that character, or
// { objectId, buttons } over that challenge object (UnitActionRing), or null; NPC and object menus also carry the
// ring's party band and button hover (party, onButtonHover); an object menu may carry slotRef (the slot above its ring).
// beamIn: the away team beaming in as the mission starts ('waiting' | 'beaming' | 'done', useBeamIn). Members beaming
// out (member.beaming) fade away in a transporter beam; members beamed in later (member.arriving) appear in one.
// scanPulse: a party Scan's sweeps to play ({ key, rings: [{ origin, radius }], onDone }, ScanPulse) or null.
// onCameraPan(): the player panned the camera while it followed the lead (the screen turns following off).
export default function ExplorationBoard({ state, world, knowledge, challenges = [], reachableIds = [], onInteract, debug, followCamera, onCameraPan = null, onMove, onSelect, onSelectBox, onOpenMenu, onOpenNpcMenu, menu = null, beamIn = 'done', scanPulse = null }) {
  const { map } = state
  const leader = state.members[state.leaderId]
  const { camera, dragHandlers } = useCamera(worldBounds(map), VIEW, { key: `lead:${state.leaderId}`, point: project(leader.position) }, followCamera, null, false, onCameraPan)
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

  const layout = useMemo(() => boardLayout(map), [map])
  const { panels, bigGroups } = layout
  const filterPrefix = useId()
  // Only the selected characters cut walls away.
  const hidden = useWallFade(
    map,
    getMembers(state)
      .filter((member) => isSelected(state, member.id))
      .map((member) => ({ id: member.id, position: member.position })),
    bigGroups,
  )
  const faded = useStableSet(fadeWholeBigObjects(fadeWholePanels(hidden, panels), bigGroups))

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
    const hold = { client: { x: event.clientX, y: event.clientY }, sent: point, startedAt: clockNow(), steered: false }
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
      if (endEvent.type === 'pointerup' && !hold.steered && clockNow() - hold.startedAt <= CLICK_MAX_MS) addPulse(point)
      stop()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    holdRef.current?.stop()
    holdRef.current = { stop }
  }

  // Right-drag: a selection box in board coordinates. It ends at the pointer's board point, so it stays right while the
  // camera follows the lead character. A press without a drag selects nothing.
  const [box, setBox] = useState(null)
  const membersRef = useRef(state)
  useEffect(() => {
    membersRef.current = state
  }, [state])
  const toBoard = (clientX, clientY) => {
    const matrix = svgRef.current?.getScreenCTM()
    return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : null
  }
  // The party member a right press started on: released without a drag, it opens their radial menu.
  const rightPressedRef = useRef(null)
  const startBox = (event) => {
    const pressedId = rightPressedRef.current
    rightPressedRef.current = null
    const from = toBoard(event.clientX, event.clientY)
    if (!from) return
    const start = { x: event.clientX, y: event.clientY }
    let current = null
    const move = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return
      if (!current && Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) < BOX_MIN_DRAG) return
      current = toBoard(moveEvent.clientX, moveEvent.clientY) ?? current
      setBox({ from: { x: from.x, y: from.y }, to: { x: current.x, y: current.y } })
    }
    const end = (endEvent) => {
      if (endEvent.pointerId !== event.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setBox(null)
      if (endEvent.type !== 'pointerup') return
      if (!current) {
        onOpenMenu?.(pressedId)
        return
      }
      const ids = getMembers(membersRef.current)
        .filter((member) => figureInBox(project(member.position), from, current))
        .map((member) => member.id)
      onSelectBox?.(ids, endEvent.ctrlKey || endEvent.metaKey)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const handlePointerDown = (event) => {
    pointerTypeRef.current = event.pointerType
    startCameraDrag(event)
    if (event.pointerType === 'mouse' && event.button === 0) startHold(event)
    if (event.pointerType === 'mouse' && event.button === 2) startBox(event)
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
    // A right press goes on to the board (a drag still draws the selection box); remember whose it was.
    if (event.pointerType === 'mouse' && event.button === 2) rightPressedRef.current = id
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.stopPropagation()
    onSelect(id, isAdditive(event))
  }
  const pressNpc = (id) => (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.stopPropagation()
    onOpenNpcMenu(id)
  }
  const menuPosition = menu?.memberId
    ? state.members[menu.memberId]?.position
    : menu?.npcId
      ? world.npcs[menu.npcId]?.position
      : menu?.objectId
        ? challenges.find((view) => view.id === menu.objectId)?.position
        : null

  // On the floor, under every block: where NPCs were last seen, and the click rings.
  const ground = (
    <>
      {getNpcs(world)
        .map((npc) => ({ npc, entry: getEntityKnowledge(knowledge, npc.id) }))
        .filter(({ entry }) => entry.state === KNOWLEDGE.KNOWN)
        .map(({ npc, entry }) => (
          <LastKnownMarker key={`lk${npc.id}`} position={entry.lastKnownPosition} label={debug ? npc.name : entry.identified ? null : 'Life sign'} />
        ))}
      {pulses.map((pulse) => (
        <ClickPulse key={pulse.id} point={pulse.point} />
      ))}
    </>
  )
  // The figures standing among the blocks, in painter's order by depth.
  const atDepth = (position, offset) => position.x + position.y + offset
  const figures = [
    ...getMembers(state).map((member, index, members) => ({
      depth: atDepth(member.position, 0.5),
      box: around(member.position, 30 * FIGURE_SCALE, 72 * FIGURE_SCALE),
      element: (
        <Explorer
          key={`u${member.id}`}
          member={member}
          stridePhase={(index * STRIDE_SPREAD) / members.length}
          selected={isSelected(state, member.id)}
          lead={member.id === state.leaderId}
          beamIn={beamIn === 'done' ? (member.arriving ? 'beaming' : null) : beamIn}
          beamingOut={Boolean(member.beaming)}
          onPress={member.beaming || member.arriving ? undefined : pressMember(member.id)}
        />
      ),
    })),
    ...getNpcs(world)
      .filter((npc) => debug || isVisibleToParty(knowledge, npc.id))
      .map((npc) => ({
        depth: atDepth(npc.position, 0.5),
        box: around(npc.position, Math.max(30 * FIGURE_SCALE, labelHalfWidth(npc.name)), Math.max(72 * FIGURE_SCALE, 12 - NPC_TAG_Y)),
        element: <NpcToken key={`n${npc.id}`} npc={npc} unperceived={!isVisibleToParty(knowledge, npc.id)} onPress={onOpenNpcMenu && isVisibleToParty(knowledge, npc.id) ? pressNpc(npc.id) : null} />,
      })),
    ...challenges.flatMap((view) => {
      const inReach = reachableIds.includes(view.id)
      const press = (event) => {
        if (event.button !== 0 || !inReach) return
        event.stopPropagation()
        onInteract(view.id)
      }
      const half = Math.max(30, labelHalfWidth(view.name), labelHalfWidth(view.stateLabel))
      const tiles = highlightTiles(view.tiles ?? [view.position], bigGroups)
      const nearest = Math.max(...tiles.map((tile) => tile.x + tile.y))
      const art = highlightBox(map, bigGroups, tiles)
      const artTop = project(view.position).y - artTopY(map, bigGroups, tiles, art)
      return [
        {
          depth: nearest + 0.35,
          box: art,
          element: <ObjectHighlight key={`h${view.id}`} view={view} tiles={tiles} layout={layout} filterPrefix={filterPrefix} inReach={inReach} onPress={press} />,
        },
        {
          depth: nearest + 0.4,
          box: around(view.position, half, artTop + MARKER_HEIGHT, half, -artTop + 2),
          element: <ChallengeMarker key={`c${view.id}`} view={view} artTop={artTop} inReach={inReach} onPress={press} />,
        },
      ]
    }),
  ]
  const { holes, windows } = useFigureWindows(layout, faded, figures)

  return (
    <svg
      className="battlefield exploration-board"
      viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
      ref={svgRef}
      onPointerDown={handlePointerDown}
      onContextMenu={preventMenu}
      onClick={handleClick}
    >
      <ObjectOutlineFilters prefix={filterPrefix} />
      <MapCanvas layout={layout} faded={faded} holes={holes} ground={ground}>
        {windows}
      </MapCanvas>
      {getMembers(state)
        .filter((member) => beamIn === 'beaming' || member.arriving)
        .map((member) => (
          <TransporterBeam key={`beam-${member.id}`} position={project(member.position)} direction="in" />
        ))}
      {getMembers(state)
        .filter((member) => member.beaming)
        .map((member) => (
          <TransporterBeam key={`beam-out-${member.id}`} position={project(member.position)} direction="away" />
        ))}
      {scanPulse?.rings.map((ring, index) => (
        <ScanPulse key={`scan-${scanPulse.key}-${index}`} origin={ring.origin} radius={ring.radius} onDone={index === 0 ? scanPulse.onDone : undefined} />
      ))}
      {debug && <PerceptionDebugOverlay party={state} world={world} knowledge={knowledge} />}
      {debug && <NpcDebugOverlay world={world} party={state} />}
      {debug && <DebugOverlay state={state} />}
      {menuPosition && (
        <UnitActionRing position={menuPosition} buttons={menu.buttons} info={menu.info ?? null} party={menu.party ?? null} onButtonHover={menu.onButtonHover} slotRef={menu.slotRef} placement="top" prominent />
      )}
      {box && (
        <rect
          className="explore-select-box"
          x={Math.min(box.from.x, box.to.x)}
          y={Math.min(box.from.y, box.to.y)}
          width={Math.abs(box.to.x - box.from.x)}
          height={Math.abs(box.to.y - box.from.y)}
          pointerEvents="none"
        />
      )}
    </svg>
  )
}
