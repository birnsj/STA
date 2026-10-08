import { useEffect, useRef, useState } from 'react'
import { diamond, mapBounds, project, pts, unproject } from '../../maps/iso.js'
import { brushPositions, paintBrush } from '../../maps/mapEdits.js'
import { getWallPanels } from '../../maps/wallPanels.js'
import useCamera from '../combat/useCamera.js'
import EditorCanvas from './EditorCanvas.jsx'
import { AmbientDarkness, LoneTile } from './IsoTiles.jsx'

// The map editor's board: the tiles drawn into one canvas (EditorCanvas: floor, shadows and light pools, blocks as
// exploration and Combat Type 1 draw them, animated tiles on layers over it) under one clickable floor-level outline of the
// whole map; the tile under the pointer is worked out from where its floor would be (blocks never take clicks). The
// darkness is SVG between the tiles and their lit parts; the markers, labels, brush and hover outline are SVG on top. Nothing fades here; See-through blocks shows what
// is behind blocks.
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

function Marker({ position, kind, label, doomed }) {
  const p = project(position)
  return (
    <g className={`me-marker is-${kind}${doomed ? ' is-doomed' : ''}`}>
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

// onPaint(position, { first }): a left press on a tile (first) or dragging onto another tile while held.
// onHover(position or null): the tile under the pointer. brush: the tile id being painted, or null (no tile tool).
// rotated: the brush paints tiles rotated (mapFormat.js rotated); onRotate: a right click without dragging.
// lighting: draw shadows, light pools and the map's darkness. animate: animated tiles play (off: each holds its first
// frame). erasing: the Erase Marker tool is held, so the markers and label on the hovered tile are highlighted as the
// ones a click removes.
export default function EditorBoard({ map, ghostBlocks, lighting = true, animate = true, brush, rotated, erasing = false, onPaint, onHover, onRotate }) {
  const centre = project({ x: map.width / 2, y: map.height / 2 })
  const { camera, dragHandlers } = useCamera(mapBounds(map, MARGIN), VIEW, { key: 'editor', point: centre }, false, onRotate)
  const [hover, setHoverState] = useState(null)
  // Only a move onto another tile counts, so the board re-renders once per tile crossed rather than per pointer move.
  const setHover = (position) => {
    if (position?.x === hover?.x && position?.y === hover?.y) return
    setHoverState(position)
    onHover(position)
  }
  const painting = useRef(false)

  useEffect(() => {
    const stop = () => (painting.current = false)
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])

  const doomed = (position) => erasing && hover?.x === position.x && hover?.y === position.y
  const erasesSomething =
    erasing && hover && [...map.markers.playerStarts, ...map.markers.enemySpawns, ...map.areas.map((area) => area.position)].some(doomed)

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
      <EditorCanvas map={map} ghost={ghostBlocks} lighting={lighting} animate={animate} darkness={lighting && <AmbientDarkness map={map} />} />
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
        {map.markers.playerStarts.map((position, index) => (
          <Marker key={`p${position.x},${position.y}`} position={position} kind="player" label={`P${index + 1}`} doomed={doomed(position)} />
        ))}
        {map.markers.enemySpawns.map((position, index) => (
          <Marker key={`e${position.x},${position.y}`} position={position} kind="enemy" label={`E${index + 1}`} doomed={doomed(position)} />
        ))}
        {hover && brush && hover.x < map.width && hover.y < map.height && <BrushPreview map={map} position={hover} tileId={brush} rotated={rotated} />}
        {hover && <polygon className={`me-hover${erasesSomething ? ' is-erase' : ''}`} points={pts(diamond(hover))} />}
      </g>
    </svg>
  )
}
