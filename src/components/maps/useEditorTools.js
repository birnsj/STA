import { useEffect, useMemo, useState } from 'react'
import { MAX_AWAY_TEAM } from '../../exploration/awayTeam.js'
import { challengeDefinitionsFor } from '../../exploration/challengeObjects.js'
import { listAuthoredCharacters } from '../../character/authoredCharacters.js'
import {
  addPatrolWaypoint,
  areaAt,
  dependentsAt,
  destructibleAt,
  duplicateDestructible,
  duplicateGroundItem,
  eraseHazardTile,
  eraseMarkers,
  eraseStructure,
  groundItemAt,
  groundItemAtBoard,
  hasMarkers,
  hazardRegionAt,
  moveDestructible,
  moveGroundItem,
  moveMarkers,
  npcAt,
  paintBrush,
  paintFloor,
  paintHazardTile,
  placeDestructible,
  placeGroundItem,
  placeNpc,
  removeGroundItem,
  removePatrolWaypoint,
  selectionCandidates,
  setAreaLabel,
  swapTilesWithObjects,
  toggleMarker,
  turnFacing,
  updateDestructible,
  updatePatrolWaypoint,
  updateNpc,
} from '../../maps/mapEdits.js'
import { canEditLayer, layerOfTile, selectionPriority } from '../../maps/layers.js'
import { cellKey, getTile, isEmptyTile, isRotated, NULL_TILE } from '../../maps/mapFormat.js'
import { getItemById } from '../../rules/equipment.js'
import { DESTRUCTIBLE_TYPES } from '../../world/environment.js'
import { toggleCover, updateMapObject } from '../../world/objectAuthoring.js'

function markerLayersAt(map, position) {
  const layers = new Set()
  if (
    (map.npcs ?? []).some((npc) => npc.position.x === position.x && npc.position.y === position.y) ||
    [...(map.markers?.playerStarts ?? []), ...(map.markers?.enemySpawns ?? [])].some(
      (marker) => marker.x === position.x && marker.y === position.y,
    )
  ) {
    layers.add('characters')
  }
  if (
    (map.areas ?? []).some((area) => area.position.x === position.x && area.position.y === position.y) ||
    (map.objectives ?? []).some((objective) => objective.position?.x === position.x && objective.position?.y === position.y)
  ) {
    layers.add('markers')
  }
  return [...layers]
}

function cellAssemblyLayers(map, position, objectDefinitions) {
  const layers = new Set([layerOfTile(map.tiles[position.y][position.x])])
  const key = cellKey(position)
  if (map.floorUnder?.[key] != null) layers.add('ground')
  if (map.stackOver?.[key]?.length) layers.add('furniture')
  if (objectDefinitions.some((definition) => definition.position[0] === position.x && definition.position[1] === position.y)) {
    layers.add('furniture')
  }
  if (
    (map.groundItemPlacements ?? []).some((entry) => {
      const tile = entry.on?.tile
      return Array.isArray(tile) && tile[0] === position.x && tile[1] === position.y
    })
  ) {
    layers.add('furniture')
  }
  return [...layers]
}

