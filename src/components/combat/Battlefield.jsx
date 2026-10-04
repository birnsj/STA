import { useEffect, useRef, useState } from 'react'
import { tileKey } from '../../combat/battleMap.js'
import { getFacing, TURN_AP } from '../../combat/combatState.js'
import { diamond, isBlock, project, pts as points, TILE_H, TILE_W } from '../../maps/iso.js'
import { BlockTile, FloorTiles } from '../maps/IsoTiles.jsx'
import { DoneIcon } from './ActionPoints.jsx'
import HitPips from './HitPips.jsx'
import UnitActionRing from './UnitActionRing.jsx'
import useCamera from './useCamera.js'
import { getWeapon } from '../../combat/weaponSystem.js'
import { playFootstep, playWeaponSound } from '../../audio/uiSounds.js'

// Isometric projection of the logical grid, shared with every map view (src/maps/iso.js), drawn with the shared tile PNGs.
// The camera (useCamera) picks which 1024 x 576 window of the world is shown. The grid itself stays hidden.
const VIEW = { width: 1024, height: 576 }
// Extra world space around the map so its edges can be scrolled out from under the HUD panels.
const HUD_MARGIN = { x: 200, top: 150, bottom: 110 }

const worldBounds = (map) => ({
  minX: -(map.height * TILE_W) / 2 - HUD_MARGIN.x,
  maxX: (map.width * TILE_W) / 2 + HUD_MARGIN.x,
  minY: -TILE_H / 2 - HUD_MARGIN.top,
  maxY: ((map.width + map.height - 1) * TILE_H) / 2 + HUD_MARGIN.bottom,
})
const tileCentre = (position) => project(position)

// Presentation only: walks the last moved unit along its path one tile at a time. Combat state has already moved it.
function useMoveAnimation(lastMove, msPerTile) {
  const key = lastMove?.key ?? null
  const [step, setStep] = useState({ key, index: Infinity })
  if (step.key !== key) setStep({ key, index: 0 })
  const animating = Boolean(lastMove) && step.key === key && step.index < lastMove.path.length - 1
  useEffect(() => {
    if (!animating) return undefined
    playFootstep(step.index)
    const timer = setTimeout(() => setStep((current) => ({ ...current, index: current.index + 1 })), msPerTile)
    return () => clearTimeout(timer)
  }, [animating, step.index, msPerTile])
  if (!animating) return null
  const here = lastMove.path[step.index]
  const next = lastMove.path[step.index + 1]
  return { id: lastMove.combatantId, position: here, facing: { x: Math.sign(next.x - here.x), y: Math.sign(next.y - here.y) } }
}

// Arrow on the ground ring pointing along a grid direction, drawn in the same isometric projection as the tiles.
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

// turnStatus: { state, turn, movement } for a party member during the party's turn. Actions left (count and pips) and
// movement tiles left (plus +N Sprint tiles while Sprint is unused) show above them; once the turn is used up they are dimmed with a grey ring and a check icon.
// A shield on the portrait marks a unit in cover; it appears once a walk into cover has finished.
// Hover callbacks fire for a mouse only: a tap on a touch screen also sends hover events, which would fight the tap.
const mouseOnly = (callback) => (event) => {
  if (event.pointerType === 'mouse') callback()
}

