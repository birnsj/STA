import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { controllerFor } from '../../actors/controllers.js'
import { tileKey } from '../../combat/battleMap.js'
import { getFacing } from '../../combat/combatState.js'
import { fadeWholeBigObjects } from '../../maps/bigObjects.js'
import { figureShapes, hitTest, labelWidth } from '../../maps/boardHitTest.js'
import { isBlock, project, unproject } from '../../maps/iso.js'
import { fadeWholePanels } from '../../maps/wallPanels.js'
import { getMaxStress } from '../../rules/personalCondition.js'
import { getSpriteMetrics, hasCharacterSprite } from '../../rules/appearance.js'
import { playBoardHover, playBoardPress } from '../../audio/uiSounds.js'
import { boardLayout } from '../maps/canvasTiles.js'
import { MapReadyContext, MapRevealedContext } from '../maps/mapReady.js'
import { RINGS, SIDE_COLOURS } from '../maps/pixi/figures.js'
import usePixiScene from '../maps/pixi/usePixiScene.js'
import WebglUnavailable from '../maps/pixi/WebglUnavailable.jsx'
import useStableSet from '../maps/useStableSet.js'
import useWallFade from '../maps/useWallFade.js'
import { actionEffectItems } from './actionEffects.js'
import { BAR_Y, LABEL_Y, mouseOnly, POINTS_Y, useMoveAnimation, VIEW, worldBounds } from './battlefieldShared.js'
import { justFled, shotOf } from './battleHelpers.js'
import useActionSounds from './useActionSounds.js'
import { startBattleScene } from './pixi/battleScene.js'
import { explosionItems, playNewExplosionSounds } from '../maps/pixi/explosionView.js'
import UnitActionRing from './UnitActionRing.jsx'
import useCamera from './useCamera.js'

// The combat board, drawn with PixiJS (WebGL). The map, the floor highlights, the combatants, the action effects
// (actionEffects.js), transporter beams and the line of fire are drawn by the Pixi scene (pixi/battleScene.js) from a
// description built here each render; the camera and the action ring stay in an SVG laid over it, whose viewBox the
// scene follows. What the pointer is over is worked out by boardHitTest.js. Presentation and input only.

const tileCentre = (position) => project(position)
const FIGURE_SCALE = getSpriteMetrics().displayScale ?? 1
const { yellow: YELLOW, red: RED, purple: PURPLE, blue: BLUE } = SIDE_COLOURS
const GREY = 0x6b7486
// The ring by side; yellow and wider for the combatant whose turn it is; grey once a turn is used up.
const ringOf = (sideKey, active, turnDone) => {
  const { fill, stroke } = RINGS[sideKey]
  if (active) return { fill, stroke: { color: YELLOW, width: 3 } }
  if (turnDone) return { fill: { color: GREY, alpha: 0.12 }, stroke: { color: GREY, width: 2 } }
  return { fill, stroke }
}
const SIDE = { player: BLUE, enemy: RED, neutral: PURPLE }
// The cursor (styles/cursors.css) for what's under the pointer (designer decision, 2026-10-14): the attack reticle
// over a standing enemy, the pointer over a party member or an object in reach, move over a tile the active
// character can reach; otherwise the stage's arrow.
const boardCursor = (target, reachable) => {
  if (target?.kind === 'unit') return target.down ? '' : target.side === 'enemy' ? 'attack' : 'pointer'
  if (target) return target.clickable ? 'pointer' : ''
  return reachable ? 'move' : ''
}

