import { useEffect, useRef, useState } from 'react'
import { playFootstep, playWeaponSound } from '../../audio/uiSounds.js'
import { tileKey } from '../../combat2/map2.js'
import useCamera from '../combat/useCamera.js'
import { STEP_MS } from './timing2.js'

// Combat Type 2 board: its own isometric renderer (64x64 world tiles drawn as 64x32 diamonds) with tactical overlays.
// Presentation only: reads the combat state and an overlay description, never changes either.
const TILE_W = 64
const TILE_H = 32
// World area shown at zoom 1: a bit larger than the 1024x576 stage so the whole section fits between the HUD panels.
const VIEW = { width: 1360, height: 765 }
const HEIGHTS = { bulkhead: 46, machinery: 40, crate: 16, epsControl: 22 }
const UNIT_HEAD = 58

const project = ({ x, y }) => ({ x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 })
const pts = (list) => list.map(([x, y]) => `${x},${y}`).join(' ')

function diamond(position, lift = 0, scale = 1) {
  const c = project(position)
  const w = (TILE_W / 2) * scale
  const h = (TILE_H / 2) * scale
  return [[c.x, c.y - h - lift], [c.x + w, c.y - lift], [c.x, c.y + h - lift], [c.x - w, c.y - lift]]
}

const MARGIN = 320
const worldBounds = (map) => ({
  minX: -(map.height * TILE_W) / 2 - MARGIN,
  maxX: (map.width * TILE_W) / 2 + MARGIN,
  minY: -TILE_H - MARGIN,
  maxY: ((map.width + map.height) * TILE_H) / 2 + MARGIN,
})
// Where the camera starts relative to the map centre, so the map sits in the space the HUD panels leave free.
const START_OFFSET = { x: 260, y: 10 }

// Front bulkheads (bottom row, right column) stay low and interior ones half height, so walls never hide the room.
function blockHeight(map, { x, y }, type) {
  if (type !== 'bulkhead') return HEIGHTS[type]
  if (y === map.height - 1 || x === map.width - 1) return 10
  if (y === 0 || x === 0) return HEIGHTS.bulkhead
  return 24
}

function Block({ position, type, height }) {
  const [top, right, bottom, left] = diamond(position)
  const lift = ([x, y]) => [x, y - height]
  return (
    <g className={`c2-block c2-block-${type}`}>
      <polygon className="c2-face-left" points={pts([left, bottom, lift(bottom), lift(left)])} />
      <polygon className="c2-face-right" points={pts([bottom, right, lift(right), lift(bottom)])} />
      <polygon className="c2-face-top" points={pts([top, right, bottom, left].map(lift))} />
      {type === 'machinery' && <polygon className="c2-block-detail" points={pts(diamond(position, height, 0.5))} />}
      {type === 'crate' && <polygon className="c2-block-detail" points={pts(diamond(position, height, 0.62))} />}
      {type === 'epsControl' && <polygon className="c2-block-eps" points={pts(diamond(position, height, 0.55))} />}
    </g>
  )
}

// Walks the last moved unit along its path one tile at a time (combat state has already moved it).
function useMoveAnimation(events) {
  const lastMove = [...events].reverse().find((event) => event.type === 'move') ?? null
  const key = lastMove?.id ?? null
  const [mountedKey] = useState(key)
  const [step, setStep] = useState({ key, index: Infinity })
  if (step.key !== key) setStep({ key, index: key === mountedKey ? Infinity : 0 })
  const animating = Boolean(lastMove) && step.key === key && step.index < lastMove.path.length - 1
  useEffect(() => {
    if (!animating) return undefined
    playFootstep(step.index)
    const timer = setTimeout(() => setStep((current) => ({ ...current, index: current.index + 1 })), STEP_MS)
    return () => clearTimeout(timer)
  }, [animating, step.index])
  return animating ? { id: lastMove.actorId, position: lastMove.path[step.index] } : null
}

function HitPips({ hits, max, y }) {
  return (
    <g className="c2-unit-hits" transform={`translate(0 ${y})`}>
      <rect className="c2-unit-hits-bg" x={-max * 6 - 3} y="-5" width={max * 12 + 6} height="10" rx="2" />
      {Array.from({ length: max }, (_, i) => (
        <rect key={i} className={`c2-unit-hit${i < hits ? ' is-marked' : ''}`} x={-max * 6 + i * 12 + 1} y="-3" width="10" height="6" />
      ))}
    </g>
  )
}

const INTENT_BADGES = { melee: 'MELEE', shoot: 'FIRE', advance: 'MOVE', hold: 'HOLD' }