function Unit({ combatant, position, facing, isWalking, msPerTile, isActive, isTarget, isSelected, turnStatus, onClick, onHover }) {
  const turnDone = turnStatus?.state === 'done'
  const centre = tileCentre(position)
  const down = combatant.status !== 'active'
  const sideClass = combatant.side === 'player' ? 'is-player' : 'is-enemy'
  const image = combatant.character.portrait.image
  const clipId = `unit-clip-${combatant.id.replace(/[^a-z0-9]/gi, '')}`
  return (
    <g
      className={`iso-unit ${sideClass}${isActive ? ' is-active' : ''}${isTarget ? ' is-target' : ''}${down ? ' is-down' : ''}${turnDone && !down ? ' is-turn-done' : ''}`}
      style={{ transform: `translate(${centre.x}px, ${centre.y}px)`, transitionDuration: `${msPerTile}ms` }}
      onClick={down ? undefined : onClick}
      onPointerEnter={mouseOnly(() => onHover(true))}
      onPointerLeave={mouseOnly(() => onHover(false))}
      data-ui-sound={down ? undefined : ''}
    >
      <ellipse className="iso-unit-ring" cx="0" cy="0" rx="22" ry="11" />
      {isSelected && !isActive && <ellipse className="iso-unit-selected" cx="0" cy="0" rx="25" ry="12.5" />}
      {down ? (
        <rect className="iso-unit-body" x="-16" y="-12" width="32" height="14" rx="3" />
      ) : (
        <>
          <clipPath id={clipId}>
            <rect x="-15" y="-50" width="30" height="40" rx="4" />
          </clipPath>
          <rect className="iso-unit-body" x="-17" y="-52" width="34" height="44" rx="5" />
          {image ? (
            <image href={image} x="-15" y="-50" width="30" height="40" preserveAspectRatio="xMidYMin slice" clipPath={`url(#${clipId})`} />
          ) : (
            <text className="iso-unit-initial" x="0" y="-25" textAnchor="middle">
              {combatant.character.name.charAt(0)}
            </text>
          )}
          <line className="iso-unit-stand" x1="0" y1="-8" x2="0" y2="0" />
          {facing && <FacingArrow facing={facing} />}
          {combatant.inCover && !isWalking && (
            <g className="iso-unit-cover" transform="translate(16 -48)">
              <title>In cover</title>
              <path d="M0 -7 L6 -4.5 V0.5 C6 4 3.5 6.2 0 7.5 C-3.5 6.2 -6 4 -6 0.5 V-4.5 Z" />
              <path className="iso-unit-cover-mark" d="M-2.6 0.2 L-0.6 2.2 L2.8 -1.8" />
            </g>
          )}
        </>
      )}
      {!down && (
        <g transform="translate(0 -60)">
          <HitPips hits={combatant.hits} svg />
        </g>
      )}
      {turnStatus && !down && (
        <g transform="translate(0 -72)">
          {turnDone ? (
            <DoneIcon svg className="iso-unit-done" />
          ) : (
            <g className="iso-unit-points">
              <rect className="iso-unit-points-bg" x="-34" y="-7" width={turnStatus.movement.sprintLeft ? 82 : 68} height="12" rx="3" />
              <text x="-24" y="2.5" textAnchor="middle">
                {turnStatus.turn.ap}/{TURN_AP}
              </text>
              {Array.from({ length: TURN_AP }, (_, index) => (
                <rect key={index} className={`iso-unit-point${index < turnStatus.turn.ap ? '' : ' is-used'}`} x={-14 + index * 8} y="-3.5" width="6" height="5" rx="1.5" />
              ))}
              <line className="iso-unit-points-divider" x1="3.5" y1="-5" x2="3.5" y2="3" />
              <text className={`iso-unit-move${turnStatus.movement.left ? '' : ' is-empty'}`} x="18.5" y="2.5" textAnchor="middle">
                &raquo;{turnStatus.movement.left}/{turnStatus.movement.total}
              </text>
              {turnStatus.movement.sprintLeft > 0 && (
                <text className="iso-unit-move" x="40" y="2.5" textAnchor="middle">
                  +{turnStatus.movement.sprintLeft}
                </text>
              )}
            </g>
          )}
        </g>
      )}
      {isTarget && !down && <path className="iso-unit-bracket" d="M-22 -40 v-14 h8 M22 -40 v-14 h-8 M-22 -2 v8 h8 M22 -2 v8 h-8" />}
    </g>
  )
}

const ACTION_LABELS = { move: 'Move', sprint: 'Sprint', aim: 'Aim', cancelThreat: 'Cancel Threat', momentumHit: '+1 Hit (Momentum)' }
const UNIT_HEAD = 30

function actionLabel(action) {
  if (action.type === 'attack') return getWeapon(action.weaponId).name
  if (action.type === 'reroll') return action.source === 'aim' ? 'Aim Reroll' : 'Momentum Reroll'
  if (action.type === 'move' && action.inCover) return 'Move to Cover'
  if (action.type === 'sprint' && action.inCover) return 'Sprint to Cover'
  return ACTION_LABELS[action.type] ?? null
}

