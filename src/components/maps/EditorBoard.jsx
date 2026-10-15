import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { diamond, mapBounds, project, pts, unproject } from '../../maps/iso.js'
import { isHostile } from '../../exploration/awareness.js'
import { challengeDefinitionsFor, objectivePosition } from '../../exploration/challengeObjects.js'
import { snapFacing, spawnFacing } from '../../maps/facing.js'
import { brushPositions, npcAt, paintBrush, swapTiles } from '../../maps/mapEdits.js'
import { applyEnvironmentTiles, createEnvironment } from '../../world/environment.js'
import useCamera from '../combat/useCamera.js'
import { boardLayout } from './canvasTiles.js'
import { startMapScene } from './pixi/mapScene.js'
import usePixiScene from './pixi/usePixiScene.js'
import WebglUnavailable from './pixi/WebglUnavailable.jsx'

// The map editor's board: the map drawn as exploration and combat draw it (with PixiJS behind the SVG, pixi/mapScene.js)
// under one clickable floor-level outline of the whole map; the tile under the pointer is worked out from where its
// floor would be (blocks never take clicks). The
// room labels, markers and tile previews are drawn by the Pixi scene; the hover outline is SVG on top. Nothing fades
// here; See-through blocks shows what is behind blocks.
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

// The tiles drawn see-through over everything (so a block in front doesn't hide them), as they would look placed: the
// Move tool mid-drag, both tiles as they would sit after the swap; else the brush at the hovered tile, as it would
// look painted there (both tiles of a wall panel, paired as they would be). Null when there is nothing to preview.
function tilePreview(map, hover, brush, rotated, moveFrom) {
  if (!hover) return null
  if (moveFrom && !moveFrom.markers) return { layout: boardLayout(swapTiles(map, moveFrom, hover)), positions: [moveFrom, hover], key: `move:${moveFrom.x},${moveFrom.y}>${hover.x},${hover.y}` }
  if (!brush || hover.x >= map.width || hover.y >= map.height) return null
  return { layout: boardLayout(paintBrush(map, hover, brush, rotated)), positions: brushPositions(map, hover, brush, rotated), key: `brush:${brush}:${rotated}@${hover.x},${hover.y}` }
}

const SELECTED = 0xffb347
const LINKED = 0x5fe8ff

// What the Pixi scene outlines for the selection (pixi/editorMarkers.js EditorOutlineView): the selected destructible's
// tile with the square its explosion reaches and its linked tiles, or the selected hazard region's tiles.
function selectionOutlines(map, environment, destructibleId, hazardId) {
  const outlines = []
  const record = destructibleId && environment.destructibles[destructibleId]
  if (record) {
    outlines.push({ id: `d:${record.id}`, tiles: [record.position], square: record.explosion ? { position: record.position, radius: record.explosion.radius } : null, colour: SELECTED })
    if (record.linkedTiles.length) outlines.push({ id: `l:${record.id}`, tiles: record.linkedTiles, square: null, colour: LINKED, fillAlpha: 0.15 })
  }
  const region = hazardId && (map.hazards ?? []).find((entry) => entry.id === hazardId)
  if (region) {
    const tiles = Object.keys(region.tiles).map((key) => {
      const [x, y] = key.split(',').map(Number)
      return { x, y }
    })
    outlines.push({ id: `h:${region.id}`, tiles, square: null, colour: SELECTED, fillAlpha: 0.1 })
  }
  return outlines
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
  selectedDestructibleId = null,
  selectedHazardId = null,
  moveFrom = null,
  onPaint,
  onPaintEnd,
  onHover,
  onRightClick,
}) {
  // Destructible objects show in the state they start the mission in, force fields up, as play will draw them.
  const environment = useMemo(() => createEnvironment(map), [map])
  const layout = useMemo(() => boardLayout(applyEnvironmentTiles(map, environment)), [map, environment])
  const outlines = useMemo(() => selectionOutlines(map, environment, selectedDestructibleId, selectedHazardId), [map, environment, selectedDestructibleId, selectedHazardId])
  const centre = project({ x: map.width / 2, y: map.height / 2 })
  const hoverRef = useRef(null)
  const { camera, dragHandlers } = useCamera(mapBounds(map, MARGIN), VIEW, { key: 'editor', point: centre }, false, () => onRightClick?.(hoverRef.current))
  const sceneRef = useRef(null)
  const { hostRef, failed } = usePixiScene((host, isCancelled) => startMapScene(host, () => sceneRef.current, isCancelled))
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

  // What the scene draws over the map: the room labels, then the markers.
  const labels = map.areas.map((area) => ({ id: `${area.position.x},${area.position.y}`, position: area.position, name: area.name, doomed: doomed(area.position) }))
  const spawnFacingAt = (position) => (npcAt(map, position) ? null : snapFacing(spawnFacing(map, position)))
  const markers = [
    ...challengeDefinitionsFor(map).map((definition) => ({
      id: `c${definition.id}`,
      position: { x: definition.position[0], y: definition.position[1] },
      kind: 'object',
      label: 'C',
      facing: null,
      selected: definition.id === selectedObjectId,
      doomed: false,
    })),
    ...map.markers.playerStarts.map((start, index) => ({
      id: `p${start.x},${start.y}`,
      position: start,
      kind: 'player',
      label: `P${index + 1}`,
      facing: spawnFacingAt(start),
      selected: isSelected('playerStarts', start),
      doomed: doomed(start),
    })),
    ...map.markers.enemySpawns.map((spawn, index) => ({
      id: `e${spawn.x},${spawn.y}`,
      position: spawn,
      kind: 'enemy',
      label: `E${index + 1}`,
      facing: spawnFacingAt(spawn),
      selected: isSelected('enemySpawns', spawn),
      doomed: doomed(spawn),
    })),
    ...(map.npcs ?? []).map((npc) => ({
      id: `n${npc.id}`,
      position: npc.position,
      kind: isHostile(npc) ? 'enemy' : 'npc',
      label: npc.conversationId ? 'N…' : 'N',
      facing: npc.facing ?? 0,
      selected: npc.id === selectedNpcId,
      doomed: doomed(npc.position),
    })),
    ...(map.objectives ?? []).flatMap((objective, index) => {
      const position = objectivePosition(map, objective)
      return position ? [{ id: `o${index}`, position, kind: 'objective', label: `O${index + 1}`, facing: null, selected: false, doomed: false }] : []
    }),
  ]
  const preview = useMemo(() => tilePreview(map, hover, brush, rotated, moveFrom), [map, hover, brush, rotated, moveFrom])
  useLayoutEffect(() => {
    sceneRef.current = { layout, ghost: ghostBlocks, lighting, animate, labels, markers, outlines, preview, svg: dragHandlers.ref.current }
  })

  if (failed) return <WebglUnavailable />
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
    <>
      <div className="pixi-board-host" ref={hostRef} />
      <svg
        className="me-board"
        viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
        {...dragHandlers}
        onPointerLeave={() => setHover(null)}
      >
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
          {moveFrom && <polygon className="me-hover is-move-source" points={pts(diamond(moveFrom))} />}
          {hover && <polygon className={`me-hover${erasesSomething ? ' is-erase' : ''}`} points={pts(diamond(hover))} />}
        </g>
      </svg>
    </>
  )
}
