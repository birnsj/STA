import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { diamond, mapBounds, project, pts, unproject } from '../../maps/iso.js'
import { isHostile } from '../../exploration/awareness.js'
import { challengeDefinitionsFor, objectivePosition } from '../../exploration/challengeObjects.js'
import { snapFacing, spawnFacing } from '../../maps/facing.js'
import { brushPositions, npcAt, paintBrush, swapTiles } from '../../maps/mapEdits.js'
import { getItemById } from '../../rules/equipment.js'
import { snapItemPosition } from '../../rules/inventory.js'
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

// Inventory tools: fractional board point snapped to the editor grid size (world px), or null off the map.
function itemAt(event, map, gridSize) {
  const svg = event.currentTarget.ownerSVGElement
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse())
  const position = snapItemPosition(unproject(point), gridSize)
  const tile = { x: Math.round(position.x), y: Math.round(position.y) }
  return tile.x >= 0 && tile.y >= 0 && tile.x < map.width && tile.y < map.height ? position : null
}

const sameHover = (a, b) => a?.x === b?.x && a?.y === b?.y

function groundLootViews(map, selectedGroundItemId, inventoryTool, hover) {
  const list = (map.groundItemPlacements ?? []).flatMap((entry) => {
    const def = getItemById(entry.itemId)
    if (!def) return []
    return [
      {
        id: entry.id,
        position: entry.position,
        worldImage: def.worldImage,
        worldTile: def.worldTile ?? 'crate',
        worldScale: def.worldScale ?? 0.4,
        category: def.category,
        depth: entry.position.x + entry.position.y,
        hovered: entry.id === selectedGroundItemId,
        inReach: true,
      },
    ]
  })
  if (inventoryTool && hover) {
    const def = getItemById(inventoryTool)
    if (def) {
      list.push({
        id: '__ghost',
        position: hover,
        worldImage: def.worldImage,
        worldTile: def.worldTile ?? 'crate',
        worldScale: def.worldScale ?? 0.4,
        category: def.category,
        depth: hover.x + hover.y + 0.001,
        hovered: false,
        inReach: true,
      })
    }
  }
  return list
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
const PATROL = 0xe8c44a

// What the Pixi scene outlines for the selection (pixi/editorMarkers.js EditorOutlineView): the selected destructible's
// tile with the square its explosion reaches and its linked tiles, the selected hazard region's tiles, or the selected
// NPC's patrol route.
function selectionOutlines(map, environment, destructibleId, hazardId, selectedNpcId) {
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
  const npc = selectedNpcId && (map.npcs ?? []).find((entry) => entry.id === selectedNpcId)
  if (npc?.patrol?.length) {
    outlines.push({
      id: `p:${npc.id}`,
      tiles: npc.patrol.map((point) => point.at),
      square: null,
      colour: PATROL,
      fillAlpha: 0.12,
      route: true,
    })
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
// lighting: draw contact/cast shadows and the map's darkness. animate: animated tiles play (off: each holds its first
// frame). showGrid / gridSize: optional iso guide grid (world pixels; 64 = one tile). erasing: the Erase Marker tool is
// held, so the markers and label on the hovered tile are highlighted as the ones a click removes. selectedNpcId: the
// NPC the inspector shows. selectedWaypointIndex: patrol waypoint index while editing that NPC's route (null: none).
export default function EditorBoard({
  map,
  ghostBlocks,
  lighting = true,
  animate = true,
  showGrid = false,
  gridSize = 64,
  showBounds = true,
  showCentre = false,
  // Editor layer visibility (UI only). Hidden layers omit their markers/labels from the board.
  layerVisibility = null,
  brush,
  rotated,
  erasing = false,
  selectedNpcId = null,
  selectedWaypointIndex = null,
  selectedMarker = null,
  selectedObjectId = null,
  selectedDestructibleId = null,
  selectedHazardId = null,
  selectedGroundItemId = null,
  inventoryTool = null,
  moveFrom = null,
  onPaint,
  onPaintEnd,
  onHover,
  onRightClick,
}) {
  // Destructible objects show in the state they start the mission in, force fields up, as play will draw them.
  const environment = useMemo(() => createEnvironment(map), [map])
  const layout = useMemo(() => boardLayout(applyEnvironmentTiles(map, environment)), [map, environment])
  const outlines = useMemo(() => {
    const list = selectionOutlines(map, environment, selectedDestructibleId, selectedHazardId, selectedNpcId)
    return list.filter((entry) => {
      if (entry.id.startsWith('d:') || entry.id.startsWith('l:') || entry.id.startsWith('h:')) return layerShown('furniture')
      if (entry.id.startsWith('p:')) return layerShown('characters')
      return true
    })
  }, [map, environment, selectedDestructibleId, selectedHazardId, selectedNpcId, layerVisibility])
  // Every painted hazard shows while authoring, including one that only starts when something sets it off.
  const shownEnvironment = useMemo(
    () => ({ ...environment, hazards: Object.fromEntries(Object.entries(environment.hazards).map(([id, region]) => [id, { ...region, active: true }])) }),
    [environment],
  )
  const centre = project({ x: map.width / 2, y: map.height / 2 })
  const hoverRef = useRef(null)
  const { camera, dragHandlers } = useCamera(mapBounds(map, MARGIN), VIEW, { key: 'editor', point: centre }, false, () => onRightClick?.(hoverRef.current))
  const sceneRef = useRef(null)
  const { hostRef, failed } = usePixiScene((host, isCancelled) => startMapScene(host, () => sceneRef.current, isCancelled))
  const [hover, setHoverState] = useState(null)
  // Only a move onto another cell counts, so the board re-renders once per grid step rather than per pointer move.
  const setHover = (position) => {
    hoverRef.current = position
    if (sameHover(position, hover)) return
    setHoverState(position)
    onHover(position)
  }
  const painting = useRef(false)
  const pointerAt = (event) => (inventoryTool ? itemAt(event, map, gridSize) : tileAt(event, map))

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

  const layerShown = (id) => !layerVisibility || layerVisibility[id] !== false
  // What the scene draws over the map: the room labels, then the markers.
  const labels = layerShown('markers')
    ? map.areas.map((area) => ({ id: `${area.position.x},${area.position.y}`, position: area.position, name: area.name, doomed: doomed(area.position) }))
    : []
  const spawnFacingAt = (position) => (npcAt(map, position) ? null : snapFacing(spawnFacing(map, position)))
  const markers = [
    ...(layerShown('furniture')
      ? challengeDefinitionsFor(map).map((definition) => ({
          id: `c${definition.id}`,
          position: { x: definition.position[0], y: definition.position[1] },
          kind: 'object',
          label: 'C',
          facing: null,
          selected: definition.id === selectedObjectId,
          doomed: false,
        }))
      : []),
    ...(layerShown('characters')
      ? map.markers.playerStarts.map((start, index) => ({
          id: `p${start.x},${start.y}`,
          position: start,
          kind: 'player',
          label: `P${index + 1}`,
          facing: spawnFacingAt(start),
          selected: isSelected('playerStarts', start),
          doomed: doomed(start),
        }))
      : []),
    ...(layerShown('characters')
      ? map.markers.enemySpawns.map((spawn, index) => ({
          id: `e${spawn.x},${spawn.y}`,
          position: spawn,
          kind: 'enemy',
          label: `E${index + 1}`,
          facing: spawnFacingAt(spawn),
          selected: isSelected('enemySpawns', spawn),
          doomed: doomed(spawn),
        }))
      : []),
    ...(layerShown('characters')
      ? (map.npcs ?? []).map((npc) => ({
          id: `n${npc.id}`,
          position: npc.position,
          kind: isHostile(npc) ? 'enemy' : 'npc',
          label: npc.conversationId ? 'N…' : 'N',
          facing: npc.facing ?? 0,
          selected: npc.id === selectedNpcId,
          doomed: doomed(npc.position),
        }))
      : []),
    ...((map.npcs ?? []).find((npc) => npc.id === selectedNpcId)?.patrol ?? []).map((point, index) => ({
      id: `w${selectedNpcId}:${index}`,
      position: point.at,
      kind: 'patrol',
      label: `W${index + 1}`,
      facing: point.facing ?? null,
      selected: index === selectedWaypointIndex,
      doomed: false,
    })),
    ...(layerShown('markers')
      ? (map.objectives ?? []).flatMap((objective, index) => {
          const position = objectivePosition(map, objective)
          return position ? [{ id: `o${index}`, position, kind: 'objective', label: `O${index + 1}`, facing: null, selected: false, doomed: false }] : []
        })
      : []),
  ]
  const preview = useMemo(() => (inventoryTool ? null : tilePreview(map, hover, brush, rotated, moveFrom)), [map, hover, brush, rotated, moveFrom, inventoryTool])
  const groundLoot = useMemo(
    () => (layerShown('furniture') ? groundLootViews(map, selectedGroundItemId, inventoryTool, inventoryTool ? hover : null) : []),
    [map, selectedGroundItemId, inventoryTool, hover, layerVisibility],
  )
  useLayoutEffect(() => {
    sceneRef.current = {
      layout,
      ghost: ghostBlocks,
      lighting,
      animate,
      environment: shownEnvironment,
      labels,
      markers,
      groundLoot,
      outlines,
      preview,
      grid: { show: showGrid, size: gridSize, width: map.width, height: map.height },
      bounds: { showBounds, showCentre, width: map.width, height: map.height },
      layerVisibility,
      svg: dragHandlers.ref.current,
    }
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
            const position = event.button === 0 ? pointerAt(event) : null
            if (!position) return
            painting.current = true
            setHover(position)
            onPaint(position, { first: true })
          }}
          onPointerMove={(event) => {
            const position = pointerAt(event)
            const moved = !sameHover(position, hover)
            setHover(position)
            if (position && moved && painting.current) onPaint(position, { first: false })
          }}
          onPointerLeave={() => setHover(null)}
        />
        <g className="me-overlay">
          {moveFrom && !inventoryTool && <polygon className="me-hover is-move-source" points={pts(diamond(moveFrom))} />}
          {hover && !inventoryTool && <polygon className={`me-hover${erasesSomething ? ' is-erase' : ''}`} points={pts(diamond(hover))} />}
        </g>
      </svg>
    </>
  )
}