function resultLabel(action, target) {
  if (!action.passed && action.type === 'resolve') return 'Miss'
  if (!action.removed) return '-1 Hit'
  return `-1 Hit: ${target.status === 'incapacitated' ? 'Incapacitated' : 'Down'}`
}

// A floating label that follows a unit (same transform transition as the unit, so it walks with it).
function FloatingLabel({ position, text, className, msPerTile }) {
  const centre = tileCentre(position)
  return (
    <g className="fx-anchor" style={{ transform: `translate(${centre.x}px, ${centre.y}px)`, transitionDuration: `${msPerTile}ms` }}>
      <text className={`fx-label ${className}`} y="-76" textAnchor="middle">
        {text}
      </text>
    </g>
  )
}

// Presentation of state.lastAction: what the acting character just did, the shot, and the result on the target.
// Keyed by the action, so each new action replays its animation once.
function ActionEffects({ state, positionOf, msPerTile, speed }) {
  const action = state.lastAction
  const attackSound = action?.type === 'attack' && action.targetId ? getWeapon(action.weaponId).attackSound : null
  // Speed is read from a ref so changing it mid-shot doesn't fire the sound a second time.
  const speedRef = useRef(speed)
  useEffect(() => {
    speedRef.current = speed
  }, [speed])
  const actionKey = action?.key
  useEffect(() => {
    if (attackSound) playWeaponSound(attackSound, speedRef.current)
  }, [actionKey, attackSound])
  if (!action) return null
  const actor = state.combatants[action.actorId]
  const target = action.targetId ? state.combatants[action.targetId] : null
  const label = actionLabel(action)
  const isShot = action.type === 'attack' && target
  const weapon = isShot ? getWeapon(action.weaponId) : null
  const beamColor = weapon && (weapon.beamColors?.[action.injuryMode] ?? weapon.beamColor)
  const from = tileCentre(positionOf(actor))
  const to = target && tileCentre(positionOf(target))
  const showsResult = (action.type === 'resolve' || action.type === 'momentumHit') && target
  return (
    <g key={action.key} className="fx" pointerEvents="none">
      {isShot && beamColor && (
        <g className="fx-beam" style={{ '--beam': beamColor }}>
          <line className="fx-beam-glow" x1={from.x} y1={from.y - UNIT_HEAD} x2={to.x} y2={to.y - UNIT_HEAD} />
          <line className="fx-beam-core" x1={from.x} y1={from.y - UNIT_HEAD} x2={to.x} y2={to.y - UNIT_HEAD} />
          <circle className="fx-impact" cx={to.x} cy={to.y - UNIT_HEAD} r="10" />
        </g>
      )}
      {isShot && !beamColor && <circle className="fx-strike" cx={to.x} cy={to.y - UNIT_HEAD} r="14" />}
      {label && <FloatingLabel position={positionOf(actor)} text={label} className="is-action" msPerTile={msPerTile} />}
      {showsResult && (
        <FloatingLabel
          position={positionOf(target)}
          text={resultLabel(action, target)}
          className={action.type === 'resolve' && !action.passed ? 'is-miss' : 'is-hit'}
          msPerTile={msPerTile}
        />
      )}
    </g>
  )
}

// The planned move drawn on the floor, tile centre to tile centre, with a marker on the destination.
function MovePathLine({ path }) {
  const centres = path.map(tileCentre)
  const end = centres[centres.length - 1]
  return (
    <g className="move-path" pointerEvents="none">
      <polyline className="move-path-line" points={centres.map(({ x, y }) => `${x},${y}`).join(' ')} />
      <ellipse className="move-path-end" cx={end.x} cy={end.y} rx="9" ry="4.5" />
    </g>
  )
}

