import { assignNpcAppearances } from '../../character/npcAppearance.js'
import { challengeDefinitionsFor } from '../../exploration/challengeObjects.js'
import { facingTowardCentre } from '../../maps/facing.js'
import { canEditLayer } from '../../maps/layers.js'
import {
  clearNpcPatrol,
  removeDestructible,
  removeGroundItem,
  removeHazard,
  removeNpc,
  reorderPatrolWaypoint,
  removePatrolWaypoint,
  setFacing,
  toggleMarker,
  moveGroundItem,
  updateDestructible,
  updateGroundItem,
  updateHazard,
  updateNpc,
  updatePatrolWaypoint,
} from '../../maps/mapEdits.js'
import DestructibleInspector from './DestructibleInspector.jsx'
import GroundItemInspector from './GroundItemInspector.jsx'
import HazardInspector from './HazardInspector.jsx'
import MarkerInspector from './MarkerInspector.jsx'
import NpcInspector from './NpcInspector.jsx'
import ObjectInspector from './ObjectInspector.jsx'

// How an NPC looks in play ({ genderId, portraitId, backdropId } or null): the same picks exploration makes for the
// whole map.
function appearanceFor(map, npcId) {
  const npcs = map.npcs ?? []
  const appearances = assignNpcAppearances(npcs.map((npc) => ({ key: npc.id, characterId: npc.characterId, gender: npc.gender ?? null, portraitId: npc.portraitId ?? null })))
  return appearances[npcs.findIndex((npc) => npc.id === npcId)] ?? null
}

