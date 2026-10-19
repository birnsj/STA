import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { controllerFor } from '../../actors/controllers.js'
import { getNpcs, isHostile } from '../../exploration/awareness.js'
import { getMembers, isSelected } from '../../exploration/partyControl.js'
import { getEntityKnowledge, isVisibleToParty, KNOWLEDGE } from '../../exploration/partyKnowledge.js'
import { fadeWholeBigObjects } from '../../maps/bigObjects.js'
import { figureShapes, hitTest, rectOnGround } from '../../maps/boardHitTest.js'
import { diamond, project, pts, TILE_H, TILE_W, tileImageBox, unproject } from '../../maps/iso.js'
import { TILE_IMAGE } from '../../maps/mapFormat.js'
import { canPlaceAt } from '../../rules/inventory.js'
import { isDestructibleScanned } from '../../world/destructibleScan.js'
import { fadeWholePanels } from '../../maps/wallPanels.js'
import { playBoardHover, playWeaponSound } from '../../audio/uiSounds.js'
import { getWeapon } from '../../combat/weaponSystem.js'
import { hasCharacterSprite } from '../../rules/appearance.js'
import { worldToGrid } from '../../exploration/tacticalGrid.js'
import { characterHazardOverlayType, hasCharacterHazardOverlay } from '../../world/characterHazardOverlay.js'
import { hazardPanic } from '../../world/hazardPanic.js'
import { cameraFocusAlongShot, SHOT_FIRE_MS, shotCameraRideMs, weaponShotLook } from '../combat/battleHelpers.js'
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
  NPC_TAG_DOWN_Y,
  NPC_TAG_Y,
  STRIDE_SPREAD,
  VIEW,
  worldBounds,
} from './boardGeometry.js'
import { startBoardScene } from './pixi/boardScene.js'
import { explosionItems, playNewExplosionSounds } from '../maps/pixi/explosionView.js'
import { SIDE_COLOURS } from '../maps/pixi/figures.js'
import usePixiScene from '../maps/pixi/usePixiScene.js'
import WebglUnavailable from '../maps/pixi/WebglUnavailable.jsx'
// The exploration board, drawn with PixiJS (WebGL). The map, figures, challenge objects, transporter beams and scan
// sweeps are drawn by the Pixi scene (pixi/boardScene.js) from a description built here each render; the camera,
// pointer input, radial menus, selection box and debug views stay in an SVG laid over it, whose viewBox the scene
// follows. Clicks are matched to figures and objects by boardHitTest.js. Presentation and input only.

const clockNow = () => performance.now()
const isAdditive = (event) => event.shiftKey || event.ctrlKey || event.metaKey
const { yellow: YELLOW, red: RED, purple: PURPLE, blue: BLUE, drop: DROP } = SIDE_COLOURS

const gaitOf = ({ walking, running, sneaking }) => (sneaking ? (walking ? 'sneakWalk' : 'sneakIdle') : running ? 'run' : walking ? 'walk' : 'idle')
const boardCursor = (target) => {
  if (!target || target.down) return ''
  if (target.kind === 'npc') return target.hostile ? 'attack' : 'talk'
  if (target.kind === 'destructible') return 'attack'
  if (target.kind === 'groundItem') return 'use'
  return target.kind === 'object' ? 'use' : 'pointer'
}

