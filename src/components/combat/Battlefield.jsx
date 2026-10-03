import { useEffect, useState } from 'react'
import { tileKey } from '../../combat/battleMap.js'
import { DoneIcon } from './ActionPoints.jsx'
import HitPips from './HitPips.jsx'
import useCamera from './useCamera.js'
import { getWeapon } from '../../combat/weaponSystem.js'

// Isometric projection of the logical grid, in world pixels with tile (0,0)'s top corner at the origin.
// The camera (useCamera) picks which 1024 x 576 window of the world is shown. The grid itself stays hidden.
const TILE_W = 56
const TILE_H = 28
const VIEW = { width: 1024, height: 576 }
// Extra world space around the map so its edges can be scrolled out from under the HUD panels.
const HUD_MARGIN = { x: 200, top: 150, bottom: 110 }

const project = (x, y) => ({ x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 })

const worldBounds = (map) => ({
  minX: -(map.height * TILE_W) / 2 - HUD_MARGIN.x,
  maxX: (map.width * TILE_W) / 2 + HUD_MARGIN.x,
  minY: -HUD_MARGIN.top,
  maxY: ((map.width + map.height) * TILE_H) / 2 + HUD_MARGIN.bottom,
})
const tileCentre = ({ x, y }) => {
  const top = project(x, y)
  return { x: top.x, y: top.y + TILE_H / 2 }
}

function diamond(x, y, lift = 0) {
  const p = project(x, y)
  return [
    [p.x, p.y - lift],
    [p.x + TILE_W / 2, p.y + TILE_H / 2 - lift],
    [p.x, p.y + TILE_H - lift],
    [p.x - TILE_W / 2, p.y + TILE_H / 2 - lift],
  ]
}

const points = (list) => list.map(([x, y]) => `${x},${y}`).join(' ')

function shrink(corners, factor) {
  const cx = corners.reduce((sum, [x]) => sum + x, 0) / corners.length
  const cy = corners.reduce((sum, [, y]) => sum + y, 0) / corners.length
  return corners.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor])
}

// Front hull walls stay low and room walls fairly low so figures behind them remain visible.
function wallHeight(map, x, y) {
  const isFrontEdge = y === map.height - 1 || x === map.width - 1
  const isBackEdge = y === 0 || x === 0
  if (isFrontEdge) return 6
  return isBackEdge ? 46 : 24
}

function Block({ x, y, height, kind }) {
  const [top, right, bottom, left] = diamond(x, y)
  const lift = (point) => [point[0], point[1] - height]
  return (
    <g className={`iso-block iso-block-${kind}`}>
      <polygon className="iso-face-left" points={points([left, bottom, lift(bottom), lift(left)])} />
      <polygon className="iso-face-right" points={points([bottom, right, lift(right), lift(bottom)])} />
      <polygon className="iso-face-top" points={points([top, right, bottom, left].map(lift))} />
      {kind === 'cover' && <polygon className="iso-cover-light" points={points(shrink(diamond(x, y, height), 0.45))} />}
    </g>
  )
}

// Presentation only: walks the last moved unit along its path one tile at a time. Combat state has already moved it.
function useMoveAnimation(lastMove, msPerTile) {
  const key = lastMove?.key ?? null
  const [step, setStep] = useState({ key, index: Infinity })
  if (step.key !== key) setStep({ key, index: 0 })
  const animating = Boolean(lastMove) && step.key === key && step.index < lastMove.path.length - 1
  useEffect(() => {
    if (!animating) return undefined
    const timer = setTimeout(() => setStep((current) => ({ ...current, index: current.index + 1 })), msPerTile)
    return () => clearTimeout(timer)
  }, [animating, step.index, msPerTile])
  return animating ? { id: lastMove.combatantId, position: lastMove.path[step.index] } : null
}

// turnStatus: { state, turn } for a party member during the party's turn. Their unused action points show as pips
// above them; once the turn is used up they are dimmed with a grey ring and a check icon.
function Unit({ combatant, position, msPerTile, isActive, isTarget, isSelected, turnStatus, onClick }) {
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
              <rect className={turnStatus.turn.minorUsed ? 'is-used' : ''} x="-9" y="-3" width="8" height="5" rx="1.5" />
              <rect className={turnStatus.turn.majorUsed ? 'is-used' : ''} x="1" y="-3" width="8" height="5" rx="1.5" />
            </g>
          )}
        </g>
      )}
      {isTarget && !down && <path className="iso-unit-bracket" d="M-22 -40 v-14 h8 M22 -40 v-14 h-8 M-22 -2 v8 h8 M22 -2 v8 h-8" />}
    </g>
  )
}

const ACTION_LABELS = { move: 'Move', aim: 'Aim', takeCover: 'Take Cover', cancelThreat: 'Cancel Threat', momentumHit: '+1 Hit (Momentum)' }
const UNIT_HEAD = 30

