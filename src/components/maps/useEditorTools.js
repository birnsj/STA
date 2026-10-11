import { useEffect, useMemo, useState } from 'react'
import { challengeDefinitionsFor } from '../../exploration/challengeObjects.js'
import { listAuthoredCharacters } from '../../character/authoredCharacters.js'
import {
  areaAt,
  eraseMarkers,
  hasMarkers,
  moveMarkers,
  npcAt,
  paintBrush,
  placeNpc,
  selectionAt,
  setAreaLabel,
  swapTilesWithObjects,
  toggleMarker,
  turnFacing,
  updateNpc,
} from '../../maps/mapEdits.js'
import { getTile, isRotated } from '../../maps/mapFormat.js'

// The character a newly placed NPC starts as (changed in its inspector).
const FIRST_CHARACTER_ID = listAuthoredCharacters()[0]?.id ?? null

// The map editor's tools: which tool is held, the board's click / drag / right-click behaviour for each, and what is
// selected for its inspector (an NPC, a player start or enemy spawn, a challenge object). It edits through edit(map) and
// never touches files or popups.
// map, edit(map), setStatus(text), askText(details): from the editor. boardKey: changes whenever a different map is put
// in front of the user, which clears the selection. suspended: a popup or full-screen editor is open, so the keys stand
// aside. onObjectivePlaced(index): an objective sent here by the Objective Editor was placed (or cancelled), so it reopens.
export default function useEditorTools({ map, edit, setStatus, askText, boardKey, suspended, onObjectivePlaced }) {
  const [tool, setTool] = useState('tile:bulkhead')
  // Place Tiles: the board only paints the chosen tile while this is on; off, the pointer is just a cursor.
  const [placing, setPlacing] = useState(false)
  // Move: dragging a tile swaps it with the one it is dropped on. moveFrom: the tile being carried (null = none).
  // Move and Place Tiles are never on together.
  const [moving, setMoving] = useState(false)
  const [moveFrom, setMoveFrom] = useState(null)
  // The tile brush paints rotated tiles (the R key toggles it; picking a tile copies its rotation).
  const [rotated, setRotated] = useState(false)
  // The objective (index) whose position the next map click sets, or null. placingFromEditor: the Objective Editor sent
  // the user to the board, so it reopens once the tile is clicked (or Escape cancels).
  const [placingObjective, setPlacingObjective] = useState(null)
  const [placingFromEditor, setPlacingFromEditor] = useState(false)
  // The NPC tool: the NPC shown in the inspector, and whether the next board click moves it.
  const [selectedNpcId, setSelectedNpcId] = useState(null)
  const [movingNpc, setMovingNpc] = useState(false)
  // The player start or enemy spawn shown in its inspector ({ kind, x, y }), or null. Looked up by tile, so moving or
  // deleting it closes the inspector.
  const [selectedMarker, setSelectedMarker] = useState(null)
  // The challenge object shown in its inspector (an id), and whether the next board click moves it.
  const [selectedObjectId, setSelectedObjectId] = useState(null)
  const [placingObject, setPlacingObject] = useState(false)

  // A different map clears everything selected or half-done on the old one.
  const [seenBoardKey, setSeenBoardKey] = useState(boardKey)
  if (seenBoardKey !== boardKey) {
    setSeenBoardKey(boardKey)
    setSelectedNpcId(null)
    setSelectedMarker(null)
    setPlacingObjective(null)
    setPlacingFromEditor(false)
    setSelectedObjectId(null)
    setPlacingObject(false)
    setMovingNpc(false)
    setMoveFrom(null)
  }

  const selectedNpc = (map.npcs ?? []).find((npc) => npc.id === selectedNpcId) ?? null
  const markerInspected = useMemo(() => {
    if (!selectedMarker) return null
    const list = map.markers[selectedMarker.kind]
    const index = list.findIndex((marker) => marker.x === selectedMarker.x && marker.y === selectedMarker.y)
    if (index < 0) return null
    return { ...list[index], kind: selectedMarker.kind, label: `${selectedMarker.kind === 'playerStarts' ? 'P' : 'E'}${index + 1}` }
  }, [map, selectedMarker])
  const objectDefinitions = useMemo(() => challengeDefinitionsFor(map), [map])
  const selectedObject = objectDefinitions.find((definition) => definition.id === selectedObjectId) ?? null

  // Escape puts the brush down (no tool selected, Place Tiles off), unless a popup is open (its own Escape cancels it)
  // or a text box has focus. R rotates the tile brush.
  useEffect(() => {
    if (suspended) return undefined
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea, select')) return
      if ((event.key === 'r' || event.key === 'R') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (placing && tool?.startsWith('tile:')) setRotated((value) => !value)
        return
      }
      if (event.key !== 'Escape') return
      if (placingObject) return setPlacingObject(false)
      if (placingObjective !== null) {
        if (placingFromEditor) onObjectivePlaced(placingObjective)
        setPlacingObjective(null)
        setPlacingFromEditor(false)
        return
      }
      setTool(null)
      setPlacing(false)
      setMoving(false)
      setMoveFrom(null)
      setMovingNpc(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [suspended, placing, tool, placingObjective, placingFromEditor, placingObject, onObjectivePlaced])

  // The NPC tool: click an NPC to select it, an empty floor tile to place a new one (or, while moving, to move the
  // selected one there).
  const onNpcTool = (position) => {
    if (movingNpc && selectedNpc) {
      const moved = updateNpc(map, selectedNpc.id, { position })
      if (moved === map) setStatus('NPCs stand on free floor tiles.')
      edit(moved)
      setMovingNpc(false)
      setSelectedMarker(null)
      return
    }
    const existing = npcAt(map, position)
    setSelectedMarker(null)
    if (existing) return setSelectedNpcId(existing.id)
    const placed = placeNpc(map, position, FIRST_CHARACTER_ID)
    if (!placed) return setStatus('NPCs stand on free floor tiles.')
    edit(placed.map)
    setSelectedNpcId(placed.npc.id)
  }

  // A click with no marker tool held (Place Tiles and Move off): select what stands on the tile for editing (the NPC
  // and the player start or enemy spawn under it, each in its own inspector); an empty tile closes the inspectors.
  const selectAt = (position) => {
    const { npc, markerKind, object } = selectionAt(map, objectDefinitions, position)
    setSelectedNpcId(npc?.id ?? null)
    setSelectedMarker(markerKind ? { kind: markerKind, x: position.x, y: position.y } : null)
    setSelectedObjectId(object?.id ?? null)
    setPlacingObject(false)
    setMovingNpc(false)
  }

  const onPaint = (position, { first }) => {
    if (placingObject && selectedObject) {
      if (!first) return
      edit({ ...map, objectPlacements: { ...(map.objectPlacements ?? {}), [selectedObject.id]: position } })
      setPlacingObject(false)
      setStatus(`Moved ${selectedObject.name} to (${position.x}, ${position.y}).`)
      return
    }
    if (placingObjective !== null) {
      if (!first) return
      edit({ ...map, objectives: map.objectives.map((objective, index) => (index === placingObjective ? { ...objective, position } : objective)) })
      if (placingFromEditor) onObjectivePlaced(placingObjective)
      setPlacingObjective(null)
      setPlacingFromEditor(false)
      return
    }
    if (moving) {
      if (first) setMoveFrom({ ...position, markers: hasMarkers(map, position) })
      return
    }
    if (!tool || tool.startsWith('tile:')) {
      if (tool && placing) edit(paintBrush(map, position, tool.slice('tile:'.length), rotated))
      else if (first) selectAt(position)
      return
    }
    // Marker tools act on the pressed tile only, not on every tile dragged over.
    if (!first) return
    if (tool === 'npcs') onNpcTool(position)
    else if (tool === 'erase') edit(eraseMarkers(map, position))
    else if (tool === 'area') {
      const current = areaAt(map, position)?.name ?? ''
      askText({
        title: current ? 'Edit Area Label' : 'New Area Label',
        initialValue: current,
        placeholder: 'e.g. Tool Shed',
        removeLabel: current ? 'Remove' : null,
      }).then((name) => name !== null && edit(setAreaLabel(map, position, name)))
    } else edit(toggleMarker(map, tool, position))
  }

  // Move: what was picked up is dropped where the button is released (off the map: nothing moves). A tile with markers
  // on it moves its markers; any other tile swaps with the drop tile.
  const onPaintEnd = (position) => {
    if (!moving || !moveFrom) return
    setMoveFrom(null)
    if (!position || (position.x === moveFrom.x && position.y === moveFrom.y)) return
    if (moveFrom.markers) {
      const moved = moveMarkers(map, moveFrom, position)
      if (moved.error) return setStatus(moved.error)
      edit(moved.map)
      setStatus(`Moved markers from (${moveFrom.x}, ${moveFrom.y}) to (${position.x}, ${position.y}).`)
      return
    }
    const [from, to] = [map.tiles[moveFrom.y][moveFrom.x], map.tiles[position.y][position.x]]
    const swapped = swapTilesWithObjects(map, moveFrom, position, objectDefinitions)
    edit(swapped.map)
    setStatus(`Swapped ${getTile(from).label} (${moveFrom.x}, ${moveFrom.y}) with ${getTile(to).label} (${position.x}, ${position.y})${swapped.carried.length ? ', with its challenge object' : ''}.`)
  }

  // Right click: with Place Tiles on, the brush picks up the tile under the pointer, rotation included; otherwise an NPC,
  // player start or enemy spawn there turns 45° clockwise.
  const onRightClick = (position) => {
    if (!position) return
    if (!placing) {
      const turned = turnFacing(map, position)
      if (turned !== map) edit(turned)
      return
    }
    const tileId = map.tiles[position.y][position.x]
    setTool(`tile:${tileId}`)
    setRotated(isRotated(map, position))
    setStatus(`Brush: ${getTile(tileId).label}.`)
  }
  const onPlacingToggle = (on) => {
    setPlacing(on)
    if (on) setMoving(false)
    setMoveFrom(null)
  }
  const onMovingToggle = (on) => {
    setMoving(on)
    if (on) setPlacing(false)
    setMoveFrom(null)
  }

  return {
    tool,
    setTool,
    placing,
    moving,
    moveFrom,
    rotated,
    placingObjective,
    // The Objective Editor's Place on Map: wait for a tile click, then reopen the editor.
    placeObjectiveFromEditor: (index) => {
      setPlacingObjective(index)
      setPlacingFromEditor(true)
    },
    objectDefinitions,
    selection: { npc: selectedNpc, object: selectedObject, marker: markerInspected },
    selectedNpcId,
    selectedObjectId,
    // What the board highlights for the start / spawn inspector (null once it has moved or been deleted).
    selectedMarker: markerInspected && selectedMarker,
    movingNpc,
    toggleNpcMove: () => {
      setTool('npcs')
      setMovingNpc((value) => !value)
    },
    clearNpc: () => {
      setSelectedNpcId(null)
      setMovingNpc(false)
    },
    placingObject,
    toggleObjectPlace: () => setPlacingObject((value) => !value),
    clearMarker: () => setSelectedMarker(null),
    onPaint,
    onPaintEnd,
    onRightClick,
    onPlacingToggle,
    onMovingToggle,
  }
}