// The map editor's tools: which tool is held, the board's click / drag / right-click behaviour for each, and what is
// selected for its inspector (an NPC, a player start or enemy spawn, a challenge object). It edits through edit(map) and
// never touches files or popups.
// map, edit(map), setStatus(text), askText(details): from the editor. boardKey: changes whenever a different map is put
// in front of the user, which clears the selection. suspended: a popup or full-screen editor is open, so the keys stand
// aside. onObjectivePlaced(index): an objective sent here by the Objective Editor was placed (or cancelled), so it reopens.
// itemGridSize: world-pixel snap for ground items (matches the toolbar guide grid; default 2 = play 32×32).
// layers: editor layer state from useEditorLayers (visibility / lock / active). beginStroke / endStroke: undo coalescing.
export default function useEditorTools({
  map,
  edit,
  setStatus,
  askText,
  boardKey,
  suspended,
  onObjectivePlaced,
  itemGridSize = 2,
  layers = null,
  beginStroke = null,
  endStroke = null,
}) {
  const [tool, setTool] = useState('tile:bulkhead')
  // Character Library "Use for placement": next Place NPC uses this id (otherwise the first catalogue entry).
  const [pendingCharacterId, setPendingCharacterId] = useState(null)
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
  // Patrol authoring for the selected NPC: Edit Patrol mode, selected waypoint index, Move Waypoint mode.
  const [editingPatrol, setEditingPatrol] = useState(false)
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState(null)
  const [movingWaypoint, setMovingWaypoint] = useState(false)
  // The player start or enemy spawn shown in its inspector ({ kind, x, y }), or null. Looked up by tile, so moving or
  // deleting it closes the inspector.
  const [selectedMarker, setSelectedMarker] = useState(null)
  // The challenge object shown in its inspector (an id), and whether the next board click moves it.
  const [selectedObjectId, setSelectedObjectId] = useState(null)
  const [placingObject, setPlacingObject] = useState(false)
  const [editingObjectCovers, setEditingObjectCovers] = useState(false)
  // Destructible objects and hazard regions (tools 'destructible:{type}', 'hazard:{type}', 'hazardErase'): the one in its
  // inspector, whether the next click moves the destructible, and the intensity the hazard brush paints.
  const [selectedDestructibleId, setSelectedDestructibleId] = useState(null)
  const [movingDestructible, setMovingDestructible] = useState(false)
  const [linkingDestructible, setLinkingDestructible] = useState(false)
  const [selectedHazardId, setSelectedHazardId] = useState(null)
  const [hazardIntensity, setHazardIntensity] = useState(2)
  // Inventory ground placements (tools 'inventory:{itemId}'): selected instance and Move mode.
  const [selectedGroundItemId, setSelectedGroundItemId] = useState(null)
  const [movingGroundItem, setMovingGroundItem] = useState(false)

  // A different map clears everything selected or half-done on the old one.
  const [seenBoardKey, setSeenBoardKey] = useState(boardKey)
  if (seenBoardKey !== boardKey) {
    setSeenBoardKey(boardKey)
    setSelectedDestructibleId(null)
    setMovingDestructible(false)
    setLinkingDestructible(false)
    setSelectedHazardId(null)
    setSelectedNpcId(null)
    setSelectedMarker(null)
    setPlacingObjective(null)
    setPlacingFromEditor(false)
    setSelectedObjectId(null)
    setPlacingObject(false)
    setEditingObjectCovers(false)
    setMovingNpc(false)
    setEditingPatrol(false)
    setSelectedWaypointIndex(null)
    setMovingWaypoint(false)
    setMoveFrom(null)
    setSelectedGroundItemId(null)
    setMovingGroundItem(false)
    setPendingCharacterId(null)
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
  const selectedDestructible = (map.destructibles ?? []).find((object) => object.id === selectedDestructibleId) ?? null
  const selectedHazard = (map.hazards ?? []).find((region) => region.id === selectedHazardId) ?? null
  const selectedGroundItem = (map.groundItemPlacements ?? []).find((entry) => entry.id === selectedGroundItemId) ?? null
  const clearLayerSelection = (layerId) => {
    if (layerId === 'furniture') {
      setSelectedObjectId(null)
      setPlacingObject(false)
      setEditingObjectCovers(false)
      setSelectedDestructibleId(null)
      setMovingDestructible(false)
      setLinkingDestructible(false)
      setSelectedHazardId(null)
      setSelectedGroundItemId(null)
      setMovingGroundItem(false)
    }
    if (layerId === 'characters') {
      setSelectedNpcId(null)
      setSelectedMarker(null)
      setMovingNpc(false)
      setEditingPatrol(false)
      setSelectedWaypointIndex(null)
      setMovingWaypoint(false)
    }
    if (layerId === 'markers') {
      setPlacingObjective(null)
      setPlacingFromEditor(false)
    }
    setMoveFrom(null)
  }
  // Tiles a destructible can't take: where challenge objects stand.
  const objectTiles = useMemo(() => objectDefinitions.map(({ position: [x, y] }) => ({ x, y })), [objectDefinitions])
  const duplicateSelected = () => {
    if (!selectedDestructible) return
    if (!canEditLayer(layers, 'furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
    const copy = duplicateDestructible(map, selectedDestructible.id, objectTiles)
    if (!copy) return setStatus('No free floor tile near it for the copy.')
    edit(copy.map)
    setSelectedDestructibleId(copy.object.id)
    setStatus(`Duplicated ${selectedDestructible.id} as ${copy.object.id} at (${copy.object.position.x}, ${copy.object.position.y}).`)
  }
  const duplicateSelectedGroundItem = () => {
    if (!selectedGroundItem) return
    if (!canEditLayer(layers, 'furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
    const copy = duplicateGroundItem(map, selectedGroundItem.id, itemGridSize)
    if (!copy) return setStatus('No free cell near it for the copy.')
    edit(copy.map)
    setSelectedGroundItemId(copy.object.id)
    setStatus(`Duplicated ${selectedGroundItem.id} as ${copy.object.id}.`)
  }

  // Escape puts the brush down (no tool selected, Place Tiles off), unless a popup is open (its own Escape cancels it)
  // or a text box has focus. R rotates the tile brush.
  useEffect(() => {
    if (suspended) return undefined
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea, select')) return
      if ((event.key === 'd' || event.key === 'D') && (event.ctrlKey || event.metaKey)) {
        if (selectedGroundItem) {
          event.preventDefault()
          duplicateSelectedGroundItem()
          return
        }
        if (!selectedDestructible) return
        event.preventDefault()
        return duplicateSelected()
      }
      if ((event.key === 'r' || event.key === 'R') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (placing && tool?.startsWith('tile:')) setRotated((value) => !value)
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && editingPatrol && selectedNpc && selectedWaypointIndex != null) {
        event.preventDefault()
        if (!canEditLayer(layers, 'characters')) return setStatus('NPCs / Characters layer is locked or hidden.')
        edit(removePatrolWaypoint(map, selectedNpc.id, selectedWaypointIndex))
        setSelectedWaypointIndex(null)
        setMovingWaypoint(false)
        setStatus('Removed patrol waypoint.')
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedGroundItem) {
        event.preventDefault()
        if (!canEditLayer(layers, 'furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
        edit(removeGroundItem(map, selectedGroundItem.id))
        setSelectedGroundItemId(null)
        setMovingGroundItem(false)
        setStatus(`Removed ${selectedGroundItem.id}.`)
        return
      }
      if (event.key !== 'Escape') return
      if (movingWaypoint) return setMovingWaypoint(false)
      if (editingPatrol) {
        setEditingPatrol(false)
        setSelectedWaypointIndex(null)
        return
      }
      if (linkingDestructible) return setLinkingDestructible(false)
      if (movingDestructible) return setMovingDestructible(false)
      if (movingGroundItem) return setMovingGroundItem(false)
      if (placingObject) return setPlacingObject(false)
      if (editingObjectCovers) return setEditingObjectCovers(false)
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
  })

  // Patrol edit: click a waypoint of the selected NPC to select it, or an empty floor tile to append one; Move Waypoint
  // relocates the selected point.
  const onPatrolEdit = (position) => {
    if (!selectedNpc) return false
    if (!canEditLayer(layers, 'characters')) {
      setStatus('NPCs / Characters layer is locked or hidden.')
      return true
    }
    const patrol = selectedNpc.patrol ?? []
    if (movingWaypoint && selectedWaypointIndex != null) {
      const moved = updatePatrolWaypoint(map, selectedNpc.id, selectedWaypointIndex, { at: position })
      if (moved === map) setStatus('Patrol waypoints stand on free floor tiles.')
      else {
        edit(moved)
        setStatus(`Moved W${selectedWaypointIndex + 1} to (${position.x}, ${position.y}).`)
      }
      setMovingWaypoint(false)
      return true
    }
    const hit = patrol.findIndex((point) => point.at.x === position.x && point.at.y === position.y)
    if (hit >= 0) {
      setSelectedWaypointIndex(hit)
      setStatus(`Selected W${hit + 1}.`)
      return true
    }
    if (editingPatrol) {
      const next = addPatrolWaypoint(map, selectedNpc.id, position)
      if (!next) {
        setStatus('Patrol waypoints stand on free floor tiles.')
        return true
      }
      edit(next)
      const count = next.npcs.find((npc) => npc.id === selectedNpc.id)?.patrol?.length ?? 0
      setSelectedWaypointIndex(count > 0 ? count - 1 : null)
      setStatus(`Added W${count} at (${position.x}, ${position.y}).`)
      return true
    }
    return false
  }

  // The NPC tool: click an NPC to select it, an empty floor tile to place a new one (or, while moving, to move the
  // selected one there).
  const onNpcTool = (position) => {
    if (onPatrolEdit(position)) return
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
    if (existing) {
      setSelectedNpcId(existing.id)
      setSelectedWaypointIndex(null)
      setMovingWaypoint(false)
      return
    }
    if (editingPatrol) return
    const characterId = pendingCharacterId || listAuthoredCharacters()[0]?.id || null
    const placed = placeNpc(map, position, characterId)
    if (!placed) return setStatus('NPCs stand on free floor tiles.')
    edit(placed.map)
    setSelectedNpcId(placed.npc.id)
    setPendingCharacterId(null)
    setEditingPatrol(false)
    setSelectedWaypointIndex(null)
  }

  const clearSelectionModes = () => {
    setPlacingObject(false)
    setEditingObjectCovers(false)
    setMovingNpc(false)
    setMovingDestructible(false)
    setLinkingDestructible(false)
    setMovingGroundItem(false)
  }

  const applyCandidate = (candidate, position) => {
    setSelectedNpcId(candidate?.kind === 'npc' ? candidate.npc.id : null)
    setSelectedMarker(
      candidate?.kind === 'playerStarts' || candidate?.kind === 'enemySpawns'
        ? { kind: candidate.kind, x: position.x, y: position.y }
        : null,
    )
    setSelectedObjectId(candidate?.kind === 'object' ? candidate.object.id : null)
    setSelectedDestructibleId(candidate?.kind === 'destructible' ? candidate.destructible.id : null)
    setSelectedHazardId(candidate?.kind === 'hazard' ? candidate.hazard.id : null)
    setSelectedGroundItemId(candidate?.kind === 'groundItem' ? candidate.groundItem.id : null)
    if (candidate?.kind !== 'npc') {
      setEditingPatrol(false)
      setSelectedWaypointIndex(null)
      setMovingWaypoint(false)
    }
  }

  // A click with no marker tool held (Place Tiles and Move off): select what stands on the tile for editing.
  // Layer-aware: hidden/locked layers are skipped; active layer is preferred; repeat clicks cycle candidates.
  const selectAt = (position, boardPoint = null) => {
    if (editingPatrol || movingWaypoint) {
      if (onPatrolEdit(position)) return
    }
    clearSelectionModes()
    const all = selectionCandidates(map, objectDefinitions, position, { cellPx: itemGridSize, boardPoint })
    const editable = all.filter((candidate) => {
      if (!candidate.layer) return true
      return canEditLayer(layers, candidate.layer)
    })
    if (!editable.length) {
      applyCandidate(null, position)
      return
    }
    // A click on a drawn item selects that item. The floor tile or crate under the same pointer is a different layer
    // entry and used to win when Ground was active, or tie with the item when Furniture was, so the box behind the
    // pointer was selected instead. Lock and hide still apply: a locked furniture layer has already dropped the item.
    const drawnItem = editable.find((candidate) => candidate.kind === 'groundItem')
    if (boardPoint && drawnItem) {
      applyCandidate(drawnItem, position)
      return
    }
    const priority = selectionPriority(layers?.active)
    const ranked = [...editable].sort((a, b) => {
      const ai = priority.indexOf(a.layer)
      const bi = priority.indexOf(b.layer)
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    })
    // Cycle when the click is on the same tile as the current selection.
    const currentIndex = ranked.findIndex((candidate) => {
      if (candidate.kind === 'npc') return candidate.npc.id === selectedNpcId
      if (candidate.kind === 'object') return candidate.object.id === selectedObjectId
      if (candidate.kind === 'destructible') return candidate.destructible.id === selectedDestructibleId
      if (candidate.kind === 'hazard') return candidate.hazard.id === selectedHazardId
      if (candidate.kind === 'groundItem') return candidate.groundItem.id === selectedGroundItemId
      if (candidate.kind === 'playerStarts' || candidate.kind === 'enemySpawns') {
        return selectedMarker?.kind === candidate.kind && selectedMarker.x === position.x && selectedMarker.y === position.y
      }
      return false
    })
    const next = ranked[(currentIndex + 1) % ranked.length]
    applyCandidate(next, position)
  }

  const layerAllowsTool = (layerId) => canEditLayer(layers, layerId)

  // The destructible tools: click a destructible to select it, a free floor tile to place one of the held type.
  const onDestructibleTool = (position, type) => {
    const existing = destructibleAt(map, position)
    if (existing) return setSelectedDestructibleId(existing.id)
    const placed = placeDestructible(map, position, type, objectTiles)
    if (!placed) return setStatus('Destructible objects stand on free floor tiles (not under a challenge object).')
    edit(placed.map)
    setSelectedDestructibleId(placed.object.id)
    setSelectedHazardId(null)
    setStatus(`Placed ${DESTRUCTIBLE_TYPES[type].name} (${placed.object.id}). Ctrl+D duplicates it.`)
  }

  // Inventory tools: a click places where the pointer is, including on top of an item. A successful place leaves the
  // brush selected and does not outline the new item. A click that cannot place selects the item under the pointer
  // so a full spot can still be inspected.
  const onInventoryTool = (position, itemId, boardPoint = null) => {
    const placed = placeGroundItem(map, position, itemId, itemGridSize)
    if (!placed) {
      const existing = boardPoint
        ? groundItemAtBoard(map, boardPoint)
        : groundItemAt(map, position, { cellPx: itemGridSize })
      if (existing) {
        setSelectedGroundItemId(existing.id)
        setSelectedDestructibleId(null)
        setSelectedHazardId(null)
        setSelectedNpcId(null)
        setSelectedMarker(null)
        setSelectedObjectId(null)
        return
      }
      return setStatus(`Inventory objects need a free floor cell (${itemGridSize}px grid).`)
    }
    edit(placed.map)
    setSelectedGroundItemId(null)
    setSelectedDestructibleId(null)
    setSelectedHazardId(null)
    const def = getItemById(itemId)
    setStatus(`Placed ${def?.name ?? itemId} (${placed.object.id}).`)
  }

  // boardPoint: the pointer in board px (EditorBoard), for picking items drawn on raised surfaces.
  const onPaint = (position, { first, boardPoint = null }) => {
    if (first) beginStroke?.()
    if ((editingPatrol || movingWaypoint) && selectedNpc && first) {
      if (onPatrolEdit(position)) return
    }
    // Picking linked tiles: each click adds or removes one (a force-field generator's field).
    if (linkingDestructible && selectedDestructible) {
      if (!first) return
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const linked = selectedDestructible.linkedTiles ?? []
      const has = linked.some((tile) => tile.x === position.x && tile.y === position.y)
      const linkedTiles = has ? linked.filter((tile) => tile.x !== position.x || tile.y !== position.y) : [...linked, position]
      edit(updateDestructible(map, selectedDestructible.id, { linkedTiles: linkedTiles.length ? linkedTiles : null }))
      setStatus(`${has ? 'Unlinked' : 'Linked'} (${position.x}, ${position.y}) ${has ? 'from' : 'to'} ${selectedDestructible.id}.`)
      return
    }
    if (movingDestructible && selectedDestructible) {
      if (!first) return
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const moved = moveDestructible(map, selectedDestructible.id, position, objectTiles)
      if (moved === map) setStatus('Destructible objects stand on free floor tiles (not under a challenge object).')
      edit(moved)
      setMovingDestructible(false)
      return
    }
    if (movingGroundItem && selectedGroundItem) {
      if (!first) return
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const moved = moveGroundItem(map, selectedGroundItem.id, position, itemGridSize)
      if (moved === map) setStatus(`Inventory objects need a free floor cell (${itemGridSize}px grid).`)
      else edit(moved)
      setMovingGroundItem(false)
      return
    }
    if (tool?.startsWith('inventory:')) {
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      if (first) onInventoryTool(position, tool.slice('inventory:'.length), boardPoint)
      return
    }
    if (tool?.startsWith('destructible:')) {
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      if (first) onDestructibleTool(position, tool.slice('destructible:'.length))
      return
    }
    // The hazard brushes paint (or erase) every tile dragged over. Visibility/lock follows Furniture.
    if (tool?.startsWith('hazard:')) {
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const painted = paintHazardTile(map, position, tool.slice('hazard:'.length), hazardIntensity)
      if (painted !== map) edit(painted)
      setSelectedHazardId(hazardRegionAt(painted, position)?.id ?? null)
      setSelectedDestructibleId(null)
      return
    }
    if (tool === 'hazardErase') {
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const erased = eraseHazardTile(map, position)
      if (erased !== map) edit(erased)
      return
    }
    if (placingObject && selectedObject) {
      if (!first) return
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      if (isEmptyTile(map.tiles[position.y][position.x])) return setStatus('Challenge objects must be placed on a map tile.')
      edit({ ...map, objectPlacements: { ...(map.objectPlacements ?? {}), [selectedObject.id]: position } })
      setPlacingObject(false)
      setStatus(`Moved ${selectedObject.name} to (${position.x}, ${position.y}).`)
      return
    }
    if (editingObjectCovers && selectedObject) {
      if (!first) return
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const [ox, oy] = selectedObject.position
      if (position.x === ox && position.y === oy) {
        setStatus('The object tile itself cannot be a cover.')
        return
      }
      edit(updateMapObject(map, selectedObject.id, (object) => toggleCover(object, [position.x, position.y])))
      return
    }
    if (placingObjective !== null) {
      if (!first) return
      if (!layerAllowsTool('markers')) return setStatus('Markers / Triggers layer is locked or hidden.')
      if (isEmptyTile(map.tiles[position.y][position.x])) return setStatus('Objective markers must be placed on a map tile.')
      edit({ ...map, objectives: map.objectives.map((objective, index) => (index === placingObjective ? { ...objective, position } : objective)) })
      if (placingFromEditor) onObjectivePlaced(placingObjective)
      setPlacingObjective(null)
      setPlacingFromEditor(false)
      return
    }
    if (moving) {
      if (first) setMoveFrom({ ...position, markers: hasMarkers(map, position), destructible: destructibleAt(map, position)?.id ?? null })
      return
    }
    if (tool === 'eraseFloor') {
      if (!layerAllowsTool('ground')) return setStatus('Ground / Floors layer is locked or hidden.')
      const result = paintFloor(map, position, NULL_TILE, objectDefinitions)
      if (result.error) setStatus(result.error)
      else if (result.map !== map) edit(result.map)
      return
    }
    if (tool === 'eraseStructure') {
      const tileLayer = layerOfTile(map.tiles[position.y][position.x])
      if (!layerAllowsTool(tileLayer === 'furniture' ? 'furniture' : 'walls')) {
        return setStatus('That layer is locked or hidden.')
      }
      const result = eraseStructure(map, position)
      if (result.error) setStatus(result.error)
      else if (result.map !== map) edit(result.map)
      return
    }
    if (!tool || tool.startsWith('tile:')) {
      if (tool && placing) {
        const tileId = tool.slice('tile:'.length)
        const tileLayer = layerOfTile(tileId)
        if (!layerAllowsTool(tileLayer)) return setStatus(`${tileLayer} layer is locked or hidden.`)
        // Ground-layer tiles use paintFloor so walls keep their floorUnder memory.
        if (tileLayer === 'ground') {
          const result = paintFloor(map, position, tileId, objectDefinitions)
          if (result.error) setStatus(result.error)
          else if (result.map !== map) edit(result.map)
        } else {
          const painted = paintBrush(map, position, tileId, rotated, objectDefinitions)
          if (painted === map && getTile(tileId).solid && dependentsAt(map, position, objectDefinitions).some((entry) => entry.kind !== 'prop' && entry.kind !== 'object')) {
            setStatus('Move or remove the occupants before painting a solid tile.')
          } else {
            edit(painted)
          }
        }
      } else if (first) selectAt(position, boardPoint)
      return
    }
    // Marker tools act on the pressed tile only, not on every tile dragged over.
    if (!first) return
    if (tool === 'npcs') {
      if (!layerAllowsTool('characters')) return setStatus('NPCs / Characters layer is locked or hidden.')
      onNpcTool(position)
    } else if (tool === 'erase') {
      const characters = layerAllowsTool('characters')
      const markers = layerAllowsTool('markers')
      if (!characters && !markers) {
        return setStatus('Characters and Markers layers are locked or hidden.')
      }
      edit(eraseMarkers(map, position, { characters, markers }))
    } else if (tool === 'area') {
      if (!layerAllowsTool('markers')) return setStatus('Markers / Triggers layer is locked or hidden.')
      const current = areaAt(map, position)?.name ?? ''
      askText({
        title: current ? 'Edit Area Label' : 'New Area Label',
        initialValue: current,
        placeholder: 'e.g. Tool Shed',
        removeLabel: current ? 'Remove' : null,
      }).then((name) => name !== null && edit(setAreaLabel(map, position, name)))
    } else if (tool === 'playerStarts' || tool === 'enemySpawns') {
      if (!layerAllowsTool('characters')) return setStatus('NPCs / Characters layer is locked or hidden.')
      const list = map.markers[tool] ?? []
      const exists = list.some((marker) => marker.x === position.x && marker.y === position.y)
      if (tool === 'playerStarts' && !exists && list.length >= MAX_AWAY_TEAM) {
        setStatus(`A map holds ${MAX_AWAY_TEAM} player starts.`)
        return
      }
      edit(toggleMarker(map, tool, position))
    } else {
      edit(toggleMarker(map, tool, position))
    }
  }

  // Move: what was picked up is dropped where the button is released (off the map: nothing moves). A tile with markers
  // on it moves its markers; any other tile swaps with the drop tile.
  const onPaintEnd = (position) => {
    endStroke?.()
    if (!moving || !moveFrom) return
    setMoveFrom(null)
    if (!position || (position.x === moveFrom.x && position.y === moveFrom.y)) return
    // A destructible object goes before markers and tiles: the Move tool carries it alone.
    if (moveFrom.destructible) {
      if (!layerAllowsTool('furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
      const moved = moveDestructible(map, moveFrom.destructible, position, objectTiles)
      if (moved === map) return setStatus('Destructible objects stand on free floor tiles (not under a challenge object).')
      edit(moved)
      setStatus(`Moved ${moveFrom.destructible} to (${position.x}, ${position.y}).`)
      return
    }
    if (moveFrom.markers) {
      const blockedLayer = markerLayersAt(map, moveFrom).find((layerId) => !layerAllowsTool(layerId))
      if (blockedLayer) return setStatus(`${blockedLayer === 'characters' ? 'NPCs / Characters' : 'Markers / Triggers'} layer is locked or hidden.`)
      const moved = moveMarkers(map, moveFrom, position)
      if (moved.error) return setStatus(moved.error)
      edit(moved.map)
      setStatus(`Moved markers from (${moveFrom.x}, ${moveFrom.y}) to (${position.x}, ${position.y}).`)
      return
    }
    const blockedLayer = [...cellAssemblyLayers(map, moveFrom, objectDefinitions), ...cellAssemblyLayers(map, position, objectDefinitions)].find(
      (layerId) => !layerAllowsTool(layerId),
    )
    if (blockedLayer) return setStatus('A layer in that tile assembly is locked or hidden.')
    const [from, to] = [map.tiles[moveFrom.y][moveFrom.x], map.tiles[position.y][position.x]]
    const swapped = swapTilesWithObjects(map, moveFrom, position, objectDefinitions)
    if (swapped.error) return setStatus(swapped.error)
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

  const clearBoardSelection = () => {
    setSelectedDestructibleId(null)
    setMovingDestructible(false)
    setLinkingDestructible(false)
    setSelectedHazardId(null)
    setSelectedNpcId(null)
    setSelectedMarker(null)
    setSelectedObjectId(null)
    setPlacingObject(false)
    setEditingObjectCovers(false)
    setMovingNpc(false)
    setEditingPatrol(false)
    setSelectedWaypointIndex(null)
    setMovingWaypoint(false)
    setSelectedGroundItemId(null)
    setMovingGroundItem(false)
  }

  // Assets thumbnail pick: clear board selection so Properties shows the catalogue asset.
  const selectTool = (next) => {
    clearBoardSelection()
    setTool(next)
  }

  return {
    tool,
    setTool,
    selectTool,
    clearBoardSelection,
    clearLayerSelection,
    placing,
    moving,
    moveFrom,
    rotated,
    pendingCharacterId,
    setPendingCharacterId,
    placingObjective,
    // The Objective Editor's Place on Map: wait for a tile click, then reopen the editor.
    placeObjectiveFromEditor: (index) => {
      setPlacingObjective(index)
      setPlacingFromEditor(true)
    },
    objectDefinitions,
    selection: {
      npc: selectedNpc,
      object: selectedObject,
      marker: markerInspected,
      destructible: selectedDestructible,
      hazard: selectedHazard,
      groundItem: selectedGroundItem,
    },
    selectedNpcId,
    selectedObjectId,
    // What the board highlights for the start / spawn inspector (null once it has moved or been deleted).
    selectedMarker: markerInspected && selectedMarker,
    movingNpc,
    toggleNpcMove: () => {
      setTool('npcs')
      setEditingPatrol(false)
      setMovingWaypoint(false)
      setMovingNpc((value) => !value)
    },
    editingPatrol,
    movingWaypoint,
    selectedWaypointIndex,
    togglePatrolEdit: () => {
      setTool('npcs')
      setMovingNpc(false)
      setMovingWaypoint(false)
      setEditingPatrol((value) => {
        if (value) setSelectedWaypointIndex(null)
        return !value
      })
    },
    toggleMoveWaypoint: () => {
      if (selectedWaypointIndex == null) return
      setMovingNpc(false)
      setMovingWaypoint((value) => !value)
    },
    selectWaypoint: (index) => {
      setSelectedWaypointIndex(index)
      setMovingWaypoint(false)
    },
    clearWaypoint: () => {
      setSelectedWaypointIndex(null)
      setMovingWaypoint(false)
    },
    selectedDestructibleId: selectedDestructible?.id ?? null,
    selectedHazardId: selectedHazard?.id ?? null,
    selectedGroundItemId: selectedGroundItem?.id ?? null,
    movingDestructible,
    toggleDestructibleMove: () => {
      setLinkingDestructible(false)
      setMovingDestructible((value) => !value)
    },
    linkingDestructible,
    toggleDestructibleLink: () => {
      setMovingDestructible(false)
      setLinkingDestructible((value) => !value)
    },
    movingGroundItem,
    toggleGroundItemMove: () => setMovingGroundItem((value) => !value),
    duplicateDestructible: duplicateSelected,
    duplicateGroundItem: duplicateSelectedGroundItem,
    clearDestructible: () => {
      setSelectedDestructibleId(null)
      setMovingDestructible(false)
      setLinkingDestructible(false)
    },
    clearGroundItem: () => {
      setSelectedGroundItemId(null)
      setMovingGroundItem(false)
    },
    clearHazard: () => setSelectedHazardId(null),
    hazardIntensity,
    setHazardIntensity,
    clearNpc: () => {
      setSelectedNpcId(null)
      setMovingNpc(false)
      setEditingPatrol(false)
      setSelectedWaypointIndex(null)
      setMovingWaypoint(false)
    },
    placingObject,
    toggleObjectPlace: () => {
      setEditingObjectCovers(false)
      setPlacingObject((value) => !value)
    },
    editingObjectCovers,
    toggleObjectCovers: () => {
      setPlacingObject(false)
      setEditingObjectCovers((value) => !value)
    },
    clearMarker: () => setSelectedMarker(null),
    onPaint,
    onPaintEnd,
    onRightClick,
    onPlacingToggle,
    onMovingToggle,
  }
}