function Unit({ unit, position, maxHits, intent, marks, onClick, onHover }) {
  const p = project(position)
  const down = unit.status !== 'active'
  const image = unit.character.portrait.image
  const clipId = `c2-clip-${unit.id}`
  return (
    <g
      className={`c2-unit is-${unit.side}${down ? ' is-down' : ''}${marks.selected ? ' is-selected' : ''}${marks.target ? ` is-target-${marks.target}` : ''}`}
      transform={`translate(${p.x} ${p.y})`}
      data-ui-sound=""
      onClick={(event) => {
        event.stopPropagation()
        onClick(unit.id)
      }}
      onMouseEnter={() => onHover(unit.id)}
      onMouseLeave={() => onHover(null)}
    >
      <ellipse className="c2-unit-ring" cx="0" cy="0" rx="24" ry="12" />
      {down ? (
        <rect className="c2-unit-body" x="-18" y="-10" width="36" height="14" rx="2" />
      ) : (
        <>
          <clipPath id={clipId}>
            <rect x="-17" y="-54" width="34" height="44" rx="3" />
          </clipPath>
          <rect className="c2-unit-body" x="-19" y="-56" width="38" height="48" rx="4" />
          {image ? (
            <image href={image} x="-17" y="-54" width="34" height="44" preserveAspectRatio="xMidYMin slice" clipPath={`url(#${clipId})`} />
          ) : (
            <text className="c2-unit-initial" x="0" y="-26" textAnchor="middle">
              {unit.character.name.charAt(0)}
            </text>
          )}
          <line className="c2-unit-stand" x1="0" y1="-8" x2="0" y2="0" />
        </>
      )}
      {!down && <HitPips hits={unit.hits} max={maxHits} y={-UNIT_HEAD - 6} />}
      {!down && intent && (
        <g className={`c2-intent-badge is-${intent.kind}`} transform={`translate(0 ${-UNIT_HEAD - 20})`}>
          <rect x="-22" y="-7" width="44" height="13" rx="2" />
          <text x="0" y="3" textAnchor="middle">
            {INTENT_BADGES[intent.kind]}
          </text>
        </g>
      )}
      {!down && marks.cover && (
        <g className="c2-unit-cover" transform="translate(21 -50)">
          <path d="M0 -7 L6 -4.5 V1 C6 4.5 3 6.5 0 8 C-3 6.5 -6 4.5 -6 1 V-4.5 Z" />
        </g>
      )}
      {marks.target && !down && <path className="c2-unit-bracket" d="M-24 -44 v-14 h8 M24 -44 v-14 h-8 M-24 -2 v8 h8 M24 -2 v8 h-8" />}
    </g>
  )
}

const ROLL_TEXT = (event) => {
  if (event.actionId === 'interact') return event.passed ? 'EPS DISCHARGE' : 'FAILED'
  if (event.actionId === 'push') return event.passed ? (event.effect.hazardHit ? 'PUSHED: -1 HIT' : 'PUSHED') : 'PUSH FAILED'
  if (!event.passed) return 'MISS'
  return event.effect.defeated ? 'HIT: DEFEATED' : 'HIT'
}

function walkDelay(events, event) {
  const before = events.find((other) => other.id === event.id - 1)
  return before?.type === 'move' && before.actorId === event.actorId ? (before.path.length - 1) * STEP_MS : 0
}

// The roll results of the latest step (hit / miss labels and a beam), delayed until the preceding walk finishes.
function RollEffects({ state, positionOf }) {
  const latestId = state.events.at(-1)?.id ?? 0
  const [mountedId] = useState(latestId)
  const recent = state.events.filter((event) => event.id > mountedId && event.id > latestId - 3)
  const sounded = useRef(mountedId)
  const { events } = state
  useEffect(() => {
    const fresh = events.filter((event) => event.id > sounded.current && event.type === 'roll' && event.actionId !== 'interact')
    sounded.current = Math.max(sounded.current, events.at(-1)?.id ?? 0)
    const timers = fresh.map((event) =>
      setTimeout(() => playWeaponSound(event.actionId === 'phaser' || event.actionId === 'disruptor' ? 'phaser' : 'punch'), walkDelay(events, event)),
    )
    return () => timers.forEach(clearTimeout)
  }, [events])
  const delayFor = (event) => walkDelay(state.events, event)

  return recent.map((event) => {
    if (event.type !== 'roll' && event.type !== 'info') return null
    const delay = `${delayFor(event)}ms`
    const subjectId = event.type === 'roll' && event.targetId ? event.targetId : event.actorId
    const at = project(positionOf(state.units[subjectId]))
    const from = project(positionOf(state.units[event.actorId]))
    const ranged = event.actionId === 'phaser' || event.actionId === 'disruptor'
    const text = event.type === 'info' ? 'PLAN CHANGED' : ROLL_TEXT(event)
    const good = event.type === 'roll' && event.passed
    return (
      <g key={event.id}>
        {ranged && (
          <line
            className={`c2-beam is-${state.units[event.actorId].side}${event.passed ? '' : ' is-miss'}`}
            style={{ animationDelay: delay }}
            x1={from.x}
            y1={from.y - 32}
            x2={at.x}
            y2={at.y - 32}
          />
        )}
        <text className={`c2-float${good ? ' is-good' : ' is-bad'}`} style={{ animationDelay: delay }} x={at.x} y={at.y - UNIT_HEAD - 30} textAnchor="middle">
          {text}
        </text>
      </g>
    )
  })
}

