import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { tileKey } from '../../combat/battleMap.js'
import { getFacing } from '../../combat/combatState.js'
import { diamond, isBlock, project, pts as points, TILE_H, TILE_W, unproject } from '../../maps/iso.js'
import { fadedBlockKeys, TALL_WALL_EXTRA } from '../../maps/wallFade.js'
import { fadeWholePanels } from '../../maps/wallPanels.js'
import { fadeWholeBigObjects } from '../../maps/bigObjects.js'
import { boardLayout } from '../maps/canvasTiles.js'
import MapCanvas from '../maps/MapCanvas.jsx'
import { around } from '../maps/occlusion.js'
import useFigureWindows from '../maps/useFigureWindows.jsx'
import useStableSet from '../maps/useStableSet.js'
import { useUniformImage } from '../useUniformImage.js'
import CharacterSprite from '../maps/CharacterSprite.jsx'
import { hasCharacterSprite } from '../../rules/appearance.js'
import { DoneIcon } from './ActionPoints.jsx'
import ConditionTrack from './ConditionTrack.jsx'
import { injuryTypeName, minorDefeatText } from '../../rules/personalCondition.js'
import LastKnownMarker from './LastKnownMarker.jsx'
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
  minY: -TILE_H / 2 - TALL_WALL_EXTRA - HUD_MARGIN.top,
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

// Two tile-key sets (either of which may be absent) holding the same keys.
const sameKeys = (a, b) => a === b || (a?.size === b?.size && [...(a ?? [])].every((key) => b.has(key)))

// The floor the player clicks: one outline of the whole map, which works out the floor tile under the pointer (blocks
// never take clicks), and a polygon for each highlighted tile (in reach, on the path, the destination). The highlight
// only changes with the move overlay, so the layer is memoised on it and reads the handlers through a ref (the screen
// above hands down a new onTileClick every render). hoverRef: the floor tile last hovered, shared by both.
const FloorGrid = memo(
  function FloorGrid({ map, reachableKeys, pathKeys, destinationKey, handlersRef, pointerTypeRef, hoverRef }) {
    const highlighted = new Set([...(reachableKeys ?? []), ...(pathKeys ?? []), ...(destinationKey ? [destinationKey] : [])])
    const floorAt = (event) => {
      const svg = event.currentTarget.ownerSVGElement
      const point = unproject(new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse()))
      const position = { x: Math.round(point.x), y: Math.round(point.y) }
      const inside = position.x >= 0 && position.y >= 0 && position.x < map.width && position.y < map.height
      return inside && !isBlock(map.tiles[position.y][position.x]) ? position : null
    }
    const press = (event) => {
      pointerTypeRef.current = event.pointerType
    }
    const click = (position) => handlersRef.current.onTileClick(position, { touch: pointerTypeRef.current === 'touch' })
    const hover = (position) => {
      if (hoverRef.current && tileKey(hoverRef.current) === tileKey(position)) return
      hoverRef.current = position
      handlersRef.current.onTileHover(position)
    }
    const [right, bottom] = [map.width - 0.5, map.height - 0.5]
    const outline = [
      [-0.5, -0.5],
      [right, -0.5],
      [right, bottom],
      [-0.5, bottom],
    ].map(([x, y]) => {
      const corner = project({ x, y })
      return [corner.x, corner.y]
    })
    return (
      <g className="iso-floor">
        <polygon
          className="iso-tile"
          points={points(outline)}
          onPointerDown={press}
          onClick={(event) => {
            const position = floorAt(event)
            if (position) click(position)
          }}
          onPointerMove={(event) => {
            const position = floorAt(event)
            if (position) hover(position)
          }}
        />
        {[...highlighted].map((key) => {
          const [x, y] = key.split(',').map(Number)
          const reachable = reachableKeys?.has(key)
          return (
            <polygon
              key={key}
              className={`iso-tile${reachable ? ' is-reachable' : ''}${pathKeys?.has(key) ? ' is-path' : ''}${key === destinationKey ? ' is-destination' : ''}`}
              points={points(diamond({ x, y }))}
              data-ui-press={reachable ? '' : undefined}
              onPointerDown={press}
              onClick={() => click({ x, y })}
              onMouseEnter={() => hover({ x, y })}
            />
          )
        })}
      </g>
    )
  },
  (before, after) =>
    before.map === after.map &&
    before.destinationKey === after.destinationKey &&
    sameKeys(before.reachableKeys, after.reachableKeys) &&
    sameKeys(before.pathKeys, after.pathKeys),
)

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