// overlay: { reachableKeys:Set, pathKeys:Set, path:[positions], shot:{ from, to, available } }
// focus: { key, position } - the camera glides to position whenever key changes.
// ring: { unitId, buttons, info } - action buttons drawn around that unit (see UnitActionRing), or null.
export default function Battlefield({ state, activeId, targetId, selectedId, turnInfo = {}, overlay, ring = null, msPerTile, speed, focus, followCamera = true, onTileClick, onTileHover, onUnitClick, onUnitHover = () => {}, onRingHover = () => {}, onRightClick }) {
  const { map } = state
  const walking = useMoveAnimation(state.lastMove, msPerTile)
  const { camera, dragHandlers } = useCamera(worldBounds(map), VIEW, { key: focus.key, point: tileCentre(focus.position) }, followCamera, onRightClick)
  // Click events don't reliably say whether they came from a finger, so the tile remembers the last pointer that pressed it.
  const pointerTypeRef = useRef('mouse')
  const shownPosition = (unit) => (walking?.id === unit.id ? walking.position : unit.position)
  const tiles = []
  const blocks = []
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isBlock(map.tiles[y][x])) blocks.push({ x, y })
      else tiles.push({ x, y })
    }
  }
  const units = Object.values(state.combatants)
  const depthItems = [
    ...blocks.map((block) => ({ depth: block.x + block.y, key: `b${block.x},${block.y}`, render: () => <BlockTile key={`b${block.x},${block.y}`} map={map} position={block} /> })),
    ...units.map((unit) => ({
      depth: shownPosition(unit).x + shownPosition(unit).y + (unit.status === 'active' ? 0.5 : 0.1),
      key: `u${unit.id}`,
      render: () => (
        <Unit
          key={`u${unit.id}`}
          combatant={unit}
          position={shownPosition(unit)}
          isWalking={walking?.id === unit.id}
          facing={walking?.id === unit.id ? walking.facing : getFacing(state, unit)}
          msPerTile={msPerTile}
          isActive={unit.id === activeId}
          isTarget={unit.id === targetId}
          isSelected={unit.id === selectedId}
          turnStatus={turnInfo[unit.id]}
          onClick={() => onUnitClick(unit.id)}
          onHover={(entering) => onUnitHover(unit.id, entering)}
        />
      ),
    })),
  ].sort((a, b) => a.depth - b.depth)

  const shot = overlay.shot
  const shotFrom = shot && tileCentre(shot.from)
  const shotTo = shot && tileCentre(shot.to)

  return (
    <svg
      className="battlefield"
      viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
      style={{ '--fx-speed': speed }}
      {...dragHandlers}
      onMouseLeave={() => onTileHover(null)}
    >
      <FloorTiles map={map} />
      <g className="iso-floor">
        {tiles.map(({ x, y }) => {
          const key = tileKey({ x, y })
          const reachable = overlay.reachableKeys?.has(key)
          const onPath = overlay.pathKeys?.has(key)
          const isDestination = overlay.path && key === tileKey(overlay.path[overlay.path.length - 1])
          return (
            <polygon
              key={key}
              className={`iso-tile${reachable ? ' is-reachable' : ''}${onPath ? ' is-path' : ''}${isDestination ? ' is-destination' : ''}`}
              points={points(diamond({ x, y }))}
              data-ui-press={reachable ? '' : undefined}
              onPointerDown={(event) => {
                pointerTypeRef.current = event.pointerType
              }}
              onClick={() => onTileClick({ x, y }, { touch: pointerTypeRef.current === 'touch' })}
              onMouseEnter={() => onTileHover({ x, y })}
            />
          )
        })}
      </g>
      {overlay.path && <MovePathLine path={overlay.path} />}
      {depthItems.map((item) => item.render())}
      <ActionEffects state={state} positionOf={shownPosition} msPerTile={msPerTile} speed={speed} />
      {shot && (
        <line
          className={`iso-shot${shot.available ? '' : ' is-blocked'}`}
          x1={shotFrom.x}
          y1={shotFrom.y - 30}
          x2={shotTo.x}
          y2={shotTo.y - 30}
        />
      )}
      {ring && state.combatants[ring.unitId] && (
        <UnitActionRing
          position={shownPosition(state.combatants[ring.unitId])}
          buttons={ring.buttons}
          info={ring.info}
          onPointerEnter={mouseOnly(() => onRingHover(true))}
          onPointerLeave={mouseOnly(() => onRingHover(false))}
        />
      )}
    </svg>
  )
}