function actionLabel(action) {
  if (action.type === 'attack') return getWeapon(action.weaponId).name
  if (action.type === 'reroll') return action.source === 'aim' ? 'Aim Reroll' : 'Momentum Reroll'
  return ACTION_LABELS[action.type] ?? null
}

function resultLabel(action, target) {
  if (!action.passed && action.type === 'resolve') return 'Miss'
  if (!action.removed) return 'Hit'
  return target.status === 'incapacitated' ? 'Incapacitated' : 'Down'
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
function ActionEffects({ state, positionOf, msPerTile }) {
  const action = state.lastAction
  if (!action) return null
  const actor = state.combatants[action.actorId]
  const target = action.targetId ? state.combatants[action.targetId] : null
  const label = actionLabel(action)
  const isShot = action.type === 'attack' && target
  const weapon = isShot ? getWeapon(action.weaponId) : null
  const from = tileCentre(positionOf(actor))
  const to = target && tileCentre(positionOf(target))
  const showsResult = (action.type === 'resolve' || action.type === 'momentumHit') && target
  return (
    <g key={action.key} className="fx" pointerEvents="none">
      {isShot && weapon.beamColor && (
        <g className="fx-beam" style={{ '--beam': weapon.beamColor }}>
          <line className="fx-beam-glow" x1={from.x} y1={from.y - UNIT_HEAD} x2={to.x} y2={to.y - UNIT_HEAD} />
          <line className="fx-beam-core" x1={from.x} y1={from.y - UNIT_HEAD} x2={to.x} y2={to.y - UNIT_HEAD} />
          <circle className="fx-impact" cx={to.x} cy={to.y - UNIT_HEAD} r="10" />
        </g>
      )}
      {isShot && !weapon.beamColor && <circle className="fx-strike" cx={to.x} cy={to.y - UNIT_HEAD} r="14" />}
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
export default function Battlefield({ state, activeId, targetId, selectedId, turnInfo = {}, overlay, msPerTile, speed, focus, onTileClick, onTileHover, onUnitClick }) {
  const { map } = state
  const walking = useMoveAnimation(state.lastMove, msPerTile)
  const { camera, dragHandlers } = useCamera(worldBounds(map), VIEW, { key: focus.key, point: tileCentre(focus.position) })
  const shownPosition = (unit) => (walking?.id === unit.id ? walking.position : unit.position)
  const tiles = []
  const blocks = []
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const type = map.tiles[y][x]
      if (type === 'floor') tiles.push({ x, y })
      else blocks.push({ x, y, type })
    }
  }
  const units = Object.values(state.combatants)
  const depthItems = [
    ...blocks.map((block) => ({ depth: block.x + block.y, key: `b${block.x},${block.y}`, render: () => <Block key={`b${block.x},${block.y}`} x={block.x} y={block.y} kind={block.type} height={block.type === 'wall' ? wallHeight(map, block.x, block.y) : 18} /> })),
    ...units.map((unit) => ({
      depth: shownPosition(unit).x + shownPosition(unit).y + (unit.status === 'active' ? 0.5 : 0.1),
      key: `u${unit.id}`,
      render: () => (
        <Unit
          key={`u${unit.id}`}
          combatant={unit}
          position={shownPosition(unit)}
          msPerTile={msPerTile}
          isActive={unit.id === activeId}
          isTarget={unit.id === targetId}
          isSelected={unit.id === selectedId}
          turnStatus={turnInfo[unit.id]}
          onClick={() => onUnitClick(unit.id)}
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
      viewBox={`${camera.x} ${camera.y} ${VIEW.width} ${VIEW.height}`}
      style={{ '--fx-speed': speed }}
      {...dragHandlers}
      onMouseLeave={() => onTileHover(null)}
    >
      <g className="iso-floor">
        {tiles.map(({ x, y }) => {
          const key = tileKey({ x, y })
          const reachable = overlay.reachableKeys?.has(key)
          const onPath = overlay.pathKeys?.has(key)
          const isDestination = overlay.path && key === tileKey(overlay.path[overlay.path.length - 1])
          return (
            <polygon
              key={key}
              className={`iso-tile${(x + y) % 2 ? ' is-alt' : ''}${reachable ? ' is-reachable' : ''}${onPath ? ' is-path' : ''}${isDestination ? ' is-destination' : ''}`}
              points={points(diamond(x, y))}
              onClick={() => onTileClick({ x, y })}
              onMouseEnter={() => onTileHover({ x, y })}
            />
          )
        })}
      </g>
      {overlay.path && <MovePathLine path={overlay.path} />}
      {depthItems.map((item) => item.render())}
      <ActionEffects state={state} positionOf={shownPosition} msPerTile={msPerTile} />
      {shot && (
        <line
          className={`iso-shot${shot.available ? '' : ' is-blocked'}`}
          x1={shotFrom.x}
          y1={shotFrom.y - 30}
          x2={shotTo.x}
          y2={shotTo.y - 30}
        />
      )}
    </svg>
  )
}