export default function PixiExplorationBoard(props) {
  const {
    state,
    world,
    knowledge,
    challenges = [],
    reachableIds = [],
    onInteract,
    environment = null,
    hazards = [],
    destructibles = [],
    onDestructible = () => {},
    groundItems = [],
    groundReachableIds = [],
    onGroundItem = () => {},
    onGroundItemMenu = null,
    onGroundItemDragStart = null,
    placingItem = null,
    placeHover = null,
    onPlaceHover = null,
    exploreState = null,
    placeHelpersRef = null,
    // Member id under an item drag who can take it into their bag (green ring).
    itemDropMemberId = null,
    itemDragActive = false,
    // Marker / ground ids whose floating name tags stay hidden (open ring under the pointer).
    hiddenTagIds = [],
    debug,
    followCamera,
    onCameraPan = null,
    onCameraFollow = null,
    onMove,
    onSelect,
    onSelectBox,
    onOpenMenu,
    onOpenNpcMenu,
    onStaggerDone = null,
    menu = null,
    beamIn = 'done',
    scanPulse = null,
    lastObjectShot = null,
  } = props
  const { map } = state
  const leader = state.members[state.leaderId]
  // A blast throw already moved the lead to the landing tile. Follow that, not a shot ride still aimed at the explosive.
  const leaderThrown = Boolean(leader?.blastReact?.from && leader?.blastReact?.land)
  // With follow on, ride a destructible shot from the shooter to the object (same timing as the beam on the board).
  const [shotFocus, setShotFocus] = useState(null)
  const objectShotKey = lastObjectShot?.key ?? null
  useEffect(() => {
    if (!followCamera || !lastObjectShot) {
      setShotFocus(null)
      return undefined
    }
    const shooter = state.members[lastObjectShot.memberId]
    const record = environment?.destructibles?.[lastObjectShot.objectId]
    const weapon = getWeapon(lastObjectShot.weaponId)
    const look = weapon ? weaponShotLook('player', weapon, { missed: !lastObjectShot.passed }) : null
    if (!shooter || !record || !look) {
      setShotFocus(null)
      return undefined
    }
    const aim = {
      key: lastObjectShot.key,
      from: { ...shooter.position },
      to: { ...record.position },
      pulse: look.pulse,
      impactMs: look.impactMs,
    }
    const started = performance.now()
    const rideMs = shotCameraRideMs(aim, 1)
    let frame = 0
    const tick = (now) => {
      if (now - started >= rideMs) {
        // The ride is done. Leave the shot or the view stays on the impact while the party is thrown clear of it.
        setShotFocus(null)
        return
      }
      const focus = cameraFocusAlongShot(aim, now - started, 1)
      setShotFocus({ key: focus.key, point: project(focus.position) })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // Positions are frozen when the shot begins; restarting mid-flight would snap the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- objectShotKey / followCamera only
  }, [followCamera, objectShotKey])
  const boardFocus =
    shotFocus && !leaderThrown
      ? shotFocus
      : {
          key: `lead:${state.leaderId}${leaderThrown ? `:throw:${leader.blastReact.from.x},${leader.blastReact.from.y}` : ''}`,
          point: project(leader.position),
        }
  const { camera, dragHandlers } = useCamera(worldBounds(map), VIEW, boardFocus, followCamera, null, false, onCameraPan, onCameraFollow)
  const { ref: svgRef, onPointerDown: startCameraDrag, onContextMenu: preventMenu } = dragHandlers
  const holdRef = useRef(null)
  const pointerTypeRef = useRef('mouse')
  const hoverRef = useRef(null)
  // Left Alt held: outline every challenge object, destructible, and ground item (and their name tags).
  const altHighlightRef = useRef(false)
  const hiddenTagIdsRef = useRef(hiddenTagIds)
  useEffect(() => {
    hiddenTagIdsRef.current = hiddenTagIds
  }, [hiddenTagIds])
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
    const dropTarget = itemDropMemberId === member.id
    const lead = member.id === state.leaderId
    const centre = project(member.position)
    const depth = atDepth(member.position, 0.5)
    const { portrait } = member.character
    const beam = member.beaming ? 'away' : beamIn === 'done' ? (member.arriving ? 'in' : null) : beamIn === 'waiting' ? 'waiting' : 'in'
    const hazardOverlay = characterHazardOverlayType(environment, worldToGrid(member.position), member.character, member.condition)
    const accent = dropTarget ? DROP : selected ? YELLOW : BLUE
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
      blastReact: member.blastReact ?? null,
      onStaggerDone: member.blastReact && onStaggerDone ? () => onStaggerDone(member.id) : null,
      hazardOverlay,
      panic: hazardPanic(member.character, hazardOverlay),
      spriteSet: portrait.spriteSet,
      colour: portrait.uniform ?? null,
      image: portrait.image,
      name: member.character.name,
      ring: dropTarget ? 'dropTarget' : selected ? 'selected' : 'player',
      arrowColour: dropTarget ? DROP : lead ? YELLOW : BLUE,
      bodyColour: accent,
      label: lead ? { text: 'LEAD', y: -58, size: 9, weight: '700', colour: dropTarget ? DROP : YELLOW, letterSpacing: 0.72 } : null,
      beam,
      // Fall / getup sheets are large; ask early so blast stagger can play getUp.
      preload: true,
      faded: false,
    })
    if (!member.beaming && !member.arriving) {
      const token = !hasCharacterSprite(portrait.spriteSet)
      targets.push({ kind: 'member', id: member.id, depth, down: animation.down, shapes: figureShapes(centre, { scale: FIGURE_SCALE, token: token && !animation.down, label: lead ? 'LEAD' : null, labelY: -58 }) })
    }
  })
  for (const npc of getNpcs(world)) {
    const grid = worldToGrid(npc.position)
    const hazardOverlay = characterHazardOverlayType(environment, grid, npc.character, npc.condition)
    const visible = isVisibleToParty(knowledge, npc.id)
    const controller = controllerFor(npc)
    const animation = controller.animationState(npc)
    // Burning / afflicted NPCs and fallen bodies stay on the board even when out of party sight.
    if (!debug && !visible && !hazardOverlay && !animation.down) continue
    const centre = project(npc.position)
    const depth = atDepth(npc.position, 0.5)
    const colour = isHostile(npc) ? RED : PURPLE
    const tagY = animation.down ? NPC_TAG_DOWN_Y : NPC_TAG_Y
    // Hazard-only reveal shows the figure and FX without naming them (no sight knowledge).
    const tag = visible || debug ? npc.name : null
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
      blastReact: npc.blastReact ?? null,
      onStaggerDone: npc.blastReact && onStaggerDone ? () => onStaggerDone(npc.id) : null,
      hazardOverlay,
      panic: hazardPanic(npc.character, hazardOverlay),
      spriteSet: npc.character?.portrait.spriteSet ?? null,
      colour: npc.character?.portrait.uniform ?? null,
      image: npc.character?.portrait.image ?? null,
      name: npc.name,
      ring: isHostile(npc) ? 'enemy' : 'neutral',
      arrowColour: colour,
      bodyColour: colour,
      label: tag ? { text: tag, y: tagY, size: 9, weight: '700', colour, letterSpacing: 0.36 } : null,
      // Patrol waypoint idle fidget (NPCController.animationState); null keeps random idle fidgets.
      pose: animation.pose ?? null,
      beam: null,
      preload: true,
      faded: !visible && !hazardOverlay,
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
    // After a successful Scan, mouseover shows type + authored description (objectScans).
    const scanned = isDestructibleScanned(exploreState?.objectScans, view.id)
    markers.push({
      id: view.id,
      position: view.position,
      artTop,
      name: view.name,
      stateLabel: view.stateLabel,
      typeLabel: scanned ? view.type : null,
      description: scanned && view.description ? view.description : null,
      changed: Boolean(view.changed),
      objective: Boolean(view.objective),
      inReach,
      depth: nearest + 0.4,
    })
    // Only in-reach objects take hits, and only on the art sitting on the ground. The name tag floats above that
    // and is display-only, so the pointer leaves the object as soon as it moves onto the label.
    if (inReach) {
      const floor = artTopY(map, bigGroups, tiles, area) - MARKER_DIAMOND
      const shapes = artBoxes(map, bigGroups, tiles)
        .map((box) => rectOnGround(box, floor))
        .filter(Boolean)
        .map((box) => ({ type: 'rect', ...box }))
      if (shapes.length) targets.push({ kind: 'object', id: view.id, depth: nearest + 0.35, shapes })
    }
  }
  // Destructible objects open their Fire ring; outline templates for hover highlight (only the hovered id is shown each
  // frame). A hazard in reach opens its Neutralize ring from its anchor tile only, so clicking the rest of a fire still
  // walks the party (out of it).
  const destructibleHighlights = []
  for (const view of destructibles) {
    const centre = project(view.position)
    const tiles = highlightTiles([view.position], bigGroups)
    const area = highlightBox(map, bigGroups, tiles)
    const depth = atDepth(view.position, 0.35)
    destructibleHighlights.push({ id: view.id, tiles, area, depth, changed: false, inReach: true })
    targets.push({ kind: 'destructible', id: view.id, depth, shapes: [{ type: 'rect', x: centre.x - 26, y: centre.y - 64, width: 52, height: 78 }] })
  }
  for (const view of hazards) {
    const centre = project(view.position)
    targets.push({ kind: 'object', id: view.id, depth: atDepth(view.position, -0.4), shapes: [{ type: 'diamond', cx: centre.x, cy: centre.y, rx: TILE_W / 2, ry: TILE_H / 2 }] })
  }
  // Runtime inventory drops (rules/inventory.js): isometric tile props + challenge-style name markers.
  const groundLoot = []
  for (const view of groundItems) {
    const inReach = groundReachableIds.includes(view.id)
    // Markers/depth use the containing map tile; the prop itself sits on the 8×8 sub-grid position.
    const floorTile = { x: Math.round(view.position.x), y: Math.round(view.position.y) }
    const tiles = highlightTiles([floorTile], bigGroups)
    const nearest = Math.max(...tiles.map((tile) => tile.x + tile.y))
    const area = highlightBox(map, bigGroups, tiles)
    const artTop = project(view.position).y - artTopY(map, bigGroups, tiles, area)
    const depth = view.position.x + view.position.y + 0.35
    const worldScale = view.worldScale ?? 0.4
    groundLoot.push({
      id: view.id,
      position: view.position,
      worldImage: view.worldImage,
      worldTile: view.worldTile,
      worldScale,
      category: view.category,
      inReach,
      depth,
    })
    // Same floating object tag as challenge objects (hover only — see MarkerView). After Scan: category + description.
    const groundScanned = isDestructibleScanned(exploreState?.objectScans, view.id)
    markers.push({
      id: `ground:${view.id}`,
      position: view.position,
      artTop,
      name: view.name,
      stateLabel: 'On ground',
      typeLabel: groundScanned ? view.category : null,
      description: groundScanned && view.description ? view.description : null,
      changed: false,
      objective: false,
      inReach,
      depth: nearest + 0.4,
    })
    // Match the drawn prop, but not the name tag floating above it.
    const scale = Math.max(0.15, Math.min(1, worldScale))
    const size = { width: TILE_IMAGE.width * scale, height: TILE_IMAGE.height * scale }
    const box = tileImageBox(view.position, size)
    const pad = 10
    const floor = artTopY(map, bigGroups, tiles, area) - MARKER_DIAMOND
    const art = rectOnGround({ x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 }, floor)
    if (art) targets.push({ kind: 'groundItem', id: view.id, depth, shapes: [{ type: 'rect', ...art }] })
  }
  const lastKnown = getNpcs(world)
    .map((npc) => ({ npc, entry: getEntityKnowledge(knowledge, npc.id) }))
    .filter(({ npc, entry }) => {
      if (entry.state !== KNOWLEDGE.KNOWN) return false
      // Already drawing their live figure (hazard reveal) — skip the ghost marker.
      return !hasCharacterHazardOverlay(environment, worldToGrid(npc.position), npc.character, npc.condition)
    })
    .map(({ npc, entry }) => ({ id: npc.id, position: entry.lastKnownPosition, label: debug ? npc.name : entry.identified ? null : 'Life sign' }))
  const effects = []
  for (const member of members) {
    if (beamIn === 'beaming' || member.arriving) effects.push({ id: `beam-${member.id}`, kind: 'transporter', position: project(member.position), direction: 'in' })
    if (member.beaming) effects.push({ id: `beam-out-${member.id}`, kind: 'transporter', position: project(member.position), direction: 'away' })
  }
  scanPulse?.rings.forEach((ring, index) => {
    effects.push({ id: `scan-${scanPulse.key}-${index}`, kind: 'scan', origin: ring.origin, radius: ring.radius, onDone: index === 0 ? scanPulse.onDone : undefined })
  })
  // Phaser / disruptor fire at a destructible (explorationEnvironment lastObjectShot).
  if (lastObjectShot) {
    const shooter = state.members[lastObjectShot.memberId]
    const record = environment?.destructibles?.[lastObjectShot.objectId]
    const weapon = getWeapon(lastObjectShot.weaponId)
    const look = weapon ? weaponShotLook('player', weapon, { missed: !lastObjectShot.passed }) : null
    if (shooter && record && look?.colour) {
      const from = project(shooter.position)
      const to = project(record.position)
      const raised = (point) => ({ x: point.x, y: point.y - 30 })
      const dx = to.x - from.x
      const dy = to.y - from.y
      const length = Math.hypot(dx, dy) || 1
      const end = lastObjectShot.passed ? to : { x: to.x + (dx / length) * 40 - (dy / length) * 18, y: to.y + (dy / length) * 40 + (dx / length) * 18 }
      effects.push({
        id: `object-shot-${lastObjectShot.key}`,
        kind: look.pulse ? 'pulseShot' : 'beamShot',
        from: raised(from),
        end: raised(end),
        hit: lastObjectShot.passed ? raised(to) : null,
        colour: look.colour,
        delayMs: SHOT_FIRE_MS,
        speed: 1,
      })
    }
  }
  const explosions = explosionItems(environment)
  const heardExplosionsRef = useRef(new Set())
  const explosionsSeededRef = useRef(false)
  const explosionKey = (environment?.explosions ?? []).map((blast) => blast.id).join('|')
  useEffect(() => {
    if (!explosionsSeededRef.current) {
      explosionsSeededRef.current = true
      playNewExplosionSounds(explosions, heardExplosionsRef.current, { seedOnly: true })
      return
    }
    playNewExplosionSounds(explosions, heardExplosionsRef.current)
  }, [explosionKey, explosions])
  const objectWeapon = lastObjectShot ? getWeapon(lastObjectShot.weaponId) : null
  const objectShotSound = objectWeapon ? weaponShotLook('player', objectWeapon, { missed: !lastObjectShot.passed }) : null
  useEffect(() => {
    if (!objectShotKey || !objectShotSound?.sound) return
    const timer = setTimeout(() => playWeaponSound(objectShotSound.sound, 1, objectShotSound.injuryMode), SHOT_FIRE_MS)
    return () => clearTimeout(timer)
  }, [objectShotKey, objectShotSound?.sound, objectShotSound?.injuryMode])

  // The scene reads the latest description every frame; pointer handlers read the latest targets.
  const revealed = useContext(MapRevealedContext)
  const boardRef = useRef(null)
  const targetsRef = useRef(targets)
  const membersRef = useRef(state)
  const toBoard = (clientX, clientY) => {
    const matrix = svgRef.current?.getScreenCTM()
    if (!matrix) return null
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    return { x: point.x, y: point.y }
  }
  const toTiles = (clientX, clientY) => {
    const point = toBoard(clientX, clientY)
    return point ? unproject(point) : null
  }
  const toClient = (svgX, svgY) => {
    const matrix = svgRef.current?.getScreenCTM()
    if (!matrix) return null
    const point = new DOMPoint(svgX, svgY).matrixTransform(matrix)
    return { x: point.x, y: point.y }
  }

  useLayoutEffect(() => {
    boardRef.current = { layout, faded, figures, highlights, destructibleHighlights, markers, groundLoot, lastKnown, pulses, effects, explosions, environment, revealed }
    targetsRef.current = targets
    membersRef.current = state
    if (placeHelpersRef) {
      placeHelpersRef.current = {
        toTiles,
        toClient,
        // Party member under the pointer (for item-drag → bag). Uses the same hit list as clicks.
        memberAt: (clientX, clientY) => {
          const point = toBoard(clientX, clientY)
          if (!point) return null
          const hit = hitTest(point, targetsRef.current)
          return hit?.kind === 'member' ? hit.id : null
        },
      }
    }
  })
  const onMapReady = useContext(MapReadyContext)
  const onMapReadyRef = useRef(onMapReady)
  useEffect(() => {
    onMapReadyRef.current = onMapReady
  }, [onMapReady])

  // Hold Left Alt to light up every world prop outline (challenges, destructibles, ground loot).
  useEffect(() => {
    const setHeld = (held) => {
      altHighlightRef.current = held
    }
    const onKeyDown = (event) => {
      if (event.code !== 'AltLeft' || event.repeat) return
      event.preventDefault()
      setHeld(true)
    }
    const onKeyUp = (event) => {
      if (event.code !== 'AltLeft') return
      setHeld(false)
    }
    const clear = () => setHeld(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
      altHighlightRef.current = false
    }
  }, [])

  const { hostRef, failed } = usePixiScene((host, isCancelled) => {
    const read = () => {
      const board = boardRef.current
      if (!board) return null
      const hovered = hoverRef.current
      const showAll = altHighlightRef.current
      const hideTags = new Set(hiddenTagIdsRef.current ?? [])
      const tagHidden = (id) => hideTags.has(id) || hideTags.has(`ground:${id}`)
      const objectOutlines = board.highlights.map((item) =>
        showAll || item.id === hovered ? { ...item, hovered: true } : item,
      )
      const destructibleOutlines = showAll
        ? board.destructibleHighlights.map((item) => ({ ...item, hovered: true }))
        : hovered
          ? board.destructibleHighlights.filter((item) => item.id === hovered).map((item) => ({ ...item, hovered: true }))
          : []
      const groundLoot = (board.groundLoot ?? []).map((item) => ({
        ...item,
        hovered: showAll || item.id === hovered,
      }))
      // Name tags while hovered or Left Alt — never while that object's ring is open (hides under the menu).
      const markers = (board.markers ?? []).map((item) => {
        const hoverId = item.id.startsWith('ground:') ? item.id.slice('ground:'.length) : item.id
        const show = !tagHidden(item.id) && !tagHidden(hoverId) && (showAll || hoverId === hovered)
        return { ...item, hovered: show }
      })
      return { ...board, svg: svgRef.current, highlights: [...objectOutlines, ...destructibleOutlines], groundLoot, markers }
    }
    return startBoardScene(host, read, () => onMapReadyRef.current?.(), isCancelled)
  })

  // ---------------------------------------------------------------- input

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
    else if (target.kind === 'groundItem') onGroundItem(target.id)
    else onInteract(target.id)
    return true
  }

  const reportPlaceHover = (clientX, clientY) => {
    if (!placingItem || !onPlaceHover || !exploreState) return
    const point = toTiles(clientX, clientY)
    if (!point) {
      onPlaceHover(null)
      return
    }
    const check = canPlaceAt(exploreState, point, {
      excludeInstanceId: placingItem.from?.location === 'ground' ? placingItem.instanceId : null,
    })
    onPlaceHover({ position: check.position ?? point, valid: check.ok })
  }

  const handlePointerDown = (event) => {
    pointerTypeRef.current = event.pointerType
    if (placingItem || itemDragActive) {
      reportPlaceHover(event.clientX, event.clientY)
      return
    }
    const target = targetAt(event)
    // Ground item: left-click walks over and picks up; left-drag past BOX_MIN_DRAG lifts it as the cursor;
    // right-click opens the Pick Up / Go To ring.
    if (target?.kind === 'groundItem' && event.pointerType === 'mouse' && event.button === 2) {
      event.preventDefault()
      ;(onGroundItemMenu ?? onGroundItem)(target.id)
      return
    }
    if (target?.kind === 'groundItem' && event.button === 0) {
      event.preventDefault()
      const instanceId = target.id
      const pointerId = event.pointerId
      const originX = event.clientX
      const originY = event.clientY
      let dragging = false
      const stop = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }
      const onMove = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId || dragging) return
        if (Math.hypot(moveEvent.clientX - originX, moveEvent.clientY - originY) < BOX_MIN_DRAG) return
        dragging = true
        stop()
        onGroundItemDragStart?.(instanceId, moveEvent.clientX, moveEvent.clientY, pointerId)
      }
      const onUp = (upEvent) => {
        if (upEvent.pointerId !== pointerId) return
        stop()
        if (!dragging && upEvent.type === 'pointerup') onGroundItem(instanceId)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      return
    }
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
  // Pointer cursor over what can be clicked (a figure standing, an object in reach); the object or destructible under
  // it holds its outline steady (destructibles only outline while hovered). Hover blip matches the combat board
  // (playBoardHover) when the mouse enters a world prop.
  const handlePointerMove = (event) => {
    if (placingItem || itemDragActive) {
      reportPlaceHover(event.clientX, event.clientY)
      const svg = svgRef.current
      if (svg) delete svg.dataset.cursor
      return
    }
    const target = targetAt(event)
    const hoverable =
      target && (target.kind === 'object' || target.kind === 'destructible' || target.kind === 'groundItem') ? target.id : null
    if (event.pointerType === 'mouse' && hoverable && hoverable !== hoverRef.current) playBoardHover()
    hoverRef.current = hoverable
    const svg = svgRef.current
    if (svg) svg.dataset.cursor = boardCursor(target)
  }
  const handleMouseLeave = () => {
    hoverRef.current = null
    const svg = svgRef.current
    if (svg) delete svg.dataset.cursor
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
        onMouseLeave={handleMouseLeave}
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
        {/* Drop tile under a dragged inventory item: debug only so normal play keeps the floor clear. */}
        {debug && placingItem && placeHover && (
          <polygon
            className={`explore-place-preview${placeHover.valid ? '' : ' is-invalid'}`}
            points={pts(diamond(placeHover.position, 0, 1 / 8))}
          />
        )}
      </svg>
    </>
  )
}