// The portrait on a stand, for a character with no full-body sprite set (characterSprites.json).
function UnitToken({ image, shownImage, clipId, name }) {
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
    </>
  )
}

// isBystander: an NPC in the world that is not in the fight; drawn where it stands, never interactive.
function Unit({ combatant, position, facing, isWalking, msPerTile, isActive, isTarget, isSelected, turnStatus, isBystander = false, onClick, onHover }) {
  const turnDone = turnStatus?.state === 'done'
  const centre = tileCentre(position)
  const down = Boolean(combatant.condition?.defeated)
  const sideClass = combatant.side === 'player' ? 'is-player' : 'is-enemy'
  const image = combatant.character.portrait?.image
  const spriteSet = combatant.character.portrait?.spriteSet
  const hasSprite = hasCharacterSprite(spriteSet)
  const shownImage = useUniformImage(hasSprite ? null : image, combatant.character.portrait?.uniform)
  const clipId = `unit-clip-${combatant.id.replace(/[^a-z0-9]/gi, '')}`
  return (
    <g
      className={`iso-unit ${sideClass}${isActive ? ' is-active' : ''}${isTarget ? ' is-target' : ''}${down ? ' is-down' : ''}${turnDone && !down ? ' is-turn-done' : ''}${isBystander ? ' is-bystander' : ''}`}
      style={{ transform: `translate(${centre.x}px, ${centre.y}px)`, transitionDuration: `${msPerTile}ms` }}
      onClick={down || isBystander ? undefined : onClick}
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
          {hasSprite ? (
            <CharacterSprite setId={spriteSet} colour={combatant.character.portrait.uniform} facing={facing} walking={isWalking} seed={combatant.id} />
          ) : (
            <UnitToken image={image} shownImage={shownImage} clipId={clipId} name={combatant.character.name} />
          )}
          {facing && <FacingArrow facing={facing} />}
          {combatant.inCover && !isWalking && (
            <g className="iso-unit-cover" transform="translate(16 -48)">
              <title>In cover</title>
              <path d="M0 -7 L6 -4.5 V0.5 C6 4 3.5 6.2 0 7.5 C-3.5 6.2 -6 4 -6 0.5 V-4.5 Z" />
              <path className="iso-unit-cover-mark" d="M-2.6 0.2 L-0.6 2.2 L2.8 -1.8" />
            </g>
          )}
          {combatant.guard && (
            <g className="iso-unit-guard" transform="translate(-16 -48)">
              <title>Guarded: attacks against them +1 Difficulty</title>
              <rect x="-6.5" y="-6.5" width="13" height="13" rx="2" />
              <text x="0" y="3.5" textAnchor="middle">
                G
              </text>
            </g>
          )}
        </>
      )}
      {!isBystander && combatant.condition && (
        <g transform={down ? 'translate(0 -20)' : 'translate(0 -60)'}>
          <ConditionTrack character={combatant.character} condition={combatant.condition} svg />
        </g>
      )}
      {turnStatus && !down && (
        <g transform="translate(0 -72)">
          {turnDone ? (
            <DoneIcon svg className="iso-unit-done" />
          ) : (
            <g className="iso-unit-points">
              <rect className="iso-unit-points-bg" x="-34" y="-7" width={turnStatus.movement.sprintLeft ? 82 : 68} height="12" rx="3" />
              <title>{`${turnStatus.turn.major} Major, ${turnStatus.turn.minor} Minor action left`}</title>
              <text x="-28" y="2.5" textAnchor="middle">
                M
              </text>
              <rect className={`iso-unit-point${turnStatus.turn.major > 0 ? '' : ' is-used'}`} x="-23" y="-3.5" width="6" height="5" rx="1.5" />
              <text x="-11" y="2.5" textAnchor="middle">
                m
              </text>
              <rect className={`iso-unit-point${turnStatus.turn.minor > 0 ? '' : ' is-used'}`} x="-6" y="-3.5" width="6" height="5" rx="1.5" />
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

const ACTION_LABELS = { move: 'Move', sprint: 'Sprint', aim: 'Aim', direct: 'Direct', cancelThreat: 'Cancel Threat', extraMinor: 'Extra Minor', secondMajor: 'Second Major', counterattack: 'Counterattack' }
const TASK_LABELS = { guard: ['Guard', 'Guard failed'], firstAid: ['First Aid', 'First Aid failed'], interact: ['Task', 'Task failed'] }
const UNIT_HEAD = 30

function actionLabel(action) {
  if (action.type === 'attack') return getWeapon(action.weaponId).name
  if (action.type === 'reroll') return { aim: 'Aim Reroll', assist: 'Student of War Reroll' }[action.source] ?? 'Momentum Reroll'
  if (action.type === 'move' && action.inCover) return 'Move to Cover'
  if (action.type === 'sprint' && action.inCover) return 'Sprint to Cover'
  if (TASK_LABELS[action.type]) return action.passed === false ? TASK_LABELS[action.type][1] : TASK_LABELS[action.type][0]
  return ACTION_LABELS[action.type] ?? null
}

// What a hit did to the target: an Injury waiting for Avoid Injury, avoided (Stress taken), or Defeated (a Minor NPC:
// Unconscious or Dead, target condition).
function resultLabel(action, target) {
  if (action.type === 'resolve' && !action.passed) return 'Miss'
  const defeated = minorDefeatText(target?.condition) ?? 'Defeated'
  if (action.type === 'injury') return action.avoided ? 'Injury avoided' : defeated
  const injury = action.injury ? `${injuryTypeName(action.injury.type)} ${action.injury.severity}` : 'Hit'
  if (action.awaiting) return `${injury}: Avoid?`
  if (action.removed) return `${injury}: ${defeated}`
  return `${injury}: avoided`
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
function ActionEffects({ state, positionOf, msPerTile, speed, hiddenIds }) {
  const action = state.lastAction
  const shotTypes = ['attack', 'counterattack']
  const attackSound = shotTypes.includes(action?.type) && action.targetId ? getWeapon(action.weaponId).attackSound : null
  // Speed is read from a ref so changing it mid-shot doesn't fire the sound a second time.
  const speedRef = useRef(speed)
  useEffect(() => {
    speedRef.current = speed
  }, [speed])
  const actionKey = action?.key
  useEffect(() => {
    if (attackSound) playWeaponSound(attackSound, speedRef.current)
  }, [actionKey, attackSound])
  if (!action || hiddenIds?.includes(action.actorId)) return null
  const actor = state.combatants[action.actorId]
  const target = action.targetId ? state.combatants[action.targetId] : null
  const label = actionLabel(action)
  const isShot = shotTypes.includes(action.type) && target
  const weapon = isShot ? getWeapon(action.weaponId) : null
  const beamColor = weapon && (weapon.beamColors?.[action.injuryMode] ?? weapon.beamColor)
  const from = tileCentre(positionOf(actor))
  const to = target && tileCentre(positionOf(target))
  const showsResult = ['resolve', 'injury', 'counterattack'].includes(action.type) && target
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

// A challenge object on the battlefield (combat in the world): its name and state; clickable when the acting character
// can reach it. mark: { id, name, position, stateLabel, inReach }.
function ObjectMarker({ mark, onClick }) {
  const centre = tileCentre(mark.position)
  return (
    <g
      className={`combat-object${mark.inReach ? ' is-in-reach' : ''}`}
      transform={`translate(${centre.x} ${centre.y})`}
      onClick={mark.inReach ? onClick : undefined}
      data-ui-sound={mark.inReach ? '' : undefined}
    >
      <title>{`${mark.name}: ${mark.stateLabel}${mark.inReach ? ' (click to use)' : ''}`}</title>
      <polygon points="0,-30 9,-21 0,-12 -9,-21" />
      <text y="-34" textAnchor="middle">
        {mark.name}
      </text>
    </g>
  )
}

// overlay: { reachableKeys:Set, pathKeys:Set, path:[positions], shot:{ from, to, available } }
// focus: { key, position } - the camera glides to position whenever key changes.
// ring: { unitId, buttons, info } - action buttons drawn around that unit (see UnitActionRing), or null.
// bystanders: [{ id, character, position, facing, status }] - NPCs outside the fight (combat started in the world).
// snapMarks: [{ id, from, cell }] - debug: each fighter's world position and the cell it was snapped to.
// hiddenIds: combatants the party can't perceive now (not drawn). lastKnownMarks: [{ id, position, label }].
export default function Battlefield({
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
}) {
  const { map } = state
  const walking = useMoveAnimation(state.lastMove, msPerTile)
  const { camera, dragHandlers } = useCamera(worldBounds(map), VIEW, { key: focus.key, point: tileCentre(focus.position) }, followCamera, onRightClick)
  // Click events don't reliably say whether they came from a finger, so the tile remembers the last pointer that pressed it.
  const pointerTypeRef = useRef('mouse')
  // Read when a tile is actually clicked or hovered, so the memoised floor never holds an old render's handler.
  const tileHandlers = useRef({ onTileClick, onTileHover })
  useLayoutEffect(() => {
    tileHandlers.current = { onTileClick, onTileHover }
  })
  const hoverRef = useRef(null)
  const shownPosition = (unit) => (walking?.id === unit.id ? walking.position : unit.position)
  const layout = useMemo(() => boardLayout(map), [map])
  const { panels, bigGroups } = layout
  const units = Object.values(state.combatants).filter((unit) => !hiddenIds?.includes(unit.id))
  const hidden = fadedBlockKeys(map, units.filter((unit) => unit.side === 'player').map(shownPosition), bigGroups)
  const faded = useStableSet(fadeWholeBigObjects(fadeWholePanels(hidden, panels), bigGroups))
  // A unit with its badges above it, and the tile it is stepping from while it walks (a tile's step on screen).
  const unitBox = (position) => around(position, 44 + TILE_W / 2, 86 + TILE_H / 2, 52 + TILE_W / 2, 20 + TILE_H / 2)
  const figures = [
    ...units.map((unit) => ({
      depth: shownPosition(unit).x + shownPosition(unit).y + (unit.condition.defeated ? 0.1 : 0.5),
      box: unitBox(shownPosition(unit)),
      element: (
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
    ...bystanders.map((npc) => ({
      depth: npc.position.x + npc.position.y + (npc.condition.defeated ? 0.1 : 0.5),
      box: unitBox(npc.position),
      element: (
        <Unit
          key={`n${npc.id}`}
          combatant={{ id: npc.id, character: npc.character, side: 'enemy', condition: npc.condition, inCover: false }}
          position={npc.position}
          facing={npc.facing}
          msPerTile={0}
          isBystander
          onHover={() => {}}
        />
      ),
    })),
  ]
  const { holes, windows } = useFigureWindows(layout, faded, figures)
  // On the floor, under every block.
  const ground = (
    <>
      <FloorGrid
        map={map}
        reachableKeys={overlay.reachableKeys}
        pathKeys={overlay.pathKeys}
        destinationKey={overlay.path ? tileKey(overlay.path[overlay.path.length - 1]) : null}
        handlersRef={tileHandlers}
        pointerTypeRef={pointerTypeRef}
        hoverRef={hoverRef}
      />
      {overlay.path && <MovePathLine path={overlay.path} />}
      {snapMarks && (
        <g className="snap-marks" pointerEvents="none">
          {snapMarks.map((mark) => {
            const from = tileCentre(mark.from)
            const to = tileCentre(mark.cell)
            return (
              <g key={mark.id}>
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
                <circle cx={from.x} cy={from.y} r="4" />
              </g>
            )
          })}
        </g>
      )}
      {lastKnownMarks?.map((mark) => <LastKnownMarker key={mark.id} position={mark.position} label={mark.label} />)}
      {objectMarks?.map((mark) => (
        <ObjectMarker key={mark.id} mark={mark} onClick={() => onObjectClick(mark.id)} />
      ))}
    </>
  )

  const shot = overlay.shot
  const shotFrom = shot && tileCentre(shot.from)
  const shotTo = shot && tileCentre(shot.to)

  return (
    <svg
      className="battlefield"
      viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
      style={{ '--fx-speed': speed }}
      {...dragHandlers}
      onMouseLeave={() => {
        hoverRef.current = null
        onTileHover(null)
      }}
    >
      <MapCanvas layout={layout} faded={faded} holes={holes} ground={ground}>
        {windows}
      </MapCanvas>
      <ActionEffects state={state} positionOf={shownPosition} msPerTile={msPerTile} speed={speed} hiddenIds={hiddenIds} />
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
