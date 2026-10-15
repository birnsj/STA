import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { controllerFor } from '../../actors/controllers.js'
import { getNpcs, isHostile } from '../../exploration/awareness.js'
import { getMembers, isSelected } from '../../exploration/partyControl.js'
import { getEntityKnowledge, isVisibleToParty, KNOWLEDGE } from '../../exploration/partyKnowledge.js'
import { fadeWholeBigObjects } from '../../maps/bigObjects.js'
import { figureShapes, hitTest, labelWidth } from '../../maps/boardHitTest.js'
import { project, TILE_H, TILE_W, unproject } from '../../maps/iso.js'
import { fadeWholePanels } from '../../maps/wallPanels.js'
import { hasCharacterSprite } from '../../rules/appearance.js'
import UnitActionRing from '../combat/UnitActionRing.jsx'
import useCamera from '../combat/useCamera.js'
import { boardLayout } from '../maps/canvasTiles.js'
import { MapReadyContext, MapRevealedContext } from '../maps/mapReady.js'
import useStableSet from '../maps/useStableSet.js'
import useWallFade from '../maps/useWallFade.js'
import { DebugOverlay, NpcDebugOverlay, PerceptionDebugOverlay } from './BoardDebugOverlays.jsx'
import {
  artBoxes,
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
  MARKER_NAME,
  NPC_TAG_DOWN_Y,
  NPC_TAG_Y,
  STRIDE_SPREAD,
  VIEW,
  worldBounds,
} from './boardGeometry.js'
import { startBoardScene } from './pixi/boardScene.js'
import { SIDE_COLOURS } from '../maps/pixi/figures.js'
import usePixiScene from '../maps/pixi/usePixiScene.js'
import WebglUnavailable from '../maps/pixi/WebglUnavailable.jsx'
// The exploration board, drawn with PixiJS (WebGL). The map, figures, challenge objects, transporter beams and scan
// sweeps are drawn by the Pixi scene (pixi/boardScene.js) from a description built here each render; the camera,
// pointer input, radial menus, selection box and debug views stay in an SVG laid over it, whose viewBox the scene
// follows. Clicks are matched to figures and objects by boardHitTest.js. Presentation and input only.

const clockNow = () => performance.now()
const isAdditive = (event) => event.shiftKey || event.ctrlKey || event.metaKey
const { yellow: YELLOW, red: RED, purple: PURPLE, blue: BLUE } = SIDE_COLOURS

const gaitOf = ({ walking, running, sneaking }) => (sneaking ? (walking ? 'sneakWalk' : 'sneakIdle') : running ? 'run' : walking ? 'walk' : 'idle')
const boardCursor = (target) => {
  if (!target || target.down) return ''
  if (target.kind === 'npc') return target.hostile ? 'attack' : 'talk'
  if (target.kind === 'destructible') return 'attack'
  return target.kind === 'object' ? 'use' : 'pointer'
}

