import { challengeDefinitionsFor } from '../../exploration/challengeObjects.js'
import { facingTowardCentre } from '../../maps/facing.js'
import { removeNpc, setFacing, toggleMarker, updateNpc } from '../../maps/mapEdits.js'
import MarkerInspector from './MarkerInspector.jsx'
import NpcInspector from './NpcInspector.jsx'
import ObjectInspector from './ObjectInspector.jsx'

// The map editor's side-panel inspectors for what is selected on the board: an NPC, a challenge object, and a player
// start or enemy spawn (an NPC standing on a start or spawn opens both). map and edit(map): the map being edited.
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
  onMarkerCleared,
}) {
  const { npc, object, marker } = selection
  return (
    <>
      {npc && (
        <NpcInspector
          npc={npc}
          conversations={conversations}
          moving={npcMoving}
          onChange={(changes) => edit(updateNpc(map, npc.id, changes))}
          onFacing={(facing) => edit(setFacing(map, npc.position, facing))}
          onMove={onToggleNpcMove}
          onDelete={() => {
            edit(removeNpc(map, npc.id))
            onNpcCleared()
          }}
          onEditConversation={onEditConversation}
        />
      )}
      {!npc && tool === 'npcs' && <p className="me-text">NPC tool: click a floor tile to place an NPC, or click an NPC to edit it.</p>}
      {object && (
        <ObjectInspector
          definition={object}
          home={challengeDefinitionsFor({ ...map, objectPlacements: {} }).find((definition) => definition.id === object.id).position}
          placing={objectPlacing}
          onPlace={onToggleObjectPlace}
          onReset={() => {
            const { [object.id]: _reset, ...rest } = map.objectPlacements ?? {}
            edit({ ...map, objectPlacements: rest })
          }}
        />
      )}
      {marker && (
        <MarkerInspector
          marker={marker}
          defaultFacing={facingTowardCentre(map, marker)}
          onFacing={(facing) => edit(setFacing(map, marker, facing))}
          onDelete={() => {
            edit(toggleMarker(map, marker.kind, marker))
            onMarkerCleared()
          }}
        />
      )}
    </>
  )
}
