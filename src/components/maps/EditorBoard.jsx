import { useEffect, useMemo, useRef, useState } from 'react'
import { getBigObjects } from '../../maps/bigObjects.js'
import { diamond, isBlock, mapBounds, project, pts } from '../../maps/iso.js'
import { brushPositions, paintBrush } from '../../maps/mapEdits.js'
import { getWallPanels } from '../../maps/wallPanels.js'
import useCamera from '../combat/useCamera.js'
import { AmbientDarkness, FloorTiles, LoneTile, WallBlock } from './IsoTiles.jsx'

// The map editor's board: the tile PNGs plus a clickable floor-level diamond for every tile (blocks never take clicks,
// so a tile is picked by where its floor would be). Markers and the hover outline are drawn on top of everything.
// Blocks are drawn as exploration and Combat Type 1 draw them (tall walls with panels, tall and big objects); nothing
// fades here, See-through blocks shows what is behind them.
const VIEW = { width: 900, height: 700 }
const MARGIN = 200
const NOTHING_FADED = new Set()

function Marker({ position, kind, label }) {
  const p = project(position)
  return (
    <g className={`me-marker is-${kind}`}>
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
export default function EditorBoard({ map, ghostBlocks, brush, rotated, onPaint, onHover, onRotate }) {
  const centre = project({ x: map.width / 2, y: map.height / 2 })
  const { camera, dragHandlers } = useCamera(mapBounds(map, MARGIN), VIEW, { key: 'editor', point: centre }, false, onRotate)
  const [hover, setHoverState] = useState(null)
  const setHover = (position) => {
    setHoverState(position)
    onHover(position)
  }
  const painting = useRef(false)

  useEffect(() => {
    const stop = () => (painting.current = false)
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])

  const cells = []
  const blocks = []
  map.tiles.forEach((row, y) =>
    row.forEach((id, x) => {
      cells.push({ x, y })
      if (isBlock(id)) blocks.push({ x, y })
    }),
  )
  blocks.sort((a, b) => a.x + a.y - (b.x + b.y))
  const panels = useMemo(() => getWallPanels(map), [map])
  const bigGroups = useMemo(() => getBigObjects(map), [map])

  return (
    <svg
      className="me-board"
      viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
      {...dragHandlers}
      onPointerLeave={() => setHover(null)}
    >
      <FloorTiles map={map} />
      <g className="me-cells">
        {cells.map((position) => (
          <polygon
            key={`${position.x},${position.y}`}
            points={pts(diamond(position))}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              painting.current = true
              onPaint(position, { first: true })
            }}
            onPointerEnter={() => {
              setHover(position)
              if (painting.current) onPaint(position, { first: false })
            }}
          />
        ))}
      </g>
      {blocks.map((position) => (
        <WallBlock key={`${position.x},${position.y}`} map={map} position={position} faded={NOTHING_FADED} panels={panels} bigGroups={bigGroups} ghost={ghostBlocks} />
      ))}
      <AmbientDarkness map={map} />
      <g className="me-overlay">
        {map.areas.map((area) => {
          const p = project(area.position)
          return (
            <text key={`${area.position.x},${area.position.y}`} className="me-area-label" x={p.x} y={p.y + 4} textAnchor="middle">
              {area.name.toUpperCase()}
            </text>
          )
        })}
        {map.markers.playerStarts.map((position, index) => (
          <Marker key={`p${position.x},${position.y}`} position={position} kind="player" label={`P${index + 1}`} />
        ))}
        {map.markers.enemySpawns.map((position, index) => (
          <Marker key={`e${position.x},${position.y}`} position={position} kind="enemy" label={`E${index + 1}`} />
        ))}
        {hover && brush && hover.x < map.width && hover.y < map.height && <BrushPreview map={map} position={hover} tileId={brush} rotated={rotated} />}
        {hover && <polygon className="me-hover" points={pts(diamond(hover))} />}
      </g>
    </svg>
  )
}
