// The map editor's Controls help, as the side panel shows it. Static text, kept apart so a tool's change is one edit here.
export default function EditorControlsHelp() {
  return (
    <>
      <p className="me-heading">Controls</p>
      <p className="me-text">
        Place Tiles on, left click or drag: paint the chosen tile (a long wall lays both of its tiles). Right click: pick up the
        tile under the pointer as the brush. Place Tiles off, right click an NPC, player start or enemy spawn: turn it 45°
        clockwise (the arrow shows which way it faces). Red: enemies and hostile NPCs (Wary, Hostile, Aggressive); purple:
        other NPCs. R: rotate the tile brush (long walls run the other way, other tiles are mirrored).
        Move on, drag a tile onto another: the two swap places; a tile with a player start, enemy spawn, NPC, label or
        objective on it moves those instead. Marker tools: click to place, click again to
        remove. NPC: click a floor tile to place one, click an NPC to edit it in the panel on the right. No marker tool (and Place
        Tiles and Move off): click an NPC, player start or enemy spawn to edit it (an NPC standing on one opens both). Escape: put the tool down.
        Right drag or WASD: pan. Wheel: zoom.
      </p>
    </>
  )
}