function PathLine({ path, className }) {
  if (!path || path.length < 2) return null
  return <polyline className={className} points={pts(path.map((position) => [project(position).x, project(position).y]))} />
}

export default function Board2({ state, overlay, onTileClick, onTileHover, onUnitClick, onUnitHover, onRightClick }) {
  const { map } = state
  const walking = useMoveAnimation(state.events)
  const centre = project({ x: map.width / 2, y: map.height / 2 })
  const { camera, dragHandlers } = useCamera(worldBounds(map), VIEW, { key: 'board', point: { x: centre.x + START_OFFSET.x, y: centre.y + START_OFFSET.y } }, false, onRightClick)
  const positionOf = (unit) => (walking?.id === unit.id ? walking.position : unit.position)

  const floors = []
  const blocks = []
  map.tiles.forEach((row, y) =>
    row.forEach((type, x) => {
      if (HEIGHTS[type]) blocks.push({ position: { x, y }, type })
      else floors.push({ position: { x, y }, type })
    }),
  )
  const units = state.order.map((id) => state.units[id])
  const depthItems = [
    ...blocks.map((block) => ({
      depth: block.position.x + block.position.y,
      render: () => <Block key={`b${tileKey(block.position)}`} position={block.position} type={block.type} height={blockHeight(map, block.position, block.type)} />,
    })),
    ...units.map((unit) => ({
      depth: positionOf(unit).x + positionOf(unit).y + (unit.status === 'active' ? 0.5 : 0.1),
      render: () => (
        <Unit
          key={`u${unit.id}`}
          unit={unit}
          position={positionOf(unit)}
          maxHits={overlay.maxHits}
          intent={overlay.showIntents && unit.side === 'enemy' ? state.intents[unit.id] : null}
          marks={overlay.unitMarks[unit.id] ?? {}}
          onClick={onUnitClick}
          onHover={onUnitHover}
        />
      ),
    })),
  ].sort((a, b) => a.depth - b.depth)

  const tileClass = (key, type, position) => {
    const classes = ['c2-tile', `is-${type}`, (position.x + position.y) % 2 ? 'is-alt' : '']
    if (type === 'grating' && state.hazard.active) classes.push('is-hazard-live')
    for (const [name, keys] of Object.entries(overlay.tileSets)) if (keys?.has(key)) classes.push(`is-${name}`)
    if (overlay.hoverKey === key) classes.push('is-hover')
    return classes.join(' ')
  }

  const sight = overlay.sightLine
  const push = overlay.pushArrow

  return (
    <svg className="c2-board" viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`} {...dragHandlers} onMouseLeave={() => onTileHover(null)}>
      <g className="c2-floor">
        {floors.map(({ position, type }) => {
          const key = tileKey(position)
          return (
            <polygon
              key={key}
              className={tileClass(key, type, position)}
              points={pts(diamond(position))}
              data-ui-press={overlay.tileSets.reach?.has(key) ? '' : undefined}
              onClick={() => onTileClick(position)}
              onMouseEnter={() => onTileHover(position)}
            />
          )
        })}
        {state.areas.map((area) => {
          const p = project(area.position)
          return (
            <text key={area.name} className="c2-area-label" x={p.x} y={p.y + 4} textAnchor="middle">
              {area.name.toUpperCase()}
            </text>
          )
        })}
      </g>
      {overlay.showIntents &&
        Object.entries(state.intents).map(([id, intent]) => (state.units[id].status === 'active' ? <PathLine key={id} path={intent.path} className="c2-intent-path" /> : null))}
      <PathLine path={overlay.movePath} className="c2-move-path" />
      {depthItems.map((item) => item.render())}
      {overlay.showIntents &&
        Object.entries(state.intents).map(([id, intent]) => {
          if (state.units[id].status !== 'active' || !intent.attackFrom || !intent.targetId) return null
          const from = project(intent.attackFrom)
          const to = project(state.units[intent.targetId].position)
          return <line key={`i${id}`} className={`c2-intent-attack is-${intent.kind}`} x1={from.x} y1={from.y - 30} x2={to.x} y2={to.y - 30} />
        })}
      {sight && (
        <g className={`c2-sight${sight.clear ? '' : ' is-blocked'}`}>
          <line x1={project(sight.from).x} y1={project(sight.from).y - 32} x2={project(sight.to).x} y2={project(sight.to).y - 32} />
          {sight.blockedAt && (
            <path
              transform={`translate(${project(sight.blockedAt).x} ${project(sight.blockedAt).y - 32})`}
              d="M-7 -7 L7 7 M7 -7 L-7 7"
            />
          )}
        </g>
      )}
      {push && (
        <g className={`c2-push${push.valid ? '' : ' is-blocked'}`}>
          <polygon points={pts(diamond(push.to, 0, 0.7))} />
          <line x1={project(push.from).x} y1={project(push.from).y} x2={project(push.to).x} y2={project(push.to).y} />
        </g>
      )}
      <RollEffects state={state} positionOf={positionOf} />
    </svg>
  )
}