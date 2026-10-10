import { useEffect, useMemo, useRef, useState } from 'react'
import { diamond, mapBounds, project, pts, unproject } from '../../maps/iso.js'
import { isHostile } from '../../exploration/awareness.js'
import { challengeDefinitionsFor, objectivePosition } from '../../exploration/challengeObjects.js'
import { snapFacing, spawnFacing } from '../../maps/facing.js'
import { brushPositions, npcAt, paintBrush, swapTiles } from '../../maps/mapEdits.js'
import { getWallPanels } from '../../maps/wallPanels.js'
import useCamera from '../combat/useCamera.js'
import { boardLayout } from './canvasTiles.js'
import { LoneTile } from './IsoTiles.jsx'
import MapCanvas from './MapCanvas.jsx'

// The map editor's board: the map drawn as exploration and Combat Type 1 draw it (MapCanvas) under one clickable
// floor-level outline of the whole map; the tile under the pointer is worked out from where its floor would be (blocks
// never take clicks). The markers, labels, brush and hover outline are SVG on top. Nothing fades here; See-through
// blocks shows what is behind blocks.
const VIEW = { width: 900, height: 700 }
const MARGIN = 200

// The tile whose floor diamond is under a pointer event's position, or null off the map.
function tileAt(event, map) {
  const svg = event.currentTarget.ownerSVGElement
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse())
  const tile = unproject(point)
  const position = { x: Math.round(tile.x), y: Math.round(tile.y) }
  return position.x >= 0 && position.y >= 0 && position.x < map.width && position.y < map.height ? position : null
}

// The way a player start, NPC or enemy faces (degrees, 0 = +x): an arrow just outside the marker's diamond, so it
// never crosses the diamond's outline or label.
function FacingArrow({ position, facing }) {
  const radians = (facing * Math.PI) / 180
  const along = (distance) => project({ x: position.x + Math.cos(radians) * distance, y: position.y + Math.sin(radians) * distance })
  const [base, tip] = [along(0.34), along(0.8)]
  const [dx, dy] = [tip.x - base.x, tip.y - base.y]
  const length = Math.hypot(dx, dy) || 1
  const [ux, uy] = [dx / length, dy / length]
  const neck = { x: tip.x - ux * 11, y: tip.y - uy * 11 }
  const head = [
    [tip.x, tip.y],
    [neck.x - uy * 7, neck.y + ux * 7],
    [neck.x + uy * 7, neck.y - ux * 7],
  ]
  return (
    <g className="me-facing">
      <line x1={base.x} y1={base.y} x2={neck.x} y2={neck.y} />
      <polygon points={head.map((point) => point.join(',')).join(' ')} />
    </g>
  )
}

function Marker({ position, kind, label, doomed, selected = false, title = null, facing = null }) {
  const p = project(position)
  return (
    <g className={`me-marker is-${kind}${doomed ? ' is-doomed' : ''}${selected ? ' is-selected' : ''}`}>
      {title && <title>{title}</title>}
      {facing !== null && <FacingArrow position={position} facing={facing} />}
      <polygon points={pts(diamond(position, 0, 0.6))} />
      <text x={p.x} y={p.y + 4} textAnchor="middle">
        {label}
      </text>
    </g>
  )
}

// The brush drawn see-through at the hovered tile, as it would look painted there (both tiles of a wall panel, paired
// as they would be). It is drawn over everything, so a block in front of it doesn't hide it.
function BrushPreview({ map, position, tileId, rotated }) {
  const preview = paintBrush(map, position, tileId, rotated)
  const panels = getWallPanels(preview)
  const positions = brushPositions(map, position, tileId, rotated).sort((a, b) => a.x + a.y - (b.x + b.y))
  return (
    <g className="me-brush">
      {positions.map((at) => (
        <LoneTile key={`${at.x},${at.y}`} map={preview} position={at} panel={panels.get(`${at.x},${at.y}`) ?? null} />
      ))}
    </g>
  )
}

// The Move tool mid-drag: both tiles drawn see-through as they would sit after the swap.
function MovePreview({ map, from, to }) {
  const preview = swapTiles(map, from, to)
  const panels = getWallPanels(preview)
  const positions = [from, to].sort((a, b) => a.x + a.y - (b.x + b.y))
  return (
    <g className="me-brush">
      {positions.map((at) => (
        <LoneTile key={`${at.x},${at.y}`} map={preview} position={at} panel={panels.get(`${at.x},${at.y}`) ?? null} />
      ))}
    </g>
  )
}