export default function PixiExplorationBoard(props) {
  const { state, world, knowledge, challenges = [], reachableIds = [], onInteract, hazards = [], destructibles = [], onDestructible = () => {}, debug, followCamera, onCameraPan = null, onMove, onSelect, onSelectBox, onOpenMenu, onOpenNpcMenu, menu = null, beamIn = 'done', scanPulse = null } = props
  const { map } = state
  const leader = state.members[state.leaderId]
  const { camera, dragHandlers } = useCamera(worldBounds(map), VIEW, { key: `lead:${state.leaderId}`, point: project(leader.position) }, followCamera, null, false, onCameraPan)
  const { ref: svgRef, onPointerDown: startCameraDrag, onContextMenu: preventMenu } = dragHandlers
  const holdRef = useRef(null)
  const pointerTypeRef = useRef('mouse')
  const hoverRef = useRef(null)
  const [pulses, setPulses] = useState([])
  const pulseIdRef = useRef(0)
  const pulseTimers = useRef(new Set())
  useEffect(() => () => pulseTimers.current.forEach(clearTimeout), [])
  const addPulse = (point) => {
    const id = ++pulseIdRef.current
    setPulses((list) => [...list, { id, point, bornAt: clockNow() }])
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
  // Only the selected characters cut walls away.
  const hidden = useWallFade(
    map,
    getMembers(state)
      .filter((member) => isSelected(state, member.id))
      .map((member) => ({ id: member.id, position: member.position })),
    bigGroups,
  )
  const faded = useStableSet(fadeWholeBigObjects(fadeWholePanels(hidden, panels), bigGroups))

  // ---------------------------------------------------------------- what the scene draws, and what clicks hit

  const atDepth = (position, offset) => position.x + position.y + offset
  const members = getMembers(state)
  const figures = []
  const targets = []
  members.forEach((member, index) => {
    const controller = controllerFor(member)
    const animation = controller.animationState(member)
    const selected = isSelected(state, member.id)
    const lead = member.id === state.leaderId
    const centre = project(member.position)
    const depth = atDepth(member.position, 0.5)
    const { portrait } = member.character
    const beam = member.beaming ? 'away' : beamIn === 'done' ? (member.arriving ? 'in' : null) : beamIn === 'waiting' ? 'waiting' : 'in'
    figures.push({
      id: `u${member.id}`,
      centre,
      depth,
      seed: member.id,
      phase: (index * STRIDE_SPREAD) / members.length,
      facing: controller.facing(member),
      gait: gaitOf(animation),
      down: animation.down,
      condition: member.condition,
      spriteSet: portrait.spriteSet,
      colour: portrait.uniform ?? null,
      image: portrait.image,
      name: member.character.name,
      ring: selected ? 'selected' : 'player',
      arrowColour: lead ? YELLOW : BLUE,
      bodyColour: selected ? YELLOW : BLUE,
      label: lead ? { text: 'LEAD', y: -58, size: 9, weight: '700', colour: YELLOW, letterSpacing: 0.72 } : null,
      beam,
      faded: false,
    })
    if (!member.beaming && !member.arriving) {
      const token = !hasCharacterSprite(portrait.spriteSet)
      targets.push({ kind: 'member', id: member.id, depth, down: animation.down, shapes: figureShapes(centre, { scale: FIGURE_SCALE, token: token && !animation.down, label: lead ? 'LEAD' : null, labelY: -58 }) })
    }
  })
  for (const npc of getNpcs(world)) {
    const visible = isVisibleToParty(knowledge, npc.id)
    if (!debug && !visible) continue
    const controller = controllerFor(npc)
    const animation = controller.animationState(npc)
    const centre = project(npc.position)
    const depth = atDepth(npc.position, 0.5)
    const colour = isHostile(npc) ? RED : PURPLE
    const tagY = animation.down ? NPC_TAG_DOWN_Y : NPC_TAG_Y
    figures.push({
      id: `n${npc.id}`,
      centre,
      depth,
      seed: npc.id,
      phase: null,
      facing: controller.facing(npc),
      gait: animation.walking ? 'walk' : 'idle',
      down: animation.down,
      condition: npc.condition,
      spriteSet: npc.character?.portrait.spriteSet ?? null,
      colour: npc.character?.portrait.uniform ?? null,
      image: npc.character?.portrait.image ?? null,
      name: npc.name,
      ring: isHostile(npc) ? 'enemy' : 'neutral',
      arrowColour: colour,
      bodyColour: colour,
      label: { text: npc.name, y: tagY, size: 9, weight: '700', colour, letterSpacing: 0.36 },
      beam: null,
      faded: !visible,
    })
    if (onOpenNpcMenu && visible) {
      const token = !hasCharacterSprite(npc.character?.portrait.spriteSet)
      targets.push({ kind: 'npc', id: npc.id, hostile: isHostile(npc), depth, shapes: figureShapes(centre, { scale: FIGURE_SCALE, token: token && !animation.down, label: npc.name, labelY: tagY }) })
    }
  }
  const highlights = []
  const markers = []
  for (const view of challenges) {
    const inReach = reachableIds.includes(view.id)
    const tiles = highlightTiles(view.tiles ?? [view.position], bigGroups)
    const nearest = Math.max(...tiles.map((tile) => tile.x + tile.y))
    const area = highlightBox(map, bigGroups, tiles)
    const artTop = project(view.position).y - artTopY(map, bigGroups, tiles, area)
    highlights.push({ id: view.id, tiles, area, depth: nearest + 0.35, changed: Boolean(view.changed), inReach })
    markers.push({ id: view.id, position: view.position, artTop, name: view.name, stateLabel: view.stateLabel, changed: Boolean(view.changed), objective: Boolean(view.objective), inReach, depth: nearest + 0.4 })
    if (inReach) {
      const centre = project(view.position)
      const half = Math.max(9, labelWidth(view.name, 10) / 2, labelWidth(view.stateLabel, 9) / 2) + 6
      const top = centre.y - artTop - MARKER_NAME - 12
      const marker = { type: 'rect', x: centre.x - half, y: top, width: half * 2, height: centre.y - artTop - MARKER_DIAMOND - top }
      const art = artBoxes(map, bigGroups, tiles).map((box) => ({ type: 'rect', ...box }))
      targets.push({ kind: 'object', id: view.id, depth: nearest + 0.35, shapes: art }, { kind: 'object', id: view.id, depth: nearest + 0.4, shapes: [marker] })
    }
  }
  // Destructible objects open their Fire ring; a hazard in reach opens its Neutralize ring from its anchor tile only, so
  // clicking the rest of a fire still walks the party (out of it).
  for (const view of destructibles) {
    const centre = project(view.position)
    targets.push({ kind: 'destructible', id: view.id, depth: atDepth(view.position, 0.35), shapes: [{ type: 'rect', x: centre.x - 26, y: centre.y - 64, width: 52, height: 78 }] })
  }
  for (const view of hazards) {
    const centre = project(view.position)
    targets.push({ kind: 'object', id: view.id, depth: atDepth(view.position, -0.4), shapes: [{ type: 'diamond', cx: centre.x, cy: centre.y, rx: TILE_W / 2, ry: TILE_H / 2 }] })
  }
  const lastKnown = getNpcs(world)
    .map((npc) => ({ npc, entry: getEntityKnowledge(knowledge, npc.id) }))
    .filter(({ entry }) => entry.state === KNOWLEDGE.KNOWN)
    .map(({ npc, entry }) => ({ id: npc.id, position: entry.lastKnownPosition, label: debug ? npc.name : entry.identified ? null : 'Life sign' }))
  const effects = []
  for (const member of members) {
    if (beamIn === 'beaming' || member.arriving) effects.push({ id: `beam-${member.id}`, kind: 'transporter', position: project(member.position), direction: 'in' })
    if (member.beaming) effects.push({ id: `beam-out-${member.id}`, kind: 'transporter', position: project(member.position), direction: 'away' })
  }
  scanPulse?.rings.forEach((ring, index) => {
    effects.push({ id: `scan-${scanPulse.key}-${index}`, kind: 'scan', origin: ring.origin, radius: ring.radius, onDone: index === 0 ? scanPulse.onDone : undefined })
  })

  // The scene reads the latest description every frame; pointer handlers read the latest targets.
  const revealed = useContext(MapRevealedContext)
  const boardRef = useRef(null)
  const targetsRef = useRef(targets)
  const membersRef = useRef(state)
  useLayoutEffect(() => {
    boardRef.current = { layout, faded, figures, highlights, markers, lastKnown, pulses, effects, revealed }
    targetsRef.current = targets
    membersRef.current = state
  })
  const onMapReady = useContext(MapReadyContext)
  const onMapReadyRef = useRef(onMapReady)
  useEffect(() => {
    onMapReadyRef.current = onMapReady
  }, [onMapReady])

  const { hostRef, failed } = usePixiScene((host, isCancelled) => {
    const read = () => {
      const board = boardRef.current
      if (!board) return null
      const hovered = hoverRef.current
      return { ...board, svg: svgRef.current, highlights: board.highlights.map((item) => (item.id === hovered ? { ...item, hovered: true } : item)) }
    }
    return startBoardScene(host, read, () => onMapReadyRef.current?.(), isCancelled)
  })

  // ---------------------------------------------------------------- input

  const toBoard = (clientX, clientY) => {
    const matrix = svgRef.current?.getScreenCTM()
    return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : null
  }
  const toTiles = (clientX, clientY) => {
    const point = toBoard(clientX, clientY)
    return point ? unproject(point) : null
  }
  // The figure or object under the pointer; null over the overlay's own controls (a radial menu's buttons).
  const targetAt = (event) => {
    if (event.target !== svgRef.current) return null
    const point = toBoard(event.clientX, event.clientY)
    return point ? hitTest(point, targetsRef.current) : null
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

  // Right-drag: a selection box in board coordinates. A press without a drag opens the radial menu of the party
  // member it started on (or none).
  const [box, setBox] = useState(null)
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

  // A press on a figure or object: true when it is used there (the board doesn't
  // see it), false when it goes on to the board.
  const pressTarget = (target, event) => {
    const mouse = event.pointerType === 'mouse'
    if (target.kind === 'member') {
      // A right press goes on to the board (a drag still draws the selection box); remember whose it was.
      if (mouse && event.button === 2) rightPressedRef.current = target.id
      if (mouse && event.button !== 0) return false
      onSelect(target.id, isAdditive(event))
      return true
    }
    if (target.kind === 'npc') {
      if (mouse && event.button !== 0) return false
      onOpenNpcMenu(target.id)
      return true
    }
    if (event.button !== 0) return false
    if (target.kind === 'destructible') onDestructible(target.id)
    else onInteract(target.id)
    return true
  }

  const handlePointerDown = (event) => {
    pointerTypeRef.current = event.pointerType
    const target = targetAt(event)
    if (target && pressTarget(target, event)) return
    startCameraDrag(event)
    if (event.pointerType === 'mouse' && event.button === 0) startHold(event)
    if (event.pointerType === 'mouse' && event.button === 2) startBox(event)
  }
  // A finger can't hold-to-steer (a one-finger drag pans), so a tap is a single move order. A tap on a figure or an
  // object in reach is theirs.
  const handleClick = (event) => {
    if (pointerTypeRef.current !== 'touch' || targetAt(event)) return
    const point = toTiles(event.clientX, event.clientY)
    if (!point) return
    onMove(point, true)
    addPulse(point)
  }
  // Pointer cursor over what can be clicked (a figure standing, an object in reach); the object under it holds its
  // outline steady.
  const handlePointerMove = (event) => {
    const target = targetAt(event)
    hoverRef.current = target?.kind === 'object' ? target.id : null
    const svg = svgRef.current
    if (svg) svg.dataset.cursor = boardCursor(target)
  }

  const menuPosition = menu?.position
    ? menu.position
    : menu?.memberId
    ? state.members[menu.memberId]?.position
    : menu?.npcId
      ? world.npcs[menu.npcId]?.position
      : menu?.objectId
        ? challenges.find((view) => view.id === menu.objectId)?.position
        : null

  if (failed) return <WebglUnavailable />
  return (
    <>
      <div className="pixi-board-host" ref={hostRef} />
      <svg
        className="battlefield exploration-board"
        viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
        ref={svgRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onContextMenu={preventMenu}
        onClick={handleClick}
      >
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
    </>
  )
}