export default function PixiBattlefield(props) {
  const {
    state,
    activeId,
    targetId,
    selectedId,
    turnInfo = {},
    overlay,
    ring = null,
    msPerTile,
    speed,
    focus,
    followCamera = true,
    bystanders = [],
    snapMarks = null,
    hiddenIds = null,
    lastKnownMarks = null,
    onTileClick,
    onTileHover,
    onUnitClick,
    onUnitHover = () => {},
    onRingHover = () => {},
    onRightClick,
    objectMarks = null,
    onObjectClick = () => {},
    onStaggerDone = null,
    destructibleMarks = [],
    onDestructibleClick = () => {},
    beamIn = 'done',
    beamOut = false,
  } = props
  const { map } = state
  const walking = useMoveAnimation(state.lastMove, msPerTile)
  const { camera, dragHandlers } = useCamera(worldBounds(map), VIEW, { key: focus.key, point: tileCentre(focus.position) }, followCamera, onRightClick)
  const { ref: svgRef, onPointerDown: startCameraDrag, onContextMenu: preventMenu } = dragHandlers
  const shownPosition = (unit) => (walking?.id === unit.id ? walking.position : unit.position)
  const layout = useMemo(() => boardLayout(map), [map])
  const { panels, bigGroups } = layout
  const beamingId = justFled(state)?.id
  const units = Object.values(state.combatants).filter((unit) => (!unit.fled || unit.id === beamingId) && !hiddenIds?.includes(unit.id))
  const firing = shotOf(state, state.lastAction)
  // The combatant whose turn it is cuts walls away, and so does every standing enemy, so no wall hides one (designer
  // request, 2026-10-14). Other party members don't.
  const cutsWalls = (unit) => unit.id === activeId || (unit.side === 'enemy' && !controllerFor(unit).animationState(unit).down)
  const hidden = useWallFade(
    map,
    units.filter(cutsWalls).map((unit) => ({ id: unit.id, position: shownPosition(unit) })),
    bigGroups,
  )
  const faded = useStableSet(fadeWholeBigObjects(fadeWholePanels(hidden, panels), bigGroups))

  // ---------------------------------------------------------------- what the scene draws, and what the pointer hits

  const figures = []
  const targets = []
  const addUnit = (combatant, { position, facing, isWalking = false, isBystander = false, msPerTile: tileMs = 0, turnStatus = null, poseOptions = {}, beam = null, active = false, target = false, selected = false }) => {
    const { down } = controllerFor(combatant).animationState(combatant)
    const sideKey = combatant.side === 'player' ? 'player' : combatant.hostile === false ? 'neutral' : 'enemy'
    const turnDone = turnStatus?.state === 'done' && !down
    const { portrait } = combatant.character
    const centre = tileCentre(position)
    const depth = position.x + position.y + (combatant.condition.defeated ? 0.1 : 0.5)
    const sideColour = SIDE[sideKey]
    const statusLabel = down ? null : combatant.surrendered ? 'Surrendered' : combatant.retreating ? 'Retreating' : null
    const maxStress = getMaxStress(combatant.character).value
    const showCondition = !isBystander && combatant.condition
    const conditionY = down ? -20 : BAR_Y
    const shownTurn = turnStatus && !down ? turnStatus : null
    const cover = Boolean(combatant.inCover && !isWalking && !down)
    const guard = Boolean(combatant.guard && !down)
    figures.push({
      id: `${isBystander ? 'n' : 'u'}${combatant.id}`,
      combatant,
      centre,
      depth,
      msPerTile: tileMs,
      seed: combatant.id,
      facing,
      down,
      condition: combatant.condition,
      spriteSet: portrait?.spriteSet ?? null,
      colour: portrait?.uniform ?? null,
      imageColour: portrait?.imageUniform ?? null,
      image: portrait?.image ?? null,
      name: combatant.character.name,
      ring: ringOf(sideKey, active, turnDone),
      ringPulse: active,
      arrowColour: active ? YELLOW : turnDone ? GREY : sideColour,
      bodyColour: active ? YELLOW : sideColour,
      label: null,
      beam,
      beamSpeed: speed,
      speed: isBystander ? 1 : speed,
      preload: !isBystander,
      poseOptions,
      isWalking,
      onStaggerDone: combatant.blastReact && onStaggerDone ? () => onStaggerDone(combatant.id) : null,
      selected: selected && !active,
      cover,
      statusLabel,
      guard,
      stressTrack: showCondition ? { maxStress, stress: combatant.condition.stress, fatigued: Boolean(combatant.condition.fatigued), injuries: combatant.condition.injuries.map(({ type, treated }) => ({ type, treated: Boolean(treated) })) } : null,
      conditionY,
      turnStatus: shownTurn && (shownTurn.state === 'done' ? { state: 'done' } : { state: shownTurn.state, turn: shownTurn.turn, movement: shownTurn.movement }),
      target: target && !down,
    })
    // Not a bystander, nor one beaming in, out or away.
    if (isBystander || beam) return
    const token = !hasCharacterSprite(portrait?.spriteSet)
    const clickable = !down && !combatant.surrendered && !combatant.fled
    const unitTarget = { kind: 'unit', id: combatant.id, side: combatant.side, depth, down, clickable, sound: !down && !combatant.fled }
    const shapes = figureShapes(centre, { scale: FIGURE_SCALE, token: token && !down })
    if (down && token) shapes[1] = { type: 'rect', x: centre.x - 16, y: centre.y - 12, width: 32, height: 14 }
    if (statusLabel) shapes.push({ type: 'rect', x: centre.x - labelWidth(statusLabel, 10) / 2, y: centre.y + LABEL_Y - 10, width: labelWidth(statusLabel, 10), height: 12 })
    if (showCondition) shapes.push({ type: 'rect', x: centre.x - 15, y: centre.y + conditionY - 3.5, width: 30 + (combatant.condition.injuries.length ? 3 + combatant.condition.injuries.length * 7 : 0), height: 7 })
    if (target && !down) shapes.push({ type: 'rect', x: centre.x - 23, y: centre.y - 55, width: 46, height: 62 })
    targets.push({ ...unitTarget, shapes })
    // The badges with a tooltip, over the rest of the figure.
    if (cover) targets.push({ ...unitTarget, title: 'In cover', shapes: [{ type: 'rect', x: centre.x + 9.4, y: centre.y - 55.6, width: 13.2, height: 15.2 }] })
    if (guard) targets.push({ ...unitTarget, title: 'Guarded: attacks against them +1 Difficulty', shapes: [{ type: 'rect', x: centre.x - 23, y: centre.y - 55, width: 14, height: 14 }] })
    if (shownTurn?.state === 'done') targets.push({ ...unitTarget, shapes: [{ type: 'ellipse', cx: centre.x, cy: centre.y + POINTS_Y, rx: 7, ry: 7 }] })
    else if (shownTurn) {
      const title = `${shownTurn.turn.major} Major, ${shownTurn.turn.minor} Minor action left`
      targets.push({ ...unitTarget, title, shapes: [{ type: 'rect', x: centre.x - 34.4, y: centre.y + POINTS_Y - 7.4, width: (shownTurn.movement.sprintLeft ? 82 : 68) + 0.8, height: 12.8 }] })
    }
  }
  for (const unit of units) {
    const position = shownPosition(unit)
    const isWalking = walking?.id === unit.id
    const beam = unit.fled ? 'out' : unit.side === 'player' && beamIn === 'waiting' ? 'waiting' : unit.side === 'player' && beamIn === 'beaming' ? 'in' : beamOut && unit.side === 'player' ? 'away' : null
    addUnit(unit, {
      position,
      facing: isWalking ? walking.facing : getFacing(state, unit),
      isWalking,
      msPerTile,
      turnStatus: turnInfo[unit.id] ?? null,
      poseOptions: { lastAction: state.lastAction, hitDelayMs: firing?.targetId === unit.id ? firing.impactMs : 0, speed },
      beam,
      active: unit.id === activeId,
      target: unit.id === targetId,
      selected: unit.id === selectedId,
    })
  }
  for (const npc of bystanders) {
    const combatant = { id: npc.id, character: npc.character, side: 'enemy', hostile: npc.hostile, condition: npc.condition, inCover: false }
    addUnit(combatant, { position: npc.position, facing: npc.facing, isBystander: true })
  }
  for (const mark of objectMarks ?? []) {
    const centre = tileCentre(mark.position)
    targets.push({
      kind: 'object',
      id: mark.id,
      depth: -Infinity,
      clickable: mark.inReach,
      sound: mark.inReach,
      title: `${mark.name}: ${mark.stateLabel}${mark.inReach ? ' (click to use)' : ''}`,
      shapes: [{ type: 'diamond', cx: centre.x, cy: centre.y - 21, rx: 9.75, ry: 9.75 }],
    })
  }
  // Destructible objects open their Fire ring on the player's turn; drawn behind any figure on the same tile.
  for (const mark of destructibleMarks) {
    const centre = tileCentre(mark.position)
    targets.push({
      kind: 'destructible',
      id: mark.id,
      depth: mark.position.x + mark.position.y + 0.35,
      clickable: true,
      sound: true,
      title: mark.name,
      shapes: [{ type: 'rect', x: centre.x - 26, y: centre.y - 64, width: 52, height: 78 }],
    })
  }
  const destinationKey = overlay.path ? tileKey(overlay.path[overlay.path.length - 1]) : null
  useActionSounds(state, speed)
  const effects = actionEffectItems(state, { positionOf: shownPosition, msPerTile, speed, hiddenIds })
  if (overlay.shot) {
    const { from, to, available } = overlay.shot
    const [a, b] = [tileCentre(from), tileCentre(to)]
    effects.push({ id: 'aim', kind: 'aim', from: { x: a.x, y: a.y - 30 }, to: { x: b.x, y: b.y - 30 }, available: Boolean(available) })
  }
  for (const unit of units.filter((unit) => unit.side === 'player')) {
    if (beamIn === 'beaming') effects.push({ id: `beam-${unit.id}`, kind: 'transporter', position: tileCentre(unit.position), direction: 'in', speed })
    if (beamOut) effects.push({ id: `beam-away-${unit.id}`, kind: 'transporter', position: tileCentre(unit.position), direction: 'away', speed })
  }

  // The scene reads the latest description every frame; pointer handlers read the latest targets.
  const revealed = useContext(MapRevealedContext)
  const explosions = explosionItems(state.environment)
  const heardExplosionsRef = useRef(new Set())
  const explosionsSeededRef = useRef(false)
  const explosionKey = (state.environment?.explosions ?? []).map((blast) => blast.id).join('|')
  useEffect(() => {
    if (!explosionsSeededRef.current) {
      explosionsSeededRef.current = true
      playNewExplosionSounds(explosions, heardExplosionsRef.current, { seedOnly: true })
      return
    }
    playNewExplosionSounds(explosions, heardExplosionsRef.current)
  }, [explosionKey, explosions])
  const boardRef = useRef(null)
  const targetsRef = useRef(targets)
  const hoverKeyRef = useRef(null)
  const handlersRef = useRef(props)
  useLayoutEffect(() => {
    boardRef.current = {
      layout,
      faded,
      units: figures,
      tiles: { reachableKeys: overlay.reachableKeys, pathKeys: overlay.pathKeys, destinationKey },
      path: overlay.path ?? null,
      snapMarks,
      lastKnown: lastKnownMarks ?? [],
      objects: objectMarks ?? [],
      effects,
      explosions,
      environment: state.environment,
      revealed,
    }
    targetsRef.current = targets
    handlersRef.current = { onTileClick, onTileHover, onUnitClick, onUnitHover, onObjectClick, onDestructibleClick, map, reachableKeys: overlay.reachableKeys }
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
      board.svg = svgRef.current
      board.hoverKey = hoverKeyRef.current
      return board
    }
    return startBattleScene(host, read, () => onMapReadyRef.current?.(), isCancelled)
  })

  // ---------------------------------------------------------------- input (units, objects and floor)

  // Click events don't reliably say whether they came from a finger, so the board remembers the last pointer pressed.
  const pointerTypeRef = useRef('mouse')
  const hoverTileRef = useRef(null)
  const hoverUnitRef = useRef(null)
  const [title, setTitle] = useState(null)

  const toBoard = (event) => {
    const matrix = svgRef.current?.getScreenCTM()
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null
  }
  // The unit or object under the pointer; null over the floor, or over the overlay's own controls (the action ring).
  const targetAt = (event) => {
    if (event.target !== svgRef.current) return null
    const point = toBoard(event)
    return point ? hitTest(point, targetsRef.current) : null
  }
  // The floor tile under the pointer (blocks never take clicks), or null.
  const floorAt = (event) => {
    const point = toBoard(event)
    if (!point) return null
    const tiles = unproject(point)
    const position = { x: Math.round(tiles.x), y: Math.round(tiles.y) }
    const { map: current } = handlersRef.current
    const inside = position.x >= 0 && position.y >= 0 && position.x < current.width && position.y < current.height
    return inside && !isBlock(current.tiles[position.y][position.x]) ? position : null
  }
  const setHoveredUnit = (id, sound) => {
    if (hoverUnitRef.current === id) return
    if (hoverUnitRef.current !== null) handlersRef.current.onUnitHover(hoverUnitRef.current, false)
    hoverUnitRef.current = id
    if (id === null) return
    handlersRef.current.onUnitHover(id, true)
    if (sound) playBoardHover()
  }

  const handlePointerDown = (event) => {
    pointerTypeRef.current = event.pointerType
    const target = targetAt(event)
    const tile = !target && event.target === svgRef.current ? floorAt(event) : null
    const pressable = target ? target.sound : tile && handlersRef.current.reachableKeys?.has(tileKey(tile))
    if (event.button === 0 && pressable) playBoardPress()
    startCameraDrag(event)
  }
  const handleClick = (event) => {
    if (event.target !== svgRef.current) return
    const target = targetAt(event)
    if (target) {
      if (!target.clickable) return
      if (target.kind === 'unit') handlersRef.current.onUnitClick(target.id)
      else if (target.kind === 'destructible') handlersRef.current.onDestructibleClick(target.id)
      else handlersRef.current.onObjectClick(target.id)
      return
    }
    const position = floorAt(event)
    if (position) handlersRef.current.onTileClick(position, { touch: pointerTypeRef.current === 'touch' })
  }
  const handlePointerMove = (event) => {
    const overSvg = event.target === svgRef.current
    const target = targetAt(event)
    if (event.pointerType === 'mouse') setHoveredUnit(target?.kind === 'unit' ? target.id : null, target?.sound)
    setTitle(target?.title ?? null)
    const tile = overSvg && !target ? floorAt(event) : null
    const key = tile && tileKey(tile)
    const reachable = Boolean(key && handlersRef.current.reachableKeys?.has(key))
    hoverKeyRef.current = event.pointerType === 'mouse' && reachable ? key : null
    if (tile && (!hoverTileRef.current || tileKey(hoverTileRef.current) !== key)) {
      hoverTileRef.current = tile
      handlersRef.current.onTileHover(tile)
    }
    const svg = svgRef.current
    if (svg) svg.dataset.cursor = boardCursor(target, reachable)
  }
  const handleMouseLeave = () => {
    setHoveredUnit(null)
    setTitle(null)
    hoverKeyRef.current = null
    hoverTileRef.current = null
    onTileHover(null)
  }

  if (failed) return <WebglUnavailable />
  return (
    <>
      <div className="pixi-board-host" ref={hostRef} />
      <svg
        className="battlefield"
        viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
        style={{ '--fx-speed': speed }}
        ref={svgRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        onContextMenu={preventMenu}
        onMouseLeave={handleMouseLeave}
        data-tip={title ?? undefined}
        data-tip-at="pointer"
      >
        {ring && (ring.position || state.combatants[ring.unitId]) && (
          <UnitActionRing
            position={ring.position ?? shownPosition(state.combatants[ring.unitId])}
            buttons={ring.buttons}
            info={ring.info}
            placement="top"
            prominent
            onPointerEnter={mouseOnly(() => onRingHover(true))}
            onPointerLeave={mouseOnly(() => onRingHover(false))}
          />
        )}
      </svg>
    </>
  )
}