// The map editor's side-panel inspectors for what is selected on the board: a destructible object, a hazard region, an
// NPC, a challenge object, and a player start or enemy spawn (an NPC standing on a start or spawn opens both). map and edit(map): the map being edited.
// selection: { npc, object, marker } (each null when nothing of that kind is selected). Each inspector's own state comes
// from the tools hook (useEditorTools): npcMoving / objectPlacing, with a toggle for each, and onNpcCleared / onMarkerCleared
// for when deleting closes the inspector.
export default function EditorInspectors({
  map,
  edit,
  tool,
  conversations,
  selection,
  npcMoving,
  onToggleNpcMove,
  onNpcCleared,
  onEditConversation,
  objectPlacing,
  onToggleObjectPlace,
  objectEditingCovers = false,
  onToggleObjectCovers,
  onOpenObjectEditor,
  onMarkerCleared,
  destructibleMoving = false,
  onToggleDestructibleMove,
  destructibleLinking = false,
  onToggleDestructibleLink,
  onDuplicateDestructible,
  onDestructibleCleared,
  groundItemMoving = false,
  onToggleGroundItemMove,
  onDuplicateGroundItem,
  onGroundItemCleared,
  onHazardCleared,
  editingPatrol = false,
  movingWaypoint = false,
  selectedWaypointIndex = null,
  onTogglePatrolEdit,
  onToggleMoveWaypoint,
  onSelectWaypoint,
  onWaypointCleared,
  layers = null,
  onStatus = null,
}) {
  const { npc, object, marker, destructible, hazard, groundItem } = selection
  const mutate = (layerId, change) => {
    if (canEditLayer(layers, layerId)) edit(change())
  }
  return (
    <>
      {destructible && (
        <DestructibleInspector
          object={destructible}
          moving={destructibleMoving}
          linking={destructibleLinking}
          onChange={(changes) => mutate('furniture', () => updateDestructible(map, destructible.id, changes))}
          onMove={onToggleDestructibleMove}
          onLink={onToggleDestructibleLink}
          onDuplicate={onDuplicateDestructible}
          onDelete={() => {
            if (!canEditLayer(layers, 'furniture')) return
            edit(removeDestructible(map, destructible.id))
            onDestructibleCleared()
          }}
        />
      )}
      {groundItem && (
        <GroundItemInspector
          object={groundItem}
          map={map}
          moving={groundItemMoving}
          onChange={(changes) => mutate('furniture', () => updateGroundItem(map, groundItem.id, changes))}
          onPositionChange={(position) => mutate('furniture', () => moveGroundItem(map, groundItem.id, position))}
          onMove={onToggleGroundItemMove}
          onDuplicate={onDuplicateGroundItem}
          onStatus={onStatus}
          onDelete={() => {
            if (!canEditLayer(layers, 'furniture')) return
            edit(removeGroundItem(map, groundItem.id))
            onGroundItemCleared()
          }}
        />
      )}
      {hazard && (
        <HazardInspector
          region={hazard}
          onChange={(changes) => mutate('furniture', () => updateHazard(map, hazard.id, changes))}
          onDelete={() => {
            if (!canEditLayer(layers, 'furniture')) return
            edit(removeHazard(map, hazard.id))
            onHazardCleared()
          }}
        />
      )}
      {npc && (
        <NpcInspector
          npc={npc}
          appearance={appearanceFor(map, npc.id)}
          conversations={conversations}
          moving={npcMoving}
          onChange={(changes) => mutate('characters', () => updateNpc(map, npc.id, changes))}
          onFacing={(facing) => mutate('characters', () => setFacing(map, npc.position, facing))}
          onMove={onToggleNpcMove}
          onDelete={() => {
            if (!canEditLayer(layers, 'characters')) return
            edit(removeNpc(map, npc.id))
            onNpcCleared()
          }}
          onEditConversation={onEditConversation}
          editingPatrol={editingPatrol}
          movingWaypoint={movingWaypoint}
          selectedWaypointIndex={selectedWaypointIndex}
          onTogglePatrolEdit={onTogglePatrolEdit}
          onToggleMoveWaypoint={onToggleMoveWaypoint}
          onSelectWaypoint={onSelectWaypoint}
          onChangeWaypoint={(index, changes) => mutate('characters', () => updatePatrolWaypoint(map, npc.id, index, changes))}
          onReorderWaypoint={(from, to) => {
            if (!canEditLayer(layers, 'characters')) return
            edit(reorderPatrolWaypoint(map, npc.id, from, to))
            onSelectWaypoint(to)
          }}
          onDeleteWaypoint={(index) => {
            if (!canEditLayer(layers, 'characters')) return
            edit(removePatrolWaypoint(map, npc.id, index))
            onWaypointCleared()
          }}
          onClearPatrol={() => {
            if (!canEditLayer(layers, 'characters')) return
            edit(clearNpcPatrol(map, npc.id))
            onWaypointCleared()
          }}
        />
      )}
      {!npc && tool === 'npcs' && <p className="me-text">NPC tool: click a floor tile to place an NPC, or click an NPC to edit it.</p>}
      {object && (
        <ObjectInspector
          definition={object}
          home={challengeDefinitionsFor({ ...map, objectPlacements: {} }).find((definition) => definition.id === object.id)?.position ?? object.position}
          mapOwned={Array.isArray(map.objects)}
          placing={objectPlacing}
          editingCovers={objectEditingCovers}
          onPlace={onToggleObjectPlace}
          onEditCovers={onToggleObjectCovers}
          onOpenEditor={() => onOpenObjectEditor?.(object.id)}
          onReset={() => {
            const { [object.id]: _reset, ...rest } = map.objectPlacements ?? {}
            mutate('furniture', () => ({ ...map, objectPlacements: rest }))
          }}
        />
      )}
      {marker && (
        <MarkerInspector
          marker={marker}
          defaultFacing={facingTowardCentre(map, marker)}
          onFacing={(facing) => mutate('characters', () => setFacing(map, marker, facing))}
          onDelete={() => {
            if (!canEditLayer(layers, 'characters')) return
            edit(toggleMarker(map, marker.kind, marker))
            onMarkerCleared()
          }}
        />
      )}
    </>
  )
}