// onPaint(position, { first }): a left press on a tile (first) or dragging onto another tile while held.
// onPaintEnd(position or null): the left button released after a press on the map, over that tile (null: off the map).
// onHover(position or null): the tile under the pointer. brush: the tile id being painted, or null (no tile tool).
// rotated: the brush paints tiles rotated (mapFormat.js rotated). onRightClick(position or null): a right click without
// dragging, over that tile. selectedMarker: the player start or enemy spawn in its inspector ({ kind, x, y }). selectedObjectId: the
// challenge object in its inspector (challenge objects are drawn as C markers where the map places them). moveFrom: the tile the Move tool is carrying ({ x, y, markers: true when it carries the
// tile's markers rather than the tile }), or null.
// lighting: draw shadows, light pools and the map's darkness. animate: animated tiles play (off: each holds its first
// frame). erasing: the Erase Marker tool is held, so the markers and label on the hovered tile are highlighted as the
// ones a click removes. selectedNpcId: the NPC the inspector shows.
export default function EditorBoard({
  map,
  ghostBlocks,
  lighting = true,
  animate = true,
  brush,
  rotated,
  erasing = false,
  selectedNpcId = null,
  selectedMarker = null,
  selectedObjectId = null,
  moveFrom = null,
  onPaint,
  onPaintEnd,
  onHover,
  onRightClick,
}) {
  const layout = useMemo(() => boardLayout(map), [map])
  const centre = project({ x: map.width / 2, y: map.height / 2 })
  const hoverRef = useRef(null)
  const { camera, dragHandlers } = useCamera(mapBounds(map, MARGIN), VIEW, { key: 'editor', point: centre }, false, () => onRightClick?.(hoverRef.current))
  const [hover, setHoverState] = useState(null)
  // Only a move onto another tile counts, so the board re-renders once per tile crossed rather than per pointer move.
  const setHover = (position) => {
    hoverRef.current = position
    if (position?.x === hover?.x && position?.y === hover?.y) return
    setHoverState(position)
    onHover(position)
  }
  const painting = useRef(false)

  useEffect(() => {
    const stop = () => {
      if (painting.current) onPaintEnd?.(hoverRef.current)
      painting.current = false
    }
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [onPaintEnd])

  const isSelected = (kind, position) => selectedMarker?.kind === kind && selectedMarker.x === position.x && selectedMarker.y === position.y
  const doomed = (position) => erasing && hover?.x === position.x && hover?.y === position.y
  const erasesSomething =
    erasing && hover && [...map.markers.playerStarts, ...map.markers.enemySpawns, ...map.areas.map((area) => area.position), ...(map.npcs ?? []).map((npc) => npc.position)].some(doomed)

  const [right, bottom] = [map.width - 0.5, map.height - 0.5]
  const outline = pts(
    [
      [-0.5, -0.5],
      [right, -0.5],
      [right, bottom],
      [-0.5, bottom],
    ].map(([x, y]) => {
      const corner = project({ x, y })
      return [corner.x, corner.y]
    }),
  )

  return (
    <svg
      className="me-board"
      viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
      {...dragHandlers}
      onPointerLeave={() => setHover(null)}
    >
      <MapCanvas layout={layout} ghost={ghostBlocks} lighting={lighting} animate={animate} />
      <polygon
        className="me-cells"
        points={outline}
        onPointerDown={(event) => {
          const position = event.button === 0 ? tileAt(event, map) : null
          if (!position) return
          painting.current = true
          setHover(position)
          onPaint(position, { first: true })
        }}
        onPointerMove={(event) => {
          const position = tileAt(event, map)
          const moved = position?.x !== hover?.x || position?.y !== hover?.y
          setHover(position)
          if (position && moved && painting.current) onPaint(position, { first: false })
        }}
        onPointerLeave={() => setHover(null)}
      />
      <g className="me-overlay">
        {map.areas.map((area) => {
          const p = project(area.position)
          return (
            <text
              key={`${area.position.x},${area.position.y}`}
              className={`me-area-label${doomed(area.position) ? ' is-doomed' : ''}`}
              x={p.x}
              y={p.y + 4}
              textAnchor="middle"
            >
              {area.name.toUpperCase()}
            </text>
          )
        })}
        {challengeDefinitionsFor(map).map((definition) => (
          <Marker
            key={`c${definition.id}`}
            position={{ x: definition.position[0], y: definition.position[1] }}
            kind="object"
            label="C"
            title={`${definition.name} (${definition.id})`}
            selected={definition.id === selectedObjectId}
          />
        ))}
        {map.markers.playerStarts.map((start, index) => (
          <Marker key={`p${start.x},${start.y}`} position={start} kind="player" label={`P${index + 1}`} doomed={doomed(start)} selected={isSelected('playerStarts', start)} facing={npcAt(map, start) ? null : snapFacing(spawnFacing(map, start))} />
        ))}
        {map.markers.enemySpawns.map((spawn, index) => (
          <Marker key={`e${spawn.x},${spawn.y}`} position={spawn} kind="enemy" label={`E${index + 1}`} doomed={doomed(spawn)} selected={isSelected('enemySpawns', spawn)} facing={npcAt(map, spawn) ? null : snapFacing(spawnFacing(map, spawn))} />
        ))}
        {(map.npcs ?? []).map((npc) => (
          <Marker
            key={`n${npc.id}`}
            position={npc.position}
            kind={isHostile(npc) ? 'enemy' : 'npc'}
            label={npc.conversationId ? 'N…' : 'N'}
            title={`${npc.name || npc.characterId || npc.id}${npc.conversationId ? ` (conversation ${npc.conversationId})` : ''}`}
            doomed={doomed(npc.position)}
            selected={npc.id === selectedNpcId}
            facing={npc.facing ?? 0}
          />
        ))}
        {(map.objectives ?? []).map((objective, index) => {
          const position = objectivePosition(map, objective)
          return position && <Marker key={`o${index}`} position={position} kind="objective" label={`O${index + 1}`} title={`Objective: ${objective.title || objective.id}`} />
        })}
        {moveFrom && <polygon className="me-hover is-move-source" points={pts(diamond(moveFrom))} />}
        {moveFrom && hover && !moveFrom.markers && <MovePreview map={map} from={moveFrom} to={hover} />}
        {hover && brush && hover.x < map.width && hover.y < map.height && <BrushPreview map={map} position={hover} tileId={brush} rotated={rotated} />}
        {hover && <polygon className={`me-hover${erasesSomething ? ' is-erase' : ''}`} points={pts(diamond(hover))} />}
      </g>
    </svg>
  )
}
